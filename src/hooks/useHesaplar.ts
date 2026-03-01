import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { Hesap, HesapInsert, HesapUpdate } from '@/types/database';
import { invalidateRelatedQueries } from '@/lib/queryKeys';
import { toNumber, safeParseAmount, safeParseExchangeRate, calculateTargetAmount } from '@/lib/currency';
import { useSettings } from './useSettings';
import { useExchangeRates, convertCurrency } from './useExchangeRates';

export function useHesaplar(includePassive: boolean = false, includeArchived: boolean = false) {
  const { isletme, isletmeLoading } = useAuthContext();

  const query = useQuery({
    queryKey: ['hesaplar', isletme?.id, includePassive, includeArchived],
    queryFn: async () => {
      if (!isletme) return [];

      let queryBuilder = supabase
        .from('hesaplar')
        .select('*')
        .eq('isletme_id', isletme.id)
        .order('created_at', { ascending: true });

      // Arşivlenmiş hesapları dahil et veya hariç tut
      if (!includeArchived) {
        queryBuilder = queryBuilder.eq('is_archived', false);
      }

      // Sadece aktif hesapları getir (varsayılan davranış)
      if (!includePassive) {
        queryBuilder = queryBuilder.eq('is_active', true);
      }

      const { data, error } = await queryBuilder;

      if (error) throw error;
      return data as Hesap[];
    },
    enabled: !!isletme,
    staleTime: 10 * 60 * 1000, // 10 dk - mutation'lar zaten invalidate eder
    gcTime: 30 * 60 * 1000,    // 30 dk cache
  });

  // isletme henüz yükleniyorsa loading olarak göster
  return {
    ...query,
    isLoading: query.isLoading || isletmeLoading,
  };
}

export function useHesap(id: string | undefined) {
  return useQuery({
    queryKey: ['hesap', id],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('hesaplar')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Hesap;
    },
    enabled: !!id,
  });
}

export function useCreateHesap() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: Omit<HesapInsert, 'isletme_id'>) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      const { data, error } = await supabase
        .from('hesaplar')
        .insert({ ...input, isletme_id: isletme.id })
        .select()
        .single();

      if (error) throw error;
      return data as Hesap;
    },
    onSuccess: () => {
      // Merkezi invalidation helper kullan
      invalidateRelatedQueries(queryClient, 'hesap');
    },
  });
}

export function useUpdateHesap() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: HesapUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('hesaplar')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Hesap;
    },
    onSuccess: () => {
      // Merkezi invalidation helper kullan
      invalidateRelatedQueries(queryClient, 'hesap');
    },
  });
}

export function useDeleteHesap() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      // Önce hesabın bu işletmeye ait olduğunu doğrula
      const { data: hesap, error: checkError } = await supabase
        .from('hesaplar')
        .select('id')
        .eq('id', id)
        .eq('isletme_id', isletme.id)
        .single();

      if (checkError || !hesap) {
        throw new Error('Hesap bulunamadı veya erişim yetkiniz yok');
      }

      // 0. Bu hesapla ilişkili ileri tarihli işlemleri sil
      const { error: ileriIslemError } = await supabase
        .from('ileri_tarihli_islemler')
        .delete()
        .eq('isletme_id', isletme.id)
        .or(`hesap_id.eq.${id},hedef_hesap_id.eq.${id}`);

      if (ileriIslemError) {
        throw new Error(`İleri tarihli işlemler silinemedi: ${ileriIslemError.message}`);
      }

      // 1. Bu hesapla ilişkili tüm işlemleri bul
      const { data: relatedIslemler } = await supabase
        .from('islemler')
        .select('id, type, amount, hesap_id, hedef_hesap_id, exchange_rate, source_currency, target_currency')
        .eq('isletme_id', isletme.id)
        .or(`hesap_id.eq.${id},hedef_hesap_id.eq.${id}`);

      // 2. Etkilenecek diğer hesap ID'lerini bul
      const affectedHesapIds = new Set<string>();
      relatedIslemler?.forEach(islem => {
        if (islem.hesap_id && islem.hesap_id !== id) {
          affectedHesapIds.add(islem.hesap_id);
        }
        if (islem.hedef_hesap_id && islem.hedef_hesap_id !== id) {
          affectedHesapIds.add(islem.hedef_hesap_id);
        }
      });

      // 3. Etkilenen hesapların initial_balance'ını kaydet (NULL ise hesapla)
      // Bu sayede işlemler silindikten sonra bile doğru initial_balance korunur
      for (const hesapId of affectedHesapIds) {
        const { data: affectedHesap } = await supabase
          .from('hesaplar')
          .select('id, balance, initial_balance')
          .eq('id', hesapId)
          .single();

        if (affectedHesap && (affectedHesap.initial_balance === null || affectedHesap.initial_balance === undefined)) {
          // Bu hesabın işlemlerini al ve initial_balance hesapla
          const { data: hesapIslemleri } = await supabase
            .from('islemler')
            .select('type, amount, hesap_id, hedef_hesap_id, exchange_rate, source_currency, target_currency')
            .eq('isletme_id', isletme.id)
            .or(`hesap_id.eq.${hesapId},hedef_hesap_id.eq.${hesapId}`);

          let totalEffect = 0;
          let skippedCount = 0; // Atlanan işlem sayısı
          hesapIslemleri?.forEach(islem => {
            // Güvenli tutar parse etme - geçersiz değerler atlanır
            let amount: number;
            try {
              amount = safeParseAmount(islem.amount, 'işlem tutarı');
            } catch {
              // Geçersiz tutarlı işlemleri atla (veri bütünlüğü sorunu var demek)
              skippedCount++;
              if (__DEV__) {
                console.warn('Geçersiz işlem tutarı atlandı:', islem);
              }
              return;
            }

            // Exchange rate güvenli parse etme
            const exchangeRate = safeParseExchangeRate(islem.exchange_rate);

            if (islem.type === 'transfer') {
              if (islem.hedef_hesap_id === hesapId) {
                // Cross-currency hesaplama
                const sourceCurrency = islem.source_currency || 'TRY';
                const targetCurrency = islem.target_currency || 'TRY';

                const targetAmount = calculateTargetAmount(
                  amount,
                  exchangeRate,
                  sourceCurrency,
                  targetCurrency
                );
                totalEffect += targetAmount;
              } else {
                totalEffect -= amount;
              }
            } else if (islem.type === 'gelir' || islem.type === 'cari_tahsilat' || islem.type === 'personel_tahsilat') {
              totalEffect += amount;
            } else if (islem.type === 'gider' || islem.type === 'cari_odeme' || islem.type === 'personel_odeme') {
              totalEffect -= amount;
            }
          });

          const calculatedInitialBalance = toNumber(affectedHesap.balance) - totalEffect;

          // Eğer işlem atlandıysa, initial_balance doğru olmayabilir - sadece log
          if (skippedCount > 0 && __DEV__) {
            console.warn(
              `[useHesaplar] ${skippedCount} işlem atlandı, initial_balance yanlış olabilir:`,
              { hesapId, calculatedInitialBalance, skippedCount }
            );
          }

          // initial_balance'ı kaydet (atlanmış işlemler varsa bile - en iyi tahmin)
          await supabase
            .from('hesaplar')
            .update({ initial_balance: calculatedInitialBalance })
            .eq('id', hesapId)
            .eq('isletme_id', isletme.id);
        }
      }

      // 4. İşlemleri sil (bakiyeler otomatik geri alınacak - bu normal davranış)
      const { error: islemError1 } = await supabase
        .from('islemler')
        .delete()
        .eq('hesap_id', id)
        .eq('isletme_id', isletme.id);

      if (islemError1) throw islemError1;

      const { error: islemError2 } = await supabase
        .from('islemler')
        .delete()
        .eq('hedef_hesap_id', id)
        .eq('isletme_id', isletme.id);

      if (islemError2) throw islemError2;

      // 5. Hesabı sil
      const { error } = await supabase
        .from('hesaplar')
        .delete()
        .eq('id', id)
        .eq('isletme_id', isletme.id);

      if (error) throw error;
    },
    onSuccess: () => {
      // Merkezi invalidation helper kullan
      invalidateRelatedQueries(queryClient, 'hesap');
    },
  });
}

// Toplam bakiye hesapla (döviz çevrimi ile ana para birimine dönüştür)
export function useTotalBalance() {
  const { data: hesaplar } = useHesaplar();
  const { currency: baseCurrency } = useSettings();
  const { data: exchangeRatesData } = useExchangeRates();
  const exchangeRates = exchangeRatesData?.rates;

  const total = hesaplar?.reduce((acc, h) => {
    const accountCurrency = h.currency || baseCurrency;
    const balance = toNumber(h.balance);
    if (accountCurrency === baseCurrency) {
      return acc + balance;
    }
    // Döviz kuru ile çevir, bulunamazsa orijinal bakiyeyi kullan
    const converted = convertCurrency(balance, accountCurrency, baseCurrency, exchangeRates);
    return acc + (converted ?? balance);
  }, 0) ?? 0;

  return total;
}
