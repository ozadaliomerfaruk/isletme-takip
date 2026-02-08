import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { StokHareket, StokHareketInsert, StokHareketTipi } from '@/types/database';
import { invalidateRelatedQueries, queryKeys } from '@/lib/queryKeys';

/**
 * Stok hareketi ile birlikte cari bilgisi
 */
export interface StokHareketWithCari extends StokHareket {
  cari?: {
    id: string;
    name: string;
    type: 'musteri' | 'tedarikci';
  } | null;
}

/**
 * Bir ürüne ait stok hareketlerini getir (cari bilgisi dahil)
 */
export function useStokHareketler(urunId: string | undefined) {
  const { isletme, isletmeLoading } = useAuthContext();

  const result = useQuery({
    queryKey: queryKeys.stokHareketler.byUrun(urunId || '', isletme?.id || ''),
    queryFn: async () => {
      if (!isletme || !urunId) return [];

      // İlk olarak stok hareketlerini al
      const { data: hareketler, error } = await supabase
        .from('stok_hareketler')
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
        return hareketler.map(h => ({ ...h, cari: null })) as StokHareketWithCari[];
      }

      // İşlemleri ve carilerini al
      const { data: islemler, error: islemError } = await supabase
        .from('islemler')
        .select('id, cari_id, cariler(id, name, type)')
        .in('id', islemIds);

      if (islemError) {
        console.error('Error fetching islemler for cari info:', islemError);
        return hareketler.map(h => ({ ...h, cari: null })) as StokHareketWithCari[];
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

      // Stok hareketlerine cari bilgisi ekle
      return hareketler.map(h => ({
        ...h,
        cari: h.islem_id ? islemCariMap.get(h.islem_id) || null : null,
      })) as StokHareketWithCari[];
    },
    enabled: !!isletme && !!urunId,
  });

  return {
    ...result,
    isLoading: result.isLoading || isletmeLoading,
  };
}

/**
 * Aylık stok özeti (giriş/çıkış toplamları)
 */
export interface AylikStokOzet {
  ay: string; // YYYY-MM formatında
  giris: number;
  cikis: number;
}

export function useAylikStokOzet(urunId: string | undefined) {
  const { isletme, isletmeLoading } = useAuthContext();

  const result = useQuery({
    queryKey: queryKeys.stokHareketler.aylikOzet(urunId || '', isletme?.id || ''),
    queryFn: async () => {
      if (!isletme || !urunId) return [];

      // Son 12 ayın verilerini al
      const { data, error } = await supabase
        .from('stok_hareketler')
        .select('hareket_tipi, miktar, created_at')
        .eq('isletme_id', isletme.id)
        .eq('urun_id', urunId)
        .gte('created_at', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Aylara göre grupla
      const aylikMap = new Map<string, { giris: number; cikis: number }>();

      (data as StokHareket[]).forEach((hareket) => {
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
      const sonuc: AylikStokOzet[] = Array.from(aylikMap.entries())
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
 * Dönem bazlı tüm ürünlerin stok hareketlerini getir
 * Her ürün için giriş/çıkış toplamlarını döndürür
 */
export interface DonemStokOzet {
  [urunId: string]: {
    giris: number;
    cikis: number;
  };
}

export function useDonemStokOzet(options: {
  startDate: string;
  endDate: string;
}) {
  const { isletme, isletmeLoading } = useAuthContext();
  const { startDate, endDate } = options;

  const result = useQuery({
    queryKey: queryKeys.stokHareketler.donemOzet(isletme?.id || '', startDate, endDate),
    queryFn: async () => {
      if (!isletme) return {} as DonemStokOzet;

      const { data, error } = await supabase
        .from('stok_hareketler')
        .select('urun_id, hareket_tipi, miktar')
        .eq('isletme_id', isletme.id)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);

      if (error) throw error;

      // Ürün bazlı giriş/çıkış toplamları
      const ozet: DonemStokOzet = {};

      (data as StokHareket[]).forEach((hareket) => {
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
 * Stok hareketi oluştur (giriş/çıkış/düzeltme)
 * Atomik olarak hem hareket kaydı oluşturur hem de ürün stok miktarını günceller
 */
export function useCreateStokHareket() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: StokHareketInsert) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      // 1. Önce mevcut stok miktarını al
      const { data: urun, error: urunError } = await supabase
        .from('urunler')
        .select('miktar')
        .eq('id', input.urun_id)
        .eq('isletme_id', isletme.id)
        .single();

      if (urunError) throw urunError;
      if (!urun) throw new Error('Ürün bulunamadı');

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

      // 3. Stok miktarını atomik olarak güncelle
      const { data: yeniMiktar, error: rpcError } = await supabase
        .rpc('update_stok_miktar', {
          p_urun_id: input.urun_id,
          p_miktar_degisim: miktarDegisim,
        });

      if (rpcError) throw rpcError;

      // 4. Stok hareketi kaydı oluştur
      const { data: hareket, error: hareketError } = await supabase
        .from('stok_hareketler')
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
        // Rollback: stok miktarını geri al
        await supabase.rpc('update_stok_miktar', {
          p_urun_id: input.urun_id,
          p_miktar_degisim: -miktarDegisim,
        });
        throw hareketError;
      }

      return hareket as StokHareket;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'stokHareket');
    },
  });
}

/**
 * Birden fazla işlem için stoklu olup olmadığını kontrol et
 * Returns: Set of islem_ids that have stock movements
 */
export function useIslemlerWithStok(islemIds: string[]) {
  const { isletme, isletmeLoading } = useAuthContext();

  const result = useQuery({
    queryKey: ['stok-hareketler', 'islemler-with-stok', islemIds.join(','), isletme?.id || ''],
    queryFn: async () => {
      if (!isletme || islemIds.length === 0) return new Set<string>();

      const { data, error } = await supabase
        .from('stok_hareketler')
        .select('islem_id')
        .eq('isletme_id', isletme.id)
        .in('islem_id', islemIds)
        .not('islem_id', 'is', null);

      if (error) throw error;

      // Unique islem_id'leri Set olarak döndür
      const islemIdsWithStok = new Set<string>();
      data?.forEach(row => {
        if (row.islem_id) {
          islemIdsWithStok.add(row.islem_id);
        }
      });

      return islemIdsWithStok;
    },
    enabled: !!isletme && islemIds.length > 0,
  });

  return {
    ...result,
    isLoading: result.isLoading || isletmeLoading,
    hasStok: (islemId: string) => result.data?.has(islemId) ?? false,
  };
}

/**
 * Bir işleme ait stok hareketlerini getir (edit mode için)
 */
export function useStokHareketlerByIslemId(islemId: string | undefined) {
  const { isletme, isletmeLoading } = useAuthContext();

  const result = useQuery({
    queryKey: queryKeys.stokHareketler.byIslem(islemId || '', isletme?.id || ''),
    queryFn: async () => {
      if (!isletme || !islemId) return [];

      const { data, error } = await supabase
        .from('stok_hareketler')
        .select('*, urunler(*)')
        .eq('isletme_id', isletme.id)
        .eq('islem_id', islemId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as (StokHareket & { urunler: { ad: string; birim: string } })[];
    },
    enabled: !!isletme && !!islemId,
  });

  return {
    ...result,
    isLoading: result.isLoading || isletmeLoading,
  };
}

/**
 * Stok hareketi güncelle (sadece islem_id olmayan doğrudan girişler güncellenebilir)
 * Stok miktarını da günceller
 */
export function useUpdateStokHareket() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      miktar: number;
      birim_fiyat: number | null;
      hareket_tipi: StokHareketTipi;
    }) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      // 1. Önce mevcut hareketi al
      const { data: eskiHareket, error: eskiError } = await supabase
        .from('stok_hareketler')
        .select('*')
        .eq('id', input.id)
        .eq('isletme_id', isletme.id)
        .single();

      if (eskiError) throw eskiError;
      if (!eskiHareket) throw new Error('Stok hareketi bulunamadı');

      // 2. İşlem bağlantılı hareketler güncellenemez
      if (eskiHareket.islem_id) {
        throw new Error('Bu stok hareketi bir işleme bağlı olduğu için güncellenemez');
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

      const { data: yeniStokMiktar, error: rpcError } = await supabase
        .rpc('update_stok_miktar', {
          p_urun_id: eskiHareket.urun_id,
          p_miktar_degisim: netDegisim,
        });

      if (rpcError) throw rpcError;

      // 6. Hareketi güncelle
      const { data: guncellenmisHareket, error: updateError } = await supabase
        .from('stok_hareketler')
        .update({
          hareket_tipi: input.hareket_tipi,
          miktar: input.miktar,
          birim_fiyat: input.birim_fiyat,
          yeni_miktar: yeniStokMiktar,
        })
        .eq('id', input.id)
        .eq('isletme_id', isletme.id)
        .select()
        .single();

      if (updateError) {
        // Rollback: stok miktarını geri al
        await supabase.rpc('update_stok_miktar', {
          p_urun_id: eskiHareket.urun_id,
          p_miktar_degisim: -netDegisim,
        });
        throw updateError;
      }

      return guncellenmisHareket as StokHareket;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'stokHareket');
    },
  });
}

/**
 * Stok hareketi sil (sadece islem_id olmayan doğrudan girişler silinebilir)
 * Stok miktarını da geri alır
 */
export function useDeleteStokHareket() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (hareketId: string) => {
      if (!isletme) throw new Error('İşletme bulunamadı');

      // 1. Önce hareketi al
      const { data: hareket, error: hareketError } = await supabase
        .from('stok_hareketler')
        .select('*')
        .eq('id', hareketId)
        .eq('isletme_id', isletme.id)
        .single();

      if (hareketError) throw hareketError;
      if (!hareket) throw new Error('Stok hareketi bulunamadı');

      // 2. İşlem bağlantılı hareketler silinemez
      if (hareket.islem_id) {
        throw new Error('Bu stok hareketi bir işleme bağlı olduğu için silinemez');
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

      // 4. Stok miktarını güncelle
      const { error: rpcError } = await supabase
        .rpc('update_stok_miktar', {
          p_urun_id: hareket.urun_id,
          p_miktar_degisim: miktarDegisim,
        });

      if (rpcError) throw rpcError;

      // 5. Hareketi sil
      const { error: deleteError } = await supabase
        .from('stok_hareketler')
        .delete()
        .eq('id', hareketId)
        .eq('isletme_id', isletme.id);

      if (deleteError) {
        // Rollback: stok miktarını geri al
        await supabase.rpc('update_stok_miktar', {
          p_urun_id: hareket.urun_id,
          p_miktar_degisim: -miktarDegisim,
        });
        throw deleteError;
      }

      return { success: true };
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'stokHareket');
    },
  });
}
