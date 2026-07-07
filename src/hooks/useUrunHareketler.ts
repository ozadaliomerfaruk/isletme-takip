import { useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { UrunHareket, UrunHareketInsert, UrunHareketTipi, IslemType, KdvOrani, HesapType } from '@/types/database';
import { invalidateRelatedQueries, queryKeys } from '@/lib/queryKeys';
import { toNumber } from '@/lib/currency';
import { urunHareketYon, aileNetIsaret, isAlisAilesi } from '@/lib/urunHareket';
import i18n from '@/i18n';

/**
 * Urun hareketi ile birlikte bağlı işlemin kaynağı (cari / hesap-kart / personel).
 * islem_id NULL ise (manuel stok giriş/çıkış/düzeltme) hepsi null'dır.
 */
export interface UrunHareketWithSource extends UrunHareket {
  cari?: {
    id: string;
    name: string;
    type: 'musteri' | 'tedarikci';
  } | null;
  /** Bağlı işlemin tipi (gelir/gider/cari_alis/cari_satis/personel_satis...). */
  islemType?: IslemType | null;
  /**
   * Bağlı işlemin iş tarihi (islemler.date). Liste gösterimi ve sıralaması bunu
   * kullanmalı — created_at DEĞİL. created_at, düzenleme/yeniden-uygulama (reapply)
   * sırasında NOW()'a kayar ve gerçek işlem tarihini yansıtmaz. islem_id NULL ise
   * (manuel stok hareketi) null'dır → tüketici created_at'e düşer.
   */
  islemDate?: string | null;
  /** İşlemin para hesabı; type === 'kredi_karti' ise kredi kartı kaynağı. */
  hesap?: {
    id: string;
    name: string;
    type: HesapType;
  } | null;
  /** Personel kaynaklı işlemlerde (personel_satis vb.) personel adı. */
  personel?: {
    id: string;
    name: string;
  } | null;
}

/** Geriye uyumluluk: eski ad korunur (artık kaynak alanlarını da taşır). */
export type UrunHareketWithCari = UrunHareketWithSource;

/**
 * Ürünün SON işlem birim fiyatı (yön bazlı: alış → giriş, satış → çıkış).
 * Ürün seçicide fiyat alanını güncel piyasa fiyatıyla doldurmak için —
 * ürün kartındaki alis_fiyati/satis_fiyati işlemlerle güncellenmediğinden bayatlar.
 */
export function useSonUrunFiyati(urunId: string | undefined, yon: 'alis' | 'satis') {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: [...queryKeys.urunHareketler.byUrun(urunId || '', isletme?.id || ''), 'son-fiyat', yon],
    queryFn: async (): Promise<{ fiyat: number; tarih: string } | null> => {
      if (!isletme || !urunId) return null;
      const { data, error } = await supabase
        .from('urun_hareketler')
        .select('birim_fiyat, created_at, islem:islemler(date)')
        .eq('isletme_id', isletme.id)
        .eq('urun_id', urunId)
        .eq('hareket_tipi', yon === 'satis' ? 'cikis' : 'giris')
        .not('birim_fiyat', 'is', null)
        .gt('birim_fiyat', 0)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      if (!data || data.length === 0) return null;
      // created_at düzenleme/reapply'da NOW()'a kayar (bkz. islemDate notu yukarıda);
      // gerçek iş tarihi islem.date'tir → son 5 aday içinden iş tarihine göre seç.
      const adaylar = data.map((h) => {
        const islemRaw = Array.isArray(h.islem) ? h.islem[0] : h.islem;
        const tarih = (islemRaw as { date?: string } | null)?.date ?? h.created_at;
        return { fiyat: toNumber(h.birim_fiyat), tarih: String(tarih).slice(0, 10) };
      });
      adaylar.sort((a, b) => (a.tarih < b.tarih ? 1 : -1));
      return adaylar[0];
    },
    enabled: !!isletme && !!urunId,
    staleTime: 30_000,
  });
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

      // İşlemleri ve kaynaklarını al (cari + hesap/kart + personel + tip).
      // İki FK (hesap_id, hedef_hesap_id) olduğundan PostgREST alias zorunlu (useIslemler ile aynı desen).
      const { data: islemler, error: islemError } = await supabase
        .from('islemler')
        .select('id, type, date, cari_id, hesap_id, personel_id, cariler(id, name, type), hesap:hesaplar!hesap_id(id, name, type), personel:personel(id, first_name, last_name)')
        .in('id', islemIds);

      if (islemError) {
        console.error('Error fetching islemler for source info:', islemError);
        return hareketler.map(h => ({ ...h, cari: null })) as UrunHareketWithSource[];
      }

      // Supabase ilişkisi tek obje VEYA dizi dönebilir → normalize et
      const normalizeRel = (raw: unknown): Record<string, unknown> | null => {
        const v = Array.isArray(raw) ? raw[0] : raw;
        return v && typeof v === 'object' && 'id' in (v as object) ? (v as Record<string, unknown>) : null;
      };

      // islem_id -> kaynak (cari/hesap/personel + tip) mapping oluştur
      type SourceInfo = Pick<UrunHareketWithSource, 'cari' | 'hesap' | 'personel' | 'islemType' | 'islemDate'>;
      const islemSourceMap = new Map<string, SourceInfo>();
      islemler?.forEach(islemRaw => {
        const islem = islemRaw as { id: string; type: string | null; date: string | null; cariler: unknown; hesap: unknown; personel: unknown };
        const cariData = normalizeRel(islem.cariler);
        const hesapData = normalizeRel(islem.hesap);
        const personelData = normalizeRel(islem.personel);
        islemSourceMap.set(islem.id, {
          islemType: (islem.type as IslemType) ?? null,
          islemDate: islem.date ?? null,
          cari: cariData
            ? { id: cariData.id as string, name: cariData.name as string, type: cariData.type as 'musteri' | 'tedarikci' }
            : null,
          hesap: hesapData
            ? { id: hesapData.id as string, name: hesapData.name as string, type: hesapData.type as HesapType }
            : null,
          personel: personelData
            ? {
                id: personelData.id as string,
                name: [personelData.first_name, personelData.last_name].filter(Boolean).join(' ').trim() || '—',
              }
            : null,
        });
      });

      // Urun hareketlerine kaynak bilgisi ekle
      const withSource = hareketler.map(h => {
        const src = h.islem_id ? islemSourceMap.get(h.islem_id) : undefined;
        return {
          ...h,
          cari: src?.cari ?? null,
          islemType: src?.islemType ?? null,
          islemDate: src?.islemDate ?? null,
          hesap: src?.hesap ?? null,
          personel: src?.personel ?? null,
        };
      }) as UrunHareketWithSource[];

      // Sıralama: iş tarihine göre YENİ → ESKİ (en son girilen en ÜSTTE — uygulama
      // genelindeki standart). İş tarihi islem.date (saat dahil); yoksa created_at.
      // Aynı iş tarihinde giriş anına (created_at) göre; tam stabillik için son olarak
      // id ile çöz. created_at düzenlemede NOW()'a kaydığı için ASIL anahtar islem.date.
      const toTs = (raw: string | null | undefined): number => {
        if (!raw) return 0;
        const t = new Date(raw.replace(' ', 'T')).getTime();
        return Number.isNaN(t) ? 0 : t;
      };
      withSource.sort((a, b) => {
        const d = toTs(b.islemDate ?? b.created_at) - toTs(a.islemDate ?? a.created_at);
        if (d !== 0) return d;
        const c = toTs(b.created_at) - toTs(a.created_at);
        if (c !== 0) return c;
        return (b.id || '').localeCompare(a.id || '');
      });

      return withSource;
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
  giris: number; // NET ALIŞ miktarı (alış − alış iadesi). İade fazlaysa negatif olabilir.
  cikis: number; // NET SATIŞ miktarı (satış − satış iadesi). İade fazlaysa negatif olabilir.
  duzeltme: number; // net düzeltme miktarı (pozitif veya negatif)
  girisTutar: number; // NET ALIŞ tutarı (alış − alış iadesi) — KDV hariç, ürünün para biriminde
  cikisTutar: number; // NET SATIŞ tutarı (satış − satış iadesi) — KDV hariç
}

export function useAylikUrunOzet(urunId: string | undefined) {
  const { isletme, isletmeLoading } = useAuthContext();

  const result = useQuery({
    queryKey: queryKeys.urunHareketler.aylikOzet(urunId || '', isletme?.id || ''),
    queryFn: async () => {
      if (!isletme || !urunId) return [];

      // Son 12 ay. created_at yalnız çekme sınırı; gruplama İŞ TARİHİNE (islem.date)
      // göre yapılır — created_at düzenleme/yeniden-uygulamada NOW()'a kayıyor.
      const { data, error } = await supabase
        .from('urun_hareketler')
        .select('hareket_tipi, miktar, birim_fiyat, kdv_orani, created_at, islem_id, islemler(date, type)')
        .eq('isletme_id', isletme.id)
        .eq('urun_id', urunId)
        .gte('created_at', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString());

      if (error) throw error;

      // Aylara göre grupla. giris/cikis artık ALIŞ/SATIŞ ailesinin NET'idir (stok yönü değil):
      // alış iadesi ALIŞ'tan, satış iadesi SATIŞ'tan düşülür (bkz. urunHareketYon).
      const aylikMap = new Map<string, { giris: number; cikis: number; duzeltme: number; girisTutar: number; cikisTutar: number }>();

      type IslemRel = { date: string | null; type: IslemType | null };
      type AylikRow = UrunHareket & { islemler?: IslemRel | IslemRel[] | null };
      (data as AylikRow[]).forEach((hareket) => {
        // İş tarihi: bağlı işlemin date'i; manuel hareket (islem_id NULL) ise created_at
        const islemRel = Array.isArray(hareket.islemler) ? hareket.islemler[0] : hareket.islemler;
        const isTarihi = islemRel?.date ?? hareket.created_at;
        if (!isTarihi) return;
        const ay = isTarihi.substring(0, 7); // YYYY-MM
        const mevcut = aylikMap.get(ay) || { giris: 0, cikis: 0, duzeltme: 0, girisTutar: 0, cikisTutar: 0 };

        // Tutar: KDV HARİÇ (net) — miktar × birim_fiyat. Para birimi ürünün currency'si
        // kabul edilir (per-satır gösterimle aynı; tek-para-birimi varsayımı).
        const tutar = Math.abs(hareket.miktar) * (hareket.birim_fiyat || 0);
        const miktarAbs = Math.abs(hareket.miktar);

        const yon = urunHareketYon(hareket.hareket_tipi, islemRel?.type);
        if (yon === 'duzeltme') {
          mevcut.duzeltme += hareket.miktar; // net düzeltme (pozitif = artış, negatif = azalış)
        } else if (isAlisAilesi(yon)) {
          const isaret = aileNetIsaret(yon); // +1 alış, -1 alış iadesi
          mevcut.giris += isaret * miktarAbs;
          mevcut.girisTutar += isaret * tutar;
        } else {
          const isaret = aileNetIsaret(yon); // +1 satış, -1 satış iadesi
          mevcut.cikis += isaret * miktarAbs;
          mevcut.cikisTutar += isaret * tutar;
        }

        aylikMap.set(ay, mevcut);
      });

      // Map'i array'e çevir ve sırala (en yeni ay en üstte)
      const sonuc: AylikUrunOzet[] = Array.from(aylikMap.entries())
        .map(([ay, degerler]) => ({
          ay,
          giris: degerler.giris,
          cikis: degerler.cikis,
          duzeltme: degerler.duzeltme,
          girisTutar: degerler.girisTutar,
          cikisTutar: degerler.cikisTutar,
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
    giris: number; // NET ALIŞ miktarı (alış − alış iadesi)
    cikis: number; // NET SATIŞ miktarı (satış − satış iadesi)
    girisTutar: number; // NET ALIŞ tutarı (alış − alış iadesi) — KDV hariç, ürünün para biriminde
    cikisTutar: number; // NET SATIŞ tutarı (satış − satış iadesi) — KDV hariç
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

      // İŞ TARİHİNE göre filtrele (created_at değil — düzenlemede NOW()'a kayıyor):
      //  - İşleme bağlı hareketler: islemler.date dönem içinde mi? (inner join → DB'de filtre)
      //  - Manuel hareketler (islem_id NULL): iş tarihi = created_at
      const [linkedRes, manualRes] = await Promise.all([
        supabase
          .from('urun_hareketler')
          .select('urun_id, hareket_tipi, miktar, birim_fiyat, islemler!inner(date, type)')
          .eq('isletme_id', isletme.id)
          .gte('islemler.date', `${startDate}T00:00:00`)
          .lte('islemler.date', `${endDate}T23:59:59`),
        supabase
          .from('urun_hareketler')
          .select('urun_id, hareket_tipi, miktar, birim_fiyat')
          .eq('isletme_id', isletme.id)
          .is('islem_id', null)
          .gte('created_at', `${startDate}T00:00:00`)
          .lte('created_at', `${endDate}T23:59:59`),
      ]);

      if (linkedRes.error) throw linkedRes.error;
      if (manualRes.error) throw manualRes.error;

      type DonemRow = UrunHareket & { islemler?: { type: IslemType | null } | { type: IslemType | null }[] | null };
      const data = [...(linkedRes.data ?? []), ...(manualRes.data ?? [])] as DonemRow[];

      // Ürün bazlı ALIŞ/SATIŞ net toplamları (stok yönü değil, finansal aile):
      // alış iadesi ALIŞ'tan, satış iadesi SATIŞ'tan düşülür (bkz. urunHareketYon).
      const ozet: DonemUrunOzet = {};

      data.forEach((hareket) => {
        if (!ozet[hareket.urun_id]) {
          ozet[hareket.urun_id] = { giris: 0, cikis: 0, girisTutar: 0, cikisTutar: 0 };
        }

        // Tutar: KDV hariç (net) — miktar × birim_fiyat. Düzeltmenin fiyatı olmaz.
        const tutar = Math.abs(hareket.miktar) * (hareket.birim_fiyat || 0);
        const islemRel = Array.isArray(hareket.islemler) ? hareket.islemler[0] : hareket.islemler;
        const yon = urunHareketYon(hareket.hareket_tipi, islemRel?.type);

        if (yon === 'duzeltme') {
          // Düzeltme: pozitif ise alış (giriş) tarafına, negatif ise satış (çıkış) tarafına
          // yaz (yalnızca miktar; tutar yok) — mevcut davranışla aynı.
          if (hareket.miktar > 0) {
            ozet[hareket.urun_id].giris += hareket.miktar;
          } else {
            ozet[hareket.urun_id].cikis += Math.abs(hareket.miktar);
          }
        } else if (isAlisAilesi(yon)) {
          const isaret = aileNetIsaret(yon); // +1 alış, -1 alış iadesi
          ozet[hareket.urun_id].giris += isaret * Math.abs(hareket.miktar);
          ozet[hareket.urun_id].girisTutar += isaret * tutar;
        } else {
          const isaret = aileNetIsaret(yon); // +1 satış, -1 satış iadesi
          ozet[hareket.urun_id].cikis += isaret * Math.abs(hareket.miktar);
          ozet[hareket.urun_id].cikisTutar += isaret * tutar;
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
          // İş tarihi: verilmişse seçilen tarih, yoksa DB now() (undefined -> JSON'da düşer)
          created_at: input.created_at,
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
 * Stok DÜZELTME — mutlak hedef miktarı ata (cache-güvenli).
 *
 * QuickUrunBar'daki eski akış delta'yı BAYAT cache'ten (hedef − urun.miktar)
 * hesaplayıp update_urun_miktar'a gönderiyordu → çok-cihaz senaryosunda stok yanlışa
 * kayabiliyordu. Bu hook set_urun_miktar_hedef RPC'sini çağırır: delta DB'de
 * FOR UPDATE ile güncel değerden hesaplanır, miktar hedefe atanır ve 'duzeltme'
 * hareketi tek transaction'da yazılır. Döndürdüğü değer yeni (uygulanmış) miktardır.
 */
export function useSetUrunMiktarHedef() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: { urun_id: string; hedef: number; created_at?: string; aciklama?: string | null }) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const { data, error } = await supabase.rpc('set_urun_miktar_hedef', {
        p_isletme_id: isletme.id,
        p_urun_id: input.urun_id,
        p_hedef: input.hedef,
        p_created_at: input.created_at ?? null,
        p_aciklama: input.aciklama ?? null,
      });

      if (error) throw error;
      return data as number;
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
    queryKey: queryKeys.urunHareketler.islemlerWithUrun(stableKey, isletme?.id || ''),
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
 * İşlem satırında kompakt ürün-kalem önizlemesi için tek kalem.
 */
export interface UrunKalemOzet {
  ad: string;
  miktar: number;
  birim_fiyat: number | null;
  birim: string;
}

// Modül düzeyi stabil boş referans — TransactionRow memo'sunu bozmamak için
// (getUrunItems her render yeni [] dönmemeli).
const EMPTY_KALEMLER: UrunKalemOzet[] = [];

/**
 * Birden fazla işlem için ürün KALEMLERİNİ (ad + miktar + birim fiyat) TEK batch
 * sorguda getir. Liste ekranlarında işlem satırında kalem önizlemesi için — map
 * içinde tek-tek sorgu (N+1) YAPMAZ. useIslemlerWithUrun deseninin kalem-detaylı hali.
 */
export function useUrunKalemlerByIslemIds(islemIds: string[]) {
  const { isletme, isletmeLoading } = useAuthContext();

  const stableKey = islemIds.length > 0 ? islemIds.slice().sort().join(',') : '';

  const result = useQuery({
    queryKey: queryKeys.urunHareketler.kalemlerByIslemler(stableKey, isletme?.id || ''),
    queryFn: async () => {
      if (!isletme || islemIds.length === 0) return new Map<string, UrunKalemOzet[]>();

      const { data, error } = await supabase
        .from('urun_hareketler')
        .select('islem_id, miktar, birim_fiyat, urunler(ad, birim)')
        .eq('isletme_id', isletme.id)
        .in('islem_id', islemIds)
        .not('islem_id', 'is', null)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const map = new Map<string, UrunKalemOzet[]>();
      data?.forEach((row) => {
        if (!row.islem_id) return;
        // Supabase ilişkisi object veya array dönebilir
        const urunRaw = row.urunler as unknown;
        const urun = Array.isArray(urunRaw) ? urunRaw[0] : urunRaw;
        const ad =
          urun && typeof urun === 'object' && 'ad' in urun ? (urun as { ad: string }).ad : null;
        if (!ad) return;
        const birim = (urun as { birim?: string })?.birim || 'adet';
        const list = map.get(row.islem_id) || [];
        list.push({
          ad,
          miktar: Math.abs(Number(row.miktar) || 0),
          birim_fiyat: row.birim_fiyat != null ? Number(row.birim_fiyat) : null,
          birim,
        });
        map.set(row.islem_id, list);
      });

      return map;
    },
    enabled: !!isletme && islemIds.length > 0,
    // Yeni islemIds'e geçerken eski veriyi koru — kalem önizlemesi flicker etmesin
    placeholderData: (previousData) => previousData,
  });

  // getUrunItems'i stabil tut: data refetch'inde Map yeniden kurulsa bile, bir islemId'nin
  // kalemleri İÇERİKÇE aynıysa ÖNCEKİ dizi referansını koru. Böylece TransactionRow memo'su
  // (referans karşılaştırması) gereksiz yere kırılıp tüm görünür satırlar yeniden render olmaz.
  // İçerik değişirse yeni referans döner → satır doğru güncellenir (stale-UI riski yok).
  const stableItemsRef = useRef<Map<string, UrunKalemOzet[]>>(new Map());
  const getUrunItems = useCallback(
    (islemId: string): UrunKalemOzet[] => {
      const next = result.data?.get(islemId);
      if (!next || next.length === 0) return EMPTY_KALEMLER;
      const prev = stableItemsRef.current.get(islemId);
      const same =
        prev != null &&
        prev.length === next.length &&
        prev.every((p, i) =>
          p.ad === next[i].ad &&
          p.miktar === next[i].miktar &&
          p.birim_fiyat === next[i].birim_fiyat &&
          p.birim === next[i].birim
        );
      if (same) return prev;
      stableItemsRef.current.set(islemId, next);
      return next;
    },
    [result.data]
  );

  return {
    ...result,
    isLoading: result.isLoading || isletmeLoading,
    getUrunItems,
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
      created_at?: string; // İş tarihi düzenlemesi; verilmezse değişmez
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
          // İş tarihi: verilmişse güncelle, yoksa undefined -> JSON'da düşer -> değişmez
          created_at: input.created_at,
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
 * Bir ürünlü işlem düzenlenirken stok hareketlerini ATOMİK yeniden uygula.
 *
 * Tek bir SECURITY DEFINER RPC (reapply_urun_hareketler_for_islem) çağırır: eski
 * hareketleri geri al + sil ve güncel satırları yeniden oluştur — hepsi tek
 * transaction'da. Herhangi bir adım hata verirse tüm değişiklikler geri sarılır,
 * yani stok ASLA yarım/tutarsız kalmaz. items boşsa yalnızca geri alma yapılır.
 */
export function useReapplyUrunHareketlerForIslem() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (input: {
      islemId: string;
      items: Array<{
        urun_id: string;
        hareket_tipi: UrunHareketTipi;
        miktar: number;
        birim_fiyat: number | null;
        kdv_orani: number | null;
        aciklama?: string | null;
      }>;
    }) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const { error } = await supabase.rpc('reapply_urun_hareketler_for_islem', {
        p_isletme_id: isletme.id,
        p_islem_id: input.islemId,
        p_items: input.items,
      });

      if (error) throw error;
      return { success: true };
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'urunHareket');
    },
  });
}

/**
 * Bir işleme bağlı TÜM ürün hareketlerini geri al (stok etkisini ters çevir) ve sil.
 *
 * İşlem düzenlenirken stoğu yeniden uygulamak için kullanılır: önce bununla eski
 * hareketleri geri al, sonra createUrunHareket ile güncel satırları yeniden oluştur.
 * Mantık useDeleteIslem içindeki ürün-hareketi geri alma akışının birebir aynısıdır.
 *
 * NOT: Atomik garanti için useReapplyUrunHareketlerForIslem tercih edilmelidir;
 * bu fonksiyon yedek/uyumluluk için tutulmaktadır.
 */
export function useReverseAndDeleteUrunHareketlerForIslem() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (islemId: string) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      const { data: hareketler, error: fetchError } = await supabase
        .from('urun_hareketler')
        .select('*')
        .eq('islem_id', islemId)
        .eq('isletme_id', isletme.id);

      if (fetchError) throw fetchError;
      if (!hareketler || hareketler.length === 0) return { reversed: 0 };

      // Her hareketin stok etkisini ters çevir
      for (const hareket of hareketler) {
        let miktarDegisim: number;
        if (hareket.hareket_tipi === 'giris') {
          miktarDegisim = -Math.abs(hareket.miktar); // girişi geri al
        } else if (hareket.hareket_tipi === 'cikis') {
          miktarDegisim = Math.abs(hareket.miktar); // çıkışı geri al
        } else {
          miktarDegisim = -hareket.miktar;
        }

        const { error: rpcError } = await supabase.rpc('update_urun_miktar', {
          p_urun_id: hareket.urun_id,
          p_miktar_degisim: miktarDegisim,
          p_isletme_id: isletme.id,
        });
        if (rpcError) throw rpcError;
      }

      // Hareket satırlarını sil
      const { error: deleteError } = await supabase
        .from('urun_hareketler')
        .delete()
        .eq('islem_id', islemId)
        .eq('isletme_id', isletme.id);

      if (deleteError) throw deleteError;
      return { reversed: hareketler.length };
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
        try {
          await supabase.rpc('increment_balance', { table_name: 'cariler', row_id: input.cari_id, amount: -balanceChange });
          await supabase.from('islemler').delete().eq('id', islem.id).eq('isletme_id', isletme.id);
        } catch (rollbackErr) {
          if (__DEV__) console.error('[useCreateUrunHareketWithCari] Rollback failed:', rollbackErr);
        }
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
          // İş tarihi: işlemle (islem.date) aynı tarih → cari ekstresi ile ürün raporu uyuşur
          created_at: input.date,
        })
        .select()
        .single();

      if (hareketError) {
        // Rollback: miktar geri al + cari balance geri al + işlem sil
        try {
          await supabase.rpc('update_urun_miktar', {
            p_urun_id: input.urun_id,
            p_miktar_degisim: -miktarDegisim,
            p_isletme_id: isletme.id,
          });
          await supabase.rpc('increment_balance', { table_name: 'cariler', row_id: input.cari_id, amount: -balanceChange });
          await supabase.from('islemler').delete().eq('id', islem.id).eq('isletme_id', isletme.id);
        } catch (rollbackErr) {
          if (__DEV__) console.error('[useCreateUrunHareketWithCari] Hareket rollback failed:', rollbackErr);
        }
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
          try {
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
          } catch (rollbackErr) {
            if (__DEV__) console.error('[useCreateBulkUrunHareketWithCari] RPC rollback failed:', rollbackErr);
          }
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
            // İş tarihi: işlemle (islem.date) aynı tarih → cari ekstresi ile ürün raporu uyuşur
            created_at: input.date,
          })
          .select()
          .single();

        if (hareketError) {
          // Rollback: tüm miktar güncellemelerini geri al + hareketleri sil + cari balance geri al + işlemi sil
          try {
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
          } catch (rollbackErr) {
            if (__DEV__) console.error('[useCreateBulkUrunHareketWithCari] Hareket rollback failed:', rollbackErr);
          }
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
