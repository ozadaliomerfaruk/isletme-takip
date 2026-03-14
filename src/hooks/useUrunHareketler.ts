import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { UrunHareket, UrunHareketInsert, UrunHareketTipi, IslemType, KdvOrani } from '@/types/database';
import { invalidateRelatedQueries, queryKeys } from '@/lib/queryKeys';
import i18n from '@/i18n';

/**
 * Urun hareketi ile birlikte cari bilgisi
 */
export interface UrunHareketWithCari extends UrunHareket {
  cari?: {
    id: string;
    name: string;
    type: 'musteri' | 'tedarikci';
  } | null;
}

/**
 * Bir ürüne ait urun hareketlerini getir (cari bilgisi dahil)
 */
export function useUrunHareketler(urunId: string | undefined) {
  const { isletme, isletmeLoading } = useAuthContext();

  const result = useQuery({
    queryKey: queryKeys.urunHareketler.byUrun(urunId || '', isletme?.id || ''),
    queryFn: async () => {
      if (!isletme || !urunId) return [];

      // İlk olarak urun hareketlerini al
      const { data: hareketler, error } = await supabase
        .from('urun_hareketler')
        .select('*')
        .eq('isletme_id', isletme.id)
        .eq('urun_id', urunId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!hareketler || hareketler.length === 0) return [];

      // islem_id'leri topla
      const islemIds = hareketler
        .filter(h => h.islem_id)
        .map(h => h.islem_id as string);

      // Eğer hiç islem_id yoksa direkt döndür
      if (islemIds.length === 0) {
        return hareketler.map(h => ({ ...h, cari: null })) as UrunHareketWithCari[];
      }

      // İşlemleri ve carilerini al
      const { data: islemler, error: islemError } = await supabase
        .from('islemler')
        .select('id, cari_id, cariler(id, name, type)')
        .in('id', islemIds);

      if (islemError) {
        console.error('Error fetching islemler for cari info:', islemError);
        return hareketler.map(h => ({ ...h, cari: null })) as UrunHareketWithCari[];
      }

      // islem_id -> cari mapping oluştur
      const islemCariMap = new Map<string, { id: string; name: string; type: 'musteri' | 'tedarikci' } | null>();
      islemler?.forEach(islem => {
        // Supabase can return object or array depending on the relation
        const cariRaw = islem.cariler as unknown;
        const cariData = Array.isArray(cariRaw) ? cariRaw[0] : cariRaw;
        if (cariData && typeof cariData === 'object' && 'id' in cariData) {
          const cari = cariData as { id: string; name: string; type: string };
          islemCariMap.set(islem.id, {
            id: cari.id,
            name: cari.name,
            type: cari.type as 'musteri' | 'tedarikci',
          });
        } else {
          islemCariMap.set(islem.id, null);
        }
      });

      // Urun hareketlerine cari bilgisi ekle
      return hareketler.map(h => ({
        ...h,
        cari: h.islem_id ? islemCariMap.get(h.islem_id) || null : null,
      })) as UrunHareketWithCari[];
    },
    enabled: !!isletme && !!urunId,
  });

  return {
    ...result,
    isLoading: result.isLoading || isletmeLoading,
  };
}

/**
 * Aylık urun özeti (giriş/çıkış toplamları)
 */
export interface AylikUrunOzet {
  ay: string; // YYYY-MM formatında
  giris: number;
  cikis: number;
}

export function useAylikUrunOzet(urunId: string | undefined) {
  const { isletme, isletmeLoading } = useAuthContext();

  const result = useQuery({
    queryKey: queryKeys.urunHareketler.aylikOzet(urunId || '', isletme?.id || ''),
    queryFn: async () => {
      if (!isletme || !urunId) return [];

      // Son 12 ayın verilerini al
      const { data, error } = await supabase
        .from('urun_hareketler')
        .select('hareket_tipi, miktar, created_at')
        .eq('isletme_id', isletme.id)
        .eq('urun_id', urunId)
        .gte('created_at', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Aylara göre grupla
      const aylikMap = new Map<string, { giris: number; cikis: number }>();

      (data as UrunHareket[]).forEach((hareket) => {
        if (!hareket.created_at) return;
        const ay = hareket.created_at.substring(0, 7); // YYYY-MM
        const mevcut = aylikMap.get(ay) || { giris: 0, cikis: 0 };

        if (hareket.hareket_tipi === 'giris') {
          mevcut.giris += Math.abs(hareket.miktar);
        } else if (hareket.hareket_tipi === 'cikis') {
          mevcut.cikis += Math.abs(hareket.miktar);
        }
        // duzeltme için hem giris hem cikis olabilir, miktar işaretine göre
        else if (hareket.hareket_tipi === 'duzeltme') {
          if (hareket.miktar > 0) {
            mevcut.giris += hareket.miktar;
          } else {
            mevcut.cikis += Math.abs(hareket.miktar);
          }
        }

        aylikMap.set(ay, mevcut);
      });

      // Map'i array'e çevir ve sırala (en yeni ay en üstte)
      const sonuc: AylikUrunOzet[] = Array.from(aylikMap.entries())
        .map(([ay, degerler]) => ({
          ay,
          giris: degerler.giris,
          cikis: degerler.cikis,
        }))
        .sort((a, b) => b.ay.localeCompare(a.ay));

      return sonuc;
    },
    enabled: !!isletme && !!urunId,
  });

  return {
    ...result,
    isLoading: result.isLoading || isletmeLoading,
  };
}

/**
 * Dönem bazlı tüm ürünlerin urun hareketlerini getir
 * Her ürün için giriş/çıkış toplamlarını döndürür
 */
export interface DonemUrunOzet {
  [urunId: string]: {
    giris: number;
    cikis: number;
  };
}

export function useDonemUrunOzet(options: {
  startDate: string;
  endDate: string;
}) {
  const { isletme, isletmeLoading } = useAuthContext();
  const { startDate, endDate } = options;

  const result = useQuery({
    queryKey: queryKeys.urunHareketler.donemOzet(isletme?.id || '', startDate, endDate),
    queryFn: async () => {
      if (!isletme) return {} as DonemUrunOzet;

      const { data, error } = await supabase
        .from('urun_hareketler')
        .select('urun_id, hareket_tipi, miktar')
        .eq('isletme_id', isletme.id)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);

      if (error) throw error;

      // Ürün bazlı giriş/çıkış toplamları
      const ozet: DonemUrunOzet = {};

      (data as UrunHareket[]).forEach((hareket) => {
        if (!ozet[hareket.urun_id]) {
          ozet[hareket.urun_id] = { giris: 0, cikis: 0 };
        }

        if (hareket.hareket_tipi === 'giris') {
          ozet[hareket.urun_id].giris += Math.abs(hareket.miktar);
        } else if (hareket.hareket_tipi === 'cikis') {
          ozet[hareket.urun_id].cikis += Math.abs(hareket.miktar);
        } else if (hareket.hareket_tipi === 'duzeltme') {
          // Düzeltme: pozitif ise giriş, negatif ise çıkış
          if (hareket.miktar > 0) {
            ozet[hareket.urun_id].giris += hareket.miktar;
          } else {
            ozet[hareket.urun_id].cikis += Math.abs(hareket.miktar);
          }
        }
      });

      return ozet;
    },
    enabled: !!isletme && !!startDate && !!endDate,
  });

  return {
    ...result,
    isLoading: result.isLoading || isletmeLoading,
  };
}

/**
 * Urun hareketi oluştur (giriş/çıkış/düzeltme)
 * Atomik olarak hem hareket kaydı oluşturur hem de ürün miktarını günceller
 */
export function useCreateUrunHareket() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: UrunHareketInsert) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      // 1. Önce mevcut ürün miktarını al
      const { data: urun, error: urunError } = await supabase
        .from('urunler')
        .select('miktar')
        .eq('id', input.urun_id)
        .eq('isletme_id', isletme.id)
        .single();

      if (urunError) throw urunError;
      if (!urun) throw new Error(i18n.t('common:errors.productNotFound'));

      const oncekiMiktar = urun.miktar;

      // 2. Miktar değişimini hesapla
      let miktarDegisim: number;
      if (input.hareket_tipi === 'giris') {
        miktarDegisim = Math.abs(input.miktar);
      } else if (input.hareket_tipi === 'cikis') {
        miktarDegisim = -Math.abs(input.miktar);
      } else {
        // duzeltme - direkt miktar kullan (pozitif veya negatif olabilir)
        miktarDegisim = input.miktar;
      }

      // 3. Urun miktarını atomik olarak güncelle
      const { data: yeniMiktar, error: rpcError } = await supabase
        .rpc('update_urun_miktar', {
          p_urun_id: input.urun_id,
          p_miktar_degisim: miktarDegisim,
          p_isletme_id: isletme.id,
        });

      if (rpcError) throw rpcError;

      // 4. Urun hareketi kaydı oluştur
      const { data: hareket, error: hareketError } = await supabase
        .from('urun_hareketler')
        .insert({
          isletme_id: isletme.id,
          urun_id: input.urun_id,
          islem_id: input.islem_id,
          hareket_tipi: input.hareket_tipi,
          miktar: input.miktar,
          birim_fiyat: input.birim_fiyat,
          kdv_orani: input.kdv_orani,
          onceki_miktar: oncekiMiktar,
          yeni_miktar: yeniMiktar,
          aciklama: input.aciklama,
        })
        .select()
        .single();

      if (hareketError) {
        // Rollback: urun miktarını geri al
        await supabase.rpc('update_urun_miktar', {
          p_urun_id: input.urun_id,
          p_miktar_degisim: -miktarDegisim,
          p_isletme_id: isletme.id,
        });
        throw hareketError;
      }

      return hareket as UrunHareket;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'urunHareket');
    },
  });
}

/**
 * Birden fazla işlem için ürünlü olup olmadığını kontrol et
 * Returns: Set of islem_ids that have urun movements
 */
export function useIslemlerWithUrun(islemIds: string[]) {
  const { isletme, isletmeLoading } = useAuthContext();

  // Batch islemIds in chunks of 100 to avoid too-large queries, but use a stable key
  const stableKey = islemIds.length > 0 ? islemIds.slice().sort().join(',') : '';

  const result = useQuery({
    queryKey: ['urun-hareketler', 'islemler-with-urun', stableKey, isletme?.id || ''],
    queryFn: async () => {
      if (!isletme || islemIds.length === 0) return new Map<string, number>();

      const { data, error } = await supabase
        .from('urun_hareketler')
        .select('islem_id')
        .eq('isletme_id', isletme.id)
        .in('islem_id', islemIds)
        .not('islem_id', 'is', null);

      if (error) throw error;

      // islem_id -> ürün sayısı map'i oluştur
      const islemUrunCountMap = new Map<string, number>();
      data?.forEach(row => {
        if (row.islem_id) {
          islemUrunCountMap.set(row.islem_id, (islemUrunCountMap.get(row.islem_id) || 0) + 1);
        }
      });

      return islemUrunCountMap;
    },
    enabled: !!isletme && islemIds.length > 0,
    // Keep previous data while refetching with new islemIds to prevent icon flicker
    placeholderData: (previousData) => previousData,
  });

  return {
    ...result,
    isLoading: result.isLoading || isletmeLoading,
    hasUrun: (islemId: string) => (result.data?.get(islemId) ?? 0) > 0,
    getUrunCount: (islemId: string) => result.data?.get(islemId) ?? 0,
  };
}

/**
 * Bir carinin işlemleri için ürün sayılarını getir
 * Cari ID ile doğrudan sorgular - islemler yüklenmeden önce bile çalışır
 */
export function useIslemlerWithUrunByCari(cariId: string | undefined) {
  const { isletme, isletmeLoading } = useAuthContext();

  const result = useQuery({
    queryKey: ['urun-hareketler', 'islemler-with-urun-by-cari', cariId || '', isletme?.id || ''],
    queryFn: async () => {
      if (!isletme || !cariId) return new Map<string, number>();

      // Join through islemler to get urun_hareketler for this cari
      const { data: islemlerData, error: islemError } = await supabase
        .from('islemler')
        .select('id')
        .eq('isletme_id', isletme.id)
        .eq('cari_id', cariId);

      if (islemError) throw islemError;
      if (!islemlerData || islemlerData.length === 0) return new Map<string, number>();

      const islemIds = islemlerData.map(i => i.id);

      const { data, error } = await supabase
        .from('urun_hareketler')
        .select('islem_id')
        .eq('isletme_id', isletme.id)
        .in('islem_id', islemIds)
        .not('islem_id', 'is', null);

      if (error) throw error;

      const islemUrunCountMap = new Map<string, number>();
      data?.forEach(row => {
        if (row.islem_id) {
          islemUrunCountMap.set(row.islem_id, (islemUrunCountMap.get(row.islem_id) || 0) + 1);
        }
      });

      return islemUrunCountMap;
    },
    enabled: !!isletme && !!cariId,
  });

  return {
    ...result,
    isLoading: result.isLoading || isletmeLoading,
    hasUrun: (islemId: string) => (result.data?.get(islemId) ?? 0) > 0,
    getUrunCount: (islemId: string) => result.data?.get(islemId) ?? 0,
  };
}

/**
 * Bir işleme ait urun hareketlerini getir (edit mode için)
 */
export function useUrunHareketlerByIslemId(islemId: string | undefined) {
  const { isletme, isletmeLoading } = useAuthContext();

  const result = useQuery({
    queryKey: queryKeys.urunHareketler.byIslem(islemId || '', isletme?.id || ''),
    queryFn: async () => {
      if (!isletme || !islemId) return [];

      const { data, error } = await supabase
        .from('urun_hareketler')
        .select('*, urunler(*)')
        .eq('isletme_id', isletme.id)
        .eq('islem_id', islemId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as (UrunHareket & { urunler: { ad: string; birim: string } })[];
    },
    enabled: !!isletme && !!islemId,
  });

  return {
    ...result,
    isLoading: result.isLoading || isletmeLoading,
  };
}

/**
 * Urun hareketi güncelle (sadece islem_id olmayan doğrudan girişler güncellenebilir)
 * Urun miktarını da günceller
 */
export function useUpdateUrunHareket() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      miktar: number;
      birim_fiyat: number | null;
      hareket_tipi: UrunHareketTipi;
    }) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      // 1. Önce mevcut hareketi al
      const { data: eskiHareket, error: eskiError } = await supabase
        .from('urun_hareketler')
        .select('*')
        .eq('id', input.id)
        .eq('isletme_id', isletme.id)
        .single();

      if (eskiError) throw eskiError;
      if (!eskiHareket) throw new Error(i18n.t('common:errors.movementNotFound'));

      // 2. İşlem bağlantılı hareketler güncellenemez
      if (eskiHareket.islem_id) {
        throw new Error(i18n.t('common:errors.movementLinkedCannotUpdate'));
      }

      // 3. Eski miktar etkisini geri al
      let eskiMiktarDegisim: number;
      if (eskiHareket.hareket_tipi === 'giris') {
        eskiMiktarDegisim = -Math.abs(eskiHareket.miktar);
      } else if (eskiHareket.hareket_tipi === 'cikis') {
        eskiMiktarDegisim = Math.abs(eskiHareket.miktar);
      } else {
        eskiMiktarDegisim = -eskiHareket.miktar;
      }

      // 4. Yeni miktar etkisini hesapla
      let yeniMiktarDegisim: number;
      if (input.hareket_tipi === 'giris') {
        yeniMiktarDegisim = Math.abs(input.miktar);
      } else if (input.hareket_tipi === 'cikis') {
        yeniMiktarDegisim = -Math.abs(input.miktar);
      } else {
        yeniMiktarDegisim = input.miktar;
      }

      // 5. Net değişimi uygula
      const netDegisim = eskiMiktarDegisim + yeniMiktarDegisim;

      const { data: yeniUrunMiktar, error: rpcError } = await supabase
        .rpc('update_urun_miktar', {
          p_urun_id: eskiHareket.urun_id,
          p_miktar_degisim: netDegisim,
          p_isletme_id: isletme.id,
        });

      if (rpcError) throw rpcError;

      // 6. Hareketi güncelle
      const { data: guncellenmisHareket, error: updateError } = await supabase
        .from('urun_hareketler')
        .update({
          hareket_tipi: input.hareket_tipi,
          miktar: input.miktar,
          birim_fiyat: input.birim_fiyat,
          yeni_miktar: yeniUrunMiktar,
        })
        .eq('id', input.id)
        .eq('isletme_id', isletme.id)
        .select()
        .single();

      if (updateError) {
        // Rollback: urun miktarını geri al
        await supabase.rpc('update_urun_miktar', {
          p_urun_id: eskiHareket.urun_id,
          p_miktar_degisim: -netDegisim,
          p_isletme_id: isletme.id,
        });
        throw updateError;
      }

      return guncellenmisHareket as UrunHareket;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'urunHareket');
    },
  });
}

/**
 * Urun hareketi sil (sadece islem_id olmayan doğrudan girişler silinebilir)
 * Urun miktarını da geri alır
 */
export function useDeleteUrunHareket() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (hareketId: string) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      // 1. Önce hareketi al
      const { data: hareket, error: hareketError } = await supabase
        .from('urun_hareketler')
        .select('*')
        .eq('id', hareketId)
        .eq('isletme_id', isletme.id)
        .single();

      if (hareketError) throw hareketError;
      if (!hareket) throw new Error(i18n.t('common:errors.movementNotFound'));

      // 2. İşlem bağlantılı hareketler silinemez
      if (hareket.islem_id) {
        throw new Error(i18n.t('common:errors.movementLinkedCannotDelete'));
      }

      // 3. Miktar değişimini tersine çevir
      let miktarDegisim: number;
      if (hareket.hareket_tipi === 'giris') {
        miktarDegisim = -Math.abs(hareket.miktar); // Girişi geri al
      } else if (hareket.hareket_tipi === 'cikis') {
        miktarDegisim = Math.abs(hareket.miktar); // Çıkışı geri al
      } else {
        // duzeltme - tersini uygula
        miktarDegisim = -hareket.miktar;
      }

      // 4. Urun miktarını güncelle
      const { error: rpcError } = await supabase
        .rpc('update_urun_miktar', {
          p_urun_id: hareket.urun_id,
          p_miktar_degisim: miktarDegisim,
          p_isletme_id: isletme.id,
        });

      if (rpcError) throw rpcError;

      // 5. Hareketi sil
      const { error: deleteError } = await supabase
        .from('urun_hareketler')
        .delete()
        .eq('id', hareketId)
        .eq('isletme_id', isletme.id);

      if (deleteError) {
        // Rollback: urun miktarını geri al
        await supabase.rpc('update_urun_miktar', {
          p_urun_id: hareket.urun_id,
          p_miktar_degisim: -miktarDegisim,
          p_isletme_id: isletme.id,
        });
        throw deleteError;
      }

      return { success: true };
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'urunHareket');
    },
  });
}

/**
 * Input for creating a product movement with cari linkage
 */
export interface CreateUrunHareketWithCariInput {
  urun_id: string;
  urun_ad: string;
  hareket_tipi: 'giris' | 'cikis';
  miktar: number;
  birim_fiyat: number;
  kdv_orani: KdvOrani;
  cari_id: string;
  aciklama?: string;
  date?: string;
  hesap_id?: string | null;
}

/**
 * Cari bağlantılı tek ürün hareketi oluştur.
 * 1. cari_alis veya cari_satis islem kaydı oluşturur (KDV dahil tutar)
 * 2. urun_hareket kaydı oluşturur (islem_id ile bağlı)
 * 3. Ürün miktarını atomik günceller
 * 4. Hata durumunda rollback yapar
 */
export function useCreateUrunHareketWithCari() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: CreateUrunHareketWithCariInput) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      // İşlem tipi: giris → cari_alis (tedarikçiden alım), cikis → cari_satis (müşteriye satış)
      const islemType: IslemType = input.hareket_tipi === 'giris' ? 'cari_alis' : 'cari_satis';

      // KDV dahil toplam tutarı hesapla
      const subtotal = input.miktar * input.birim_fiyat;
      const kdvAmount = subtotal * (input.kdv_orani / 100);
      const totalAmount = subtotal + kdvAmount;

      // STEP 1: İşlem kaydı oluştur (cari_alis / cari_satis)
      const { data: islem, error: islemError } = await supabase
        .from('islemler')
        .insert({
          isletme_id: isletme.id,
          type: islemType,
          amount: totalAmount,
          cari_id: input.cari_id,
          hesap_id: input.hesap_id ?? null,
          description: input.aciklama || `${input.urun_ad} - ${input.miktar} adet`,
          date: input.date || new Date().toISOString(),
        })
        .select()
        .single();

      if (islemError) throw islemError;

      // STEP 1b: Cari bakiyesini güncelle
      // cari_alis → borcumuz artar (balance azalır), cari_satis → alacağımız artar (balance artar)
      const balanceChange = islemType === 'cari_alis' ? -totalAmount : totalAmount;
      const { error: balanceError } = await supabase.rpc('increment_balance', {
        table_name: 'cariler',
        row_id: input.cari_id,
        amount: balanceChange,
      });

      if (balanceError) {
        // Rollback: işlemi sil
        await supabase.from('islemler').delete().eq('id', islem.id).eq('isletme_id', isletme.id);
        throw balanceError;
      }

      // STEP 2: Ürün miktarını atomik güncelle
      const miktarDegisim = input.hareket_tipi === 'giris'
        ? Math.abs(input.miktar)
        : -Math.abs(input.miktar);

      const { data: oncekiMiktar } = await supabase
        .from('urunler')
        .select('miktar')
        .eq('id', input.urun_id)
        .eq('isletme_id', isletme.id)
        .single();

      const { data: yeniMiktar, error: rpcError } = await supabase
        .rpc('update_urun_miktar', {
          p_urun_id: input.urun_id,
          p_miktar_degisim: miktarDegisim,
          p_isletme_id: isletme.id,
        });

      if (rpcError) {
        // Rollback: cari balance geri al + işlemi sil
        await supabase.rpc('increment_balance', { table_name: 'cariler', row_id: input.cari_id, amount: -balanceChange });
        await supabase.from('islemler').delete().eq('id', islem.id).eq('isletme_id', isletme.id);
        throw rpcError;
      }

      // STEP 3: Ürün hareketi kaydı oluştur (islem_id ile bağlı)
      const { data: hareket, error: hareketError } = await supabase
        .from('urun_hareketler')
        .insert({
          isletme_id: isletme.id,
          urun_id: input.urun_id,
          islem_id: islem.id,
          hareket_tipi: input.hareket_tipi,
          miktar: input.miktar,
          birim_fiyat: input.birim_fiyat,
          kdv_orani: input.kdv_orani,
          onceki_miktar: oncekiMiktar?.miktar ?? 0,
          yeni_miktar: yeniMiktar,
          aciklama: input.aciklama,
        })
        .select()
        .single();

      if (hareketError) {
        // Rollback: miktar geri al + cari balance geri al + işlem sil
        await supabase.rpc('update_urun_miktar', {
          p_urun_id: input.urun_id,
          p_miktar_degisim: -miktarDegisim,
          p_isletme_id: isletme.id,
        });
        await supabase.rpc('increment_balance', { table_name: 'cariler', row_id: input.cari_id, amount: -balanceChange });
        await supabase.from('islemler').delete().eq('id', islem.id).eq('isletme_id', isletme.id);
        throw hareketError;
      }

      return { hareket: hareket as UrunHareket, islemId: islem.id, totalAmount };
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'urunHareket');
      invalidateRelatedQueries(queryClient, 'islem');
    },
  });
}

/**
 * Input for bulk product movement with cari linkage
 */
export interface BulkUrunItem {
  urun_id: string;
  urun_ad: string;
  miktar: number;
  birim_fiyat: number;
  kdv_orani: KdvOrani;
}

export interface CreateBulkUrunHareketWithCariInput {
  hareket_tipi: 'giris' | 'cikis';
  items: BulkUrunItem[];
  cari_id: string;
  aciklama?: string;
  date?: string;
  hesap_id?: string | null;
}

/**
 * Toplu cari bağlantılı ürün hareketi oluştur.
 * Tek bir islem kaydı + birden fazla urun_hareket kaydı.
 * Hata durumunda tüm işlemleri rollback yapar.
 */
export function useCreateBulkUrunHareketWithCari() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: CreateBulkUrunHareketWithCariInput) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));
      if (input.items.length === 0) throw new Error(i18n.t('common:errors.atLeastOneProductRequired'));

      const islemType: IslemType = input.hareket_tipi === 'giris' ? 'cari_alis' : 'cari_satis';

      // Toplam tutarı hesapla (tüm ürünlerin KDV dahil toplamı)
      const grandTotal = input.items.reduce((acc, item) => {
        const subtotal = item.miktar * item.birim_fiyat;
        const kdv = subtotal * (item.kdv_orani / 100);
        return acc + subtotal + kdv;
      }, 0);

      // Ürün adları listesi (açıklama için)
      const urunListesi = input.items.map(i => `${i.urun_ad} (${i.miktar})`).join(', ');

      // STEP 1: Tek bir işlem kaydı oluştur
      const { data: islem, error: islemError } = await supabase
        .from('islemler')
        .insert({
          isletme_id: isletme.id,
          type: islemType,
          amount: grandTotal,
          cari_id: input.cari_id,
          hesap_id: input.hesap_id ?? null,
          description: input.aciklama || urunListesi,
          date: input.date || new Date().toISOString(),
        })
        .select()
        .single();

      if (islemError) throw islemError;

      // STEP 1b: Cari bakiyesini güncelle
      const bulkBalanceChange = islemType === 'cari_alis' ? -grandTotal : grandTotal;
      const { error: balanceError } = await supabase.rpc('increment_balance', {
        table_name: 'cariler',
        row_id: input.cari_id,
        amount: bulkBalanceChange,
      });

      if (balanceError) {
        // Rollback: işlemi sil
        await supabase.from('islemler').delete().eq('id', islem.id).eq('isletme_id', isletme.id);
        throw balanceError;
      }

      // STEP 2: Her ürün için hareket oluştur
      const createdHareketler: UrunHareket[] = [];
      const miktarUpdates: { urunId: string; degisim: number }[] = [];

      for (const item of input.items) {
        const miktarDegisim = input.hareket_tipi === 'giris'
          ? Math.abs(item.miktar)
          : -Math.abs(item.miktar);

        // Önceki miktarı al
        const { data: urunData } = await supabase
          .from('urunler')
          .select('miktar')
          .eq('id', item.urun_id)
          .eq('isletme_id', isletme.id)
          .single();

        // Miktar güncelle
        const { data: yeniMiktar, error: rpcError } = await supabase
          .rpc('update_urun_miktar', {
            p_urun_id: item.urun_id,
            p_miktar_degisim: miktarDegisim,
            p_isletme_id: isletme.id,
          });

        if (rpcError) {
          // Rollback: önceki miktar güncellemelerini geri al + cari balance geri al + işlemi sil
          for (const update of miktarUpdates) {
            await supabase.rpc('update_urun_miktar', {
              p_urun_id: update.urunId,
              p_miktar_degisim: -update.degisim,
              p_isletme_id: isletme.id,
            });
          }
          for (const h of createdHareketler) {
            await supabase.from('urun_hareketler').delete().eq('id', h.id).eq('isletme_id', isletme.id);
          }
          await supabase.rpc('increment_balance', { table_name: 'cariler', row_id: input.cari_id, amount: -bulkBalanceChange });
          await supabase.from('islemler').delete().eq('id', islem.id).eq('isletme_id', isletme.id);
          throw rpcError;
        }

        miktarUpdates.push({ urunId: item.urun_id, degisim: miktarDegisim });

        // Hareket kaydı oluştur
        const { data: hareket, error: hareketError } = await supabase
          .from('urun_hareketler')
          .insert({
            isletme_id: isletme.id,
            urun_id: item.urun_id,
            islem_id: islem.id,
            hareket_tipi: input.hareket_tipi,
            miktar: item.miktar,
            birim_fiyat: item.birim_fiyat,
            kdv_orani: item.kdv_orani,
            onceki_miktar: urunData?.miktar ?? 0,
            yeni_miktar: yeniMiktar,
            aciklama: input.aciklama,
          })
          .select()
          .single();

        if (hareketError) {
          // Rollback: tüm miktar güncellemelerini geri al + hareketleri sil + cari balance geri al + işlemi sil
          for (const update of miktarUpdates) {
            await supabase.rpc('update_urun_miktar', {
              p_urun_id: update.urunId,
              p_miktar_degisim: -update.degisim,
              p_isletme_id: isletme.id,
            });
          }
          for (const h of createdHareketler) {
            await supabase.from('urun_hareketler').delete().eq('id', h.id).eq('isletme_id', isletme.id);
          }
          await supabase.rpc('increment_balance', { table_name: 'cariler', row_id: input.cari_id, amount: -bulkBalanceChange });
          await supabase.from('islemler').delete().eq('id', islem.id).eq('isletme_id', isletme.id);
          throw hareketError;
        }

        createdHareketler.push(hareket as UrunHareket);
      }

      return {
        hareketler: createdHareketler,
        islemId: islem.id,
        grandTotal,
        itemCount: input.items.length,
      };
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'urunHareket');
      invalidateRelatedQueries(queryClient, 'islem');
    },
  });
}
