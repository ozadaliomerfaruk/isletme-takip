import { useCallback, useRef, type MutableRefObject } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { UrunHareket, UrunHareketInsert, UrunHareketTipi, IslemType, KdvOrani, HesapType } from '@/types/database';
import { invalidateRelatedQueries, queryKeys } from '@/lib/queryKeys';
import { toNumber, roundCurrency, formatQuantity } from '@/lib/currency';
import { urunHareketYon, aileNetIsaret, isAlisAilesi, isSatisAilesi } from '@/lib/urunHareket';
import { permissionAccessSignature } from '@/lib/permissionCacheGuard';
import {
  normalizeProductMutationItem,
  normalizeProductMutationItems,
} from '@/lib/productMutation';
import {
  ProductMovementPermissionError,
  getProductCreateDenialReason,
  getProductMovementDenialReason,
  type ProductMovementPermissionAction,
  type ProductMovementPermissionRecord,
  type ProductMovementPermissionSnapshot,
} from '@/lib/productMovementPermissions';
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
   * Bağlı asıl işlem satırının creator'ı. Ürün hareketinin kendi `created_by`
   * alanından ayrıdır; transaction edit own/all kapsamı bu alanla sınanır.
   */
  islemCreatedBy?: string | null;
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
 * Mutation açıkken rol/işletme değişirse hook'un ilk render'ındaki closure'a
 * güvenme. Ref her render'da senkron güncellenir; mutationFn yazmadan hemen önce
 * o anki izin ve tenant fotoğrafını tekrar okur.
 */
function useLatestProductMovementPermissions(): MutableRefObject<ProductMovementPermissionSnapshot> {
  const { isletme, user } = useAuthContext();
  const {
    canAccessModule,
    canCreate,
    canUpdate,
    canDelete,
  } = usePermissions();
  const latestRef = useRef<ProductMovementPermissionSnapshot>({
    isletmeId: null,
    userId: null,
    canCreate: false,
    canAccessCari: false,
    canCreateIslem: false,
    canUpdate: () => false,
    canDelete: () => false,
  });
  latestRef.current = {
    isletmeId: isletme?.id ?? null,
    userId: user?.id ?? null,
    canCreate: canCreate('urunler'),
    canAccessCari: canAccessModule('cariler'),
    canCreateIslem: canCreate('islemler'),
    canUpdate: (createdBy) => canUpdate('urunler', createdBy),
    canDelete: (createdBy) => canDelete('urunler', createdBy),
  };
  return latestRef;
}

function productMovementPermissionMessage(
  action: ProductMovementPermissionAction,
  reason: ProductMovementPermissionError['reason'],
): string {
  if (reason === 'ownership') {
    return i18n.t(
      action === 'delete'
        ? 'transactions:permissions.otherUserDeleteDenied'
        : 'transactions:permissions.otherUserUpdateDenied',
    );
  }
  return i18n.t('common:errors.permissionDenied');
}

function assertProductCreatePermission(
  permissionRef: MutableRefObject<ProductMovementPermissionSnapshot>,
  expectedIsletmeId: string,
): void {
  const reason = getProductCreateDenialReason(
    permissionRef.current,
    expectedIsletmeId,
  );
  if (reason) {
    throw new ProductMovementPermissionError(
      'create',
      reason,
      productMovementPermissionMessage('create', reason),
    );
  }
}

function assertCariLinkedCreatePermission(
  permissionRef: MutableRefObject<ProductMovementPermissionSnapshot>,
  expectedIsletmeId: string,
): void {
  assertProductCreatePermission(permissionRef, expectedIsletmeId);
  const snapshot = permissionRef.current;
  const deniedModule = !snapshot.canAccessCari
    ? 'cariler'
    : !snapshot.canCreateIslem
      ? 'islemler'
      : null;
  if (deniedModule) {
    throw new ProductMovementPermissionError(
      'create',
      'permission',
      productMovementPermissionMessage('create', 'permission'),
      deniedModule,
    );
  }
}

function assertProductMovementPermission(
  permissionRef: MutableRefObject<ProductMovementPermissionSnapshot>,
  expectedIsletmeId: string,
  action: Exclude<ProductMovementPermissionAction, 'create'>,
  record: ProductMovementPermissionRecord,
): void {
  const reason = getProductMovementDenialReason(
    permissionRef.current,
    expectedIsletmeId,
    action,
    record,
  );
  if (reason) {
    throw new ProductMovementPermissionError(
      action,
      reason,
      productMovementPermissionMessage(action, reason),
    );
  }
}

export interface UrunHareketMinimalCariLabel {
  urun_hareket_id: string;
  cari_name: string;
}

export interface UrunHareketKaynakEtiketi {
  movement_id: string;
  islem_id: string | null;
  islem_type: string | null;
  islem_date: string | null;
  cari_name: string | null;
  personel_name: string | null;
  hesap_name: string | null;
}

/**
 * Ürün hareketi için minimal cari etiketi.
 *
 * Cariler modülü kapalıyken temel cariler/islemler ilişkisini genişletmez; sunucu
 * yalnız hareket kimliği + gösterim adını döndürür. Dinamik yetki projeksiyonu
 * disk cache'e yazılmaz.
 */
export function useUrunHareketMinimalCariLabels(urunId: string | undefined) {
  const { isletme } = useAuthContext();
  const { canAccessModule } = usePermissions();
  const canSeeUrunler = canAccessModule('urunler');
  const canSeeCariler = canAccessModule('cariler');

  return useQuery({
    queryKey: [
      ...queryKeys.urunHareketler.byUrun(urunId || '', isletme?.id || ''),
      'minimal-cari-labels',
      'v1',
    ],
    queryFn: async (): Promise<UrunHareketMinimalCariLabel[]> => {
      if (!canSeeUrunler || canSeeCariler || !isletme || !urunId) return [];

      const { data, error } = await supabase.rpc(
        'get_urun_hareket_minimal_cari_labels',
        {
          p_isletme_id: isletme.id,
          p_urun_id: urunId,
        },
      );
      if (error) throw error;

      return (Array.isArray(data) ? data : []).flatMap((row) => {
        const raw = row as {
          urun_hareket_id?: unknown;
          cari_name?: unknown;
        };
        return typeof raw.urun_hareket_id === 'string' &&
            typeof raw.cari_name === 'string' &&
            raw.cari_name.trim().length > 0
          ? [{
              urun_hareket_id: raw.urun_hareket_id,
              cari_name: raw.cari_name,
            }]
          : [];
      });
    },
    enabled:
      canSeeUrunler &&
      !canSeeCariler &&
      !!isletme &&
      !!urunId,
    staleTime: 30_000,
    meta: {
      persist: false,
      query_purpose: 'urunler:minimal-cari-labels',
    },
  });
}

/**
 * Kapalı Personel/Hesap modüllerinden yalnız hareket satırında gösterilecek adı
 * alır. Kimlik, bakiye veya kaynak kaydı dönmez; dinamik sonuç diske yazılmaz.
 */
export function useUrunHareketKaynakEtiketleri(
  urunId: string | undefined,
) {
  const { isletme } = useAuthContext();
  const { canAccessModule } = usePermissions();
  const canSeeUrunler = canAccessModule('urunler');
  const canSeeCariler = canAccessModule('cariler');
  const canSeePersonel = canAccessModule('personel');
  const canSeeHesaplar = canAccessModule('hesaplar');
  const needsMinimalLabels =
    !canSeeCariler || !canSeePersonel || !canSeeHesaplar;

  return useQuery({
    queryKey: [
      ...queryKeys.urunHareketler.byUrun(urunId || '', isletme?.id || ''),
      'minimal-source-labels',
      'v1',
      canSeeCariler,
      canSeePersonel,
      canSeeHesaplar,
    ],
    queryFn: async (): Promise<UrunHareketKaynakEtiketi[]> => {
      if (
        !canSeeUrunler
        || !needsMinimalLabels
        || !isletme
        || !urunId
      ) {
        return [];
      }

      const { data, error } = await supabase.rpc(
        'get_urun_hareket_kaynak_etiketleri_v1',
        {
          p_isletme_id: isletme.id,
          p_urun_id: urunId,
        },
      );
      if (error) throw error;

      return (Array.isArray(data) ? data : []).flatMap((row) => {
        const raw = row as {
          movement_id?: unknown;
          islem_id?: unknown;
          islem_type?: unknown;
          islem_date?: unknown;
          cari_name?: unknown;
          personel_name?: unknown;
          hesap_name?: unknown;
        };
        if (typeof raw.movement_id !== 'string') return [];

        const cariName =
          typeof raw.cari_name === 'string'
          && raw.cari_name.trim().length > 0
            ? raw.cari_name
            : null;
        const personelName =
          typeof raw.personel_name === 'string'
          && raw.personel_name.trim().length > 0
            ? raw.personel_name
            : null;
        const hesapName =
          typeof raw.hesap_name === 'string'
          && raw.hesap_name.trim().length > 0
            ? raw.hesap_name
            : null;

        if (!cariName && !personelName && !hesapName) return [];

        return [{
          movement_id: raw.movement_id,
          islem_id:
            typeof raw.islem_id === 'string' ? raw.islem_id : null,
          islem_type:
            typeof raw.islem_type === 'string' ? raw.islem_type : null,
          islem_date:
            typeof raw.islem_date === 'string' ? raw.islem_date : null,
          cari_name: cariName,
          personel_name: personelName,
          hesap_name: hesapName,
        }];
      });
    },
    enabled:
      canSeeUrunler
      && needsMinimalLabels
      && !!isletme
      && !!urunId,
    staleTime: 30_000,
    meta: {
      persist: false,
      query_purpose: 'urunler:minimal-source-labels-v1',
    },
  });
}

/**
 * Ürünün SON işlem birim fiyatı (yön bazlı: alış → giriş, satış → çıkış).
 * Ürün seçicide fiyat alanını güncel piyasa fiyatıyla doldurmak için —
 * ürün kartındaki alis_fiyati/satis_fiyati işlemlerle güncellenmediğinden bayatlar.
 */
export function useSonUrunFiyati(urunId: string | undefined, yon: 'alis' | 'satis') {
  const { isletme } = useAuthContext();
  const { canAccessModule } = usePermissions();
  const canSeeUrunler = canAccessModule('urunler');

  return useQuery({
    queryKey: [...queryKeys.urunHareketler.byUrun(urunId || '', isletme?.id || ''), 'son-fiyat', yon],
    queryFn: async (): Promise<{ fiyat: number; tarih: string; marka: string | null } | null> => {
      if (!canSeeUrunler || !isletme || !urunId) return null;
      const { data, error } = await supabase
        .from('urun_hareketler')
        .select('birim_fiyat, marka, created_at, islem:islemler(date, type)')
        .eq('isletme_id', isletme.id)
        .eq('urun_id', urunId)
        .eq('hareket_tipi', yon === 'satis' ? 'cikis' : 'giris')
        .not('birim_fiyat', 'is', null)
        .gt('birim_fiyat', 0)
        .order('created_at', { ascending: false })
        .limit(15);
      if (error) throw error;
      if (!data || data.length === 0) return null;
      // İADE hariç: iade stok'u TERS yönde hareket ettirir (alış iadesi = 'cikis',
      // satış iadesi = 'giris'). hareket_tipi filtresi tek başına, "son satış fiyatı"
      // için bir ALIŞ İADESİNİN fiyatını (ya da tersini) döndürebilir → yanlış öneri.
      // İş tipine göre karşı-aile iadelerini ele.
      const excluded = yon === 'satis'
        ? new Set(['alis_iade', 'cari_alis_iade'])
        : new Set(['satis_iade', 'cari_satis_iade']);
      // created_at düzenleme/reapply'da NOW()'a kayar (bkz. islemDate notu yukarıda);
      // gerçek iş tarihi islem.date'tir → adaylar içinden iş tarihine göre seç.
      const adaylar = data
        .map((h) => {
          const islemRaw = Array.isArray(h.islem) ? h.islem[0] : h.islem;
          const meta = islemRaw as { date?: string; type?: string } | null;
          const tarih = meta?.date ?? h.created_at;
          return {
            fiyat: toNumber(h.birim_fiyat),
            tarih: String(tarih).slice(0, 10),
            marka: typeof h.marka === 'string' && h.marka.trim() ? h.marka.trim() : null,
            type: meta?.type,
          };
        })
        .filter((c) => !c.type || !excluded.has(c.type)); // type yoksa (düzeltme) güvenli tut
      if (adaylar.length === 0) return null;
      adaylar.sort((a, b) => (a.tarih < b.tarih ? 1 : -1));
      return {
        fiyat: adaylar[0].fiyat,
        tarih: adaylar[0].tarih,
        marka: adaylar[0].marka,
      };
    },
    enabled: canSeeUrunler && !!isletme && !!urunId,
    staleTime: 30_000,
  });
}

/**
 * Bir ürüne ait urun hareketlerini getir (cari bilgisi dahil)
 */
export function useUrunHareketler(urunId: string | undefined) {
  const { isletme, isletmeLoading } = useAuthContext();
  const { canAccessModule } = usePermissions();
  const canSeeUrunler = canAccessModule('urunler');
  const canSeeCariler = canAccessModule('cariler');
  const canSeeHesaplar = canAccessModule('hesaplar');
  const canSeePersonel = canAccessModule('personel');

  const result = useQuery({
    queryKey: [
      ...queryKeys.urunHareketler.byUrun(urunId || '', isletme?.id || ''),
      'source-visibility',
      canSeeCariler,
      canSeeHesaplar,
      canSeePersonel,
    ],
    queryFn: async () => {
      if (!canSeeUrunler || !isletme || !urunId) return [];

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
      // Urun baglaminda minimal cari adi sozlesme geregi gorulebilir. Hesap ve
      // personel kaynaklari ise yalniz ilgili modul aciksa ag yanitina/cach'e girer.
      const sourceSelect = [
        'id',
        'type',
        'date',
        'created_by',
        canSeeCariler ? 'cariler(id, name, type)' : null,
        canSeeHesaplar ? 'hesap:hesaplar!hesap_id(id, name, type)' : null,
        canSeePersonel ? 'personel:personel(id, first_name, last_name)' : null,
      ].filter(Boolean).join(', ');

      const { data: islemler, error: islemError } = await supabase
        .from('islemler')
        .select(sourceSelect)
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
      type SourceInfo = Pick<
        UrunHareketWithSource,
        | 'cari'
        | 'hesap'
        | 'personel'
        | 'islemType'
        | 'islemDate'
        | 'islemCreatedBy'
      >;
      const islemSourceMap = new Map<string, SourceInfo>();
      const sourceRows = islemler as unknown as Array<{
        id: string;
        type: string | null;
        date: string | null;
        created_by: string | null;
        cariler?: unknown;
        hesap?: unknown;
        personel?: unknown;
      }> | null;
      sourceRows?.forEach(islem => {
        const cariData = normalizeRel(islem.cariler);
        const hesapData = normalizeRel(islem.hesap);
        const personelData = normalizeRel(islem.personel);
        islemSourceMap.set(islem.id, {
          islemType: (islem.type as IslemType) ?? null,
          islemDate: islem.date ?? null,
          islemCreatedBy: islem.created_by ?? null,
          cari: canSeeCariler && cariData
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
          islemCreatedBy: src?.islemCreatedBy,
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
    enabled: !!isletme && !!urunId && canSeeUrunler,
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
  const { canAccessModule } = usePermissions();
  const canSeeUrunler = canAccessModule('urunler');

  const result = useQuery({
    queryKey: queryKeys.urunHareketler.aylikOzet(urunId || '', isletme?.id || ''),
    queryFn: async () => {
      if (!canSeeUrunler || !isletme || !urunId) return [];

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
    enabled: canSeeUrunler && !!isletme && !!urunId,
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
  const {
    isletme,
    isletmeLoading,
    user,
    currentPermissions,
  } = useAuthContext();
  const { canAccessModule } = usePermissions();
  const canSeeUrunler = canAccessModule('urunler');
  const { startDate, endDate } = options;
  const accessSignature = permissionAccessSignature(currentPermissions);

  const result = useQuery({
    queryKey: [
      ...queryKeys.urunHareketler.donemOzet(
        isletme?.id || '',
        startDate,
        endDate,
      ),
      user?.id ?? 'no-user',
      accessSignature,
    ],
    meta: { persist: false },
    queryFn: async () => {
      if (!canSeeUrunler || !isletme) return {} as DonemUrunOzet;

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
    enabled: canSeeUrunler && !!isletme && !!startDate && !!endDate,
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
  const permissionRef = useLatestProductMovementPermissions();

  return useMutation({
    mutationFn: async (input: UrunHareketInsert) => {
      const isletmeId = permissionRef.current.isletmeId;
      if (!isletmeId) throw new Error(i18n.t('common:errors.businessNotFound'));
      assertProductCreatePermission(permissionRef, isletmeId);

      // 1. Önce mevcut ürün miktarını al
      const { data: urun, error: urunError } = await supabase
        .from('urunler')
        .select('miktar, isletme_id')
        .eq('id', input.urun_id)
        .eq('isletme_id', isletmeId)
        .single();

      if (urunError) throw urunError;
      if (!urun) throw new Error(i18n.t('common:errors.productNotFound'));
      if (urun.isletme_id !== isletmeId) {
        throw new ProductMovementPermissionError(
          'create',
          'tenant',
          productMovementPermissionMessage('create', 'tenant'),
        );
      }

      // İzin ürün okuması sürerken değişmiş olabilir; write öncesi güncel ref'i
      // yeniden doğrula. Asıl yetki kapısı V2 RPC içinde de sunucu tarafındadır.
      assertProductCreatePermission(permissionRef, isletmeId);
      const { data: hareket, error: hareketError } = await supabase
        .rpc('create_urun_hareket_atomik_v2', {
          p_isletme_id: isletmeId,
          p_new_row: input,
        });

      if (hareketError) throw hareketError;

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
  const permissionRef = useLatestProductMovementPermissions();

  return useMutation({
    mutationFn: async (input: { urun_id: string; hedef: number; created_at?: string; aciklama?: string | null }) => {
      const isletmeId = permissionRef.current.isletmeId;
      if (!isletmeId) throw new Error(i18n.t('common:errors.businessNotFound'));
      assertProductCreatePermission(permissionRef, isletmeId);

      const { data, error } = await supabase.rpc('set_urun_miktar_hedef', {
        p_isletme_id: isletmeId,
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
  const { canAccessModule } = usePermissions();
  const canSeeUrunler = canAccessModule('urunler');

  // Batch islemIds in chunks of 100 to avoid too-large queries, but use a stable key
  const stableKey = islemIds.length > 0 ? islemIds.slice().sort().join(',') : '';

  const result = useQuery({
    queryKey: queryKeys.urunHareketler.islemlerWithUrun(stableKey, isletme?.id || ''),
    queryFn: async () => {
      if (!canSeeUrunler || !isletme || islemIds.length === 0) return new Map<string, number>();

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
    enabled: canSeeUrunler && !!isletme && islemIds.length > 0,
    // Keep previous data while refetching with new islemIds to prevent icon flicker
    placeholderData: (previousData) => previousData,
  });

  // Persist güvenliği: Map JSON'a serileşmediğinden eski disk cache düz obje ({}) olarak
  // hydrate olabilir → .get patlar. Map değilse yok say (refetch gerçek Map'i getirir).
  const dataMap = result.data instanceof Map ? result.data : undefined;
  return {
    ...result,
    isLoading: result.isLoading || isletmeLoading,
    hasUrun: (islemId: string) => (dataMap?.get(islemId) ?? 0) > 0,
    getUrunCount: (islemId: string) => dataMap?.get(islemId) ?? 0,
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
const URUN_KALEM_BATCH_SIZE = 100;

interface UrunKalemRuntimeRow {
  islem_id?: unknown;
  miktar?: unknown;
  birim_fiyat?: unknown;
  urun_ad?: unknown;
  urun_birim?: unknown;
  urunler?: unknown;
}

interface UrunKalemBatchResult {
  items: Map<string, UrunKalemOzet[]>;
  counts: Map<string, number>;
}

/**
 * Birden fazla işlem için ürün KALEMLERİNİ (ad + miktar + birim fiyat) TEK batch
 * sorguda getir. Liste ekranlarında işlem satırında kalem önizlemesi için — map
 * içinde tek-tek sorgu (N+1) YAPMAZ. useIslemlerWithUrun deseninin kalem-detaylı hali.
 */
export function useUrunKalemlerByIslemIds(
  islemIds: string[],
  allowTransactionContextRead = false,
) {
  const {
    isletme,
    isletmeLoading,
    user,
    currentPermissions,
  } = useAuthContext();
  const { canAccessModule } = usePermissions();
  const canSeeUrunler = canAccessModule('urunler');
  const canReadAuthorizedTransactionItems =
    canSeeUrunler || allowTransactionContextRead;
  const accessSignature = permissionAccessSignature(currentPermissions);

  const stableKey = islemIds.length > 0 ? islemIds.slice().sort().join(',') : '';

  const result = useQuery({
    queryKey: [
      ...queryKeys.urunHareketler.kalemlerByIslemler(
        stableKey,
        isletme?.id || '',
      ),
      canSeeUrunler ? 'urunler-direct' : 'transaction-context-rpc',
      user?.id ?? '',
      accessSignature,
    ],
    queryFn: async () => {
      if (
        !canReadAuthorizedTransactionItems
        || !isletme
        || islemIds.length === 0
      ) {
        return {
          items: new Map<string, UrunKalemOzet[]>(),
          counts: new Map<string, number>(),
        } satisfies UrunKalemBatchResult;
      }

      const batches: string[][] = [];
      for (let index = 0; index < islemIds.length; index += URUN_KALEM_BATCH_SIZE) {
        batches.push(islemIds.slice(index, index + URUN_KALEM_BATCH_SIZE));
      }
      const batchResults = await Promise.all(
        batches.map((batch) => (
          canSeeUrunler
            ? supabase
                .from('urun_hareketler')
                .select('islem_id, miktar, birim_fiyat, urunler(ad, birim)')
                .eq('isletme_id', isletme.id)
                .in('islem_id', batch)
                .not('islem_id', 'is', null)
                .order('created_at', { ascending: true })
            : supabase.rpc('get_yetkili_islem_urun_kalemleri_v1', {
                p_isletme_id: isletme.id,
                p_islem_ids: batch,
              })
        )),
      );

      const map = new Map<string, UrunKalemOzet[]>();
      const counts = new Map<string, number>();
      const rows: UrunKalemRuntimeRow[] = [];
      batchResults.forEach(({ data, error }) => {
        if (error) throw error;
        if (Array.isArray(data)) {
          rows.push(...(data as UrunKalemRuntimeRow[]));
        }
      });
      rows.forEach((row) => {
        const islemId =
          typeof row.islem_id === 'string' ? row.islem_id : null;
        if (!islemId) return;
        // Presence is a security decision and must not depend on a relation
        // label being visible. RLS-hidden/passive product relations can yield a
        // raw movement row with no product name; it is still productful.
        counts.set(islemId, (counts.get(islemId) ?? 0) + 1);
        const urunRaw = row.urunler ?? null;
        const urun = Array.isArray(urunRaw) ? urunRaw[0] : urunRaw;
        const rpcAd = row.urun_ad;
        const ad = canSeeUrunler
          ? urun && typeof urun === 'object' && 'ad' in urun
            ? (urun as { ad: string }).ad
            : null
          : typeof rpcAd === 'string'
            ? rpcAd
            : null;
        const rpcBirim = row.urun_birim;
        const birim = canSeeUrunler
          ? (urun as { birim?: string })?.birim || 'adet'
          : typeof rpcBirim === 'string'
            ? rpcBirim
            : 'adet';
        const list = map.get(islemId) || [];
        list.push({
          ad: ad || '-',
          miktar: Math.abs(Number(row.miktar) || 0),
          birim_fiyat:
            row.birim_fiyat != null ? Number(row.birim_fiyat) : null,
          birim,
        });
        map.set(islemId, list);
      });

      return { items: map, counts } satisfies UrunKalemBatchResult;
    },
    enabled:
      canReadAuthorizedTransactionItems
      && !!isletme
      && islemIds.length > 0,
    placeholderData: (previousData) => previousData,
    meta: {
      persist: false,
      query_purpose: 'urun-hareketleri:authorized-transaction-items',
    },
  });

  // getUrunItems'i stabil tut: data refetch'inde Map yeniden kurulsa bile, bir islemId'nin
  // kalemleri İÇERİKÇE aynıysa ÖNCEKİ dizi referansını koru. Böylece TransactionRow memo'su
  // (referans karşılaştırması) gereksiz yere kırılıp tüm görünür satırlar yeniden render olmaz.
  // İçerik değişirse yeni referans döner → satır doğru güncellenir (stale-UI riski yok).
  const stableItemsRef = useRef<Map<string, UrunKalemOzet[]>>(new Map());
  // Persist güvenliği: Map JSON'a serileşmediğinden eski disk cache düz obje ({}) olarak
  // hydrate olabilir → .get patlar. Map değilse yok say (refetch gerçek Map'i getirir).
  const batchData =
    result.data
    && typeof result.data === 'object'
    && 'items' in result.data
    && result.data.items instanceof Map
    && 'counts' in result.data
    && result.data.counts instanceof Map
      ? result.data
      : undefined;
  const dataMap = batchData?.items;
  const countMap = batchData?.counts;
  // An empty result is authoritative only after the exact id-set query has
  // completed. Previous/placeholder data and failed queries must never let a
  // mutation path misclassify a productful transaction as productless.
  const isProductItemsResolved =
    islemIds.length === 0
    || (
      canReadAuthorizedTransactionItems
      && !isletmeLoading
      && dataMap !== undefined
      && !result.isPending
      && !result.isLoading
      && !result.isError
      && !result.isRefetchError
      && !result.isPlaceholderData
    );
  const getUrunItems = useCallback(
    (islemId: string): UrunKalemOzet[] => {
      const next = dataMap?.get(islemId);
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
    [dataMap]
  );
  const getProductItemCount = useCallback(
    (islemId: string): number => countMap?.get(islemId) ?? 0,
    [countMap],
  );

  return {
    ...result,
    isLoading: result.isLoading || isletmeLoading,
    isProductItemsResolved,
    getUrunItems,
    getProductItemCount,
  };
}

/**
 * Bir işleme ait urun hareketlerini getir (edit mode için)
 */
export function useUrunHareketlerByIslemId(islemId: string | undefined) {
  const { isletme, isletmeLoading } = useAuthContext();
  const { canAccessModule } = usePermissions();
  const canSeeUrunler = canAccessModule('urunler');

  const result = useQuery({
    queryKey: queryKeys.urunHareketler.byIslem(islemId || '', isletme?.id || ''),
    queryFn: async () => {
      if (!canSeeUrunler || !isletme || !islemId) return [];

      const { data, error } = await supabase
        .from('urun_hareketler')
        .select('*, urunler(*)')
        .eq('isletme_id', isletme.id)
        .eq('islem_id', islemId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as (UrunHareket & {
        urunler: { ad: string; birim: string; marka?: string | null };
      })[];
    },
    enabled: canSeeUrunler && !!isletme && !!islemId,
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
  const permissionRef = useLatestProductMovementPermissions();

  return useMutation({
    // Ürün hareketi + stok etkisi finansal write'tır; HTTP cevabı kaybolursa mutation'ın
    // tamamını körlemesine baştan koşturma.
    retry: false,
    mutationFn: async (input: {
      id: string;
      miktar: number;
      birim_fiyat: number | null;
      hareket_tipi: UrunHareketTipi;
      created_at?: string; // İş tarihi düzenlemesi; verilmezse değişmez
    }) => {
      const isletmeId = permissionRef.current.isletmeId;
      if (!isletmeId) throw new Error(i18n.t('common:errors.businessNotFound'));

      // 1. Önce mevcut hareketi al
      const { data: eskiHareket, error: eskiError } = await supabase
        .from('urun_hareketler')
        .select('*')
        .eq('id', input.id)
        .eq('isletme_id', isletmeId)
        .single();

      if (eskiError) throw eskiError;
      if (!eskiHareket) throw new Error(i18n.t('common:errors.movementNotFound'));
      assertProductMovementPermission(
        permissionRef,
        isletmeId,
        'update',
        eskiHareket,
      );

      // 2. İşlem bağlantılı hareketler güncellenemez
      if (eskiHareket.islem_id) {
        throw new Error(i18n.t('common:errors.movementLinkedCannotUpdate'));
      }

      assertProductMovementPermission(
        permissionRef,
        isletmeId,
        'update',
        eskiHareket,
      );
      const {
        data: guncellenmisHareket,
        error: updateError,
      } = await supabase
        .rpc('update_urun_hareket_atomik_v2', {
          p_isletme_id: isletmeId,
          p_hareket_id: input.id,
          p_patch: {
            hareket_tipi: input.hareket_tipi,
            miktar: input.miktar,
            birim_fiyat: input.birim_fiyat,
            created_at: input.created_at,
          },
        });

      if (updateError) throw updateError;

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
  const permissionRef = useLatestProductMovementPermissions();

  return useMutation({
    mutationFn: async (hareketId: string) => {
      const isletmeId = permissionRef.current.isletmeId;
      if (!isletmeId) throw new Error(i18n.t('common:errors.businessNotFound'));

      // 1. Önce hareketi al
      const { data: hareket, error: hareketError } = await supabase
        .from('urun_hareketler')
        .select('*')
        .eq('id', hareketId)
        .eq('isletme_id', isletmeId)
        .single();

      if (hareketError) throw hareketError;
      if (!hareket) throw new Error(i18n.t('common:errors.movementNotFound'));
      assertProductMovementPermission(
        permissionRef,
        isletmeId,
        'delete',
        hareket,
      );

      // 2. İşlem bağlantılı hareketler silinemez
      if (hareket.islem_id) {
        throw new Error(i18n.t('common:errors.movementLinkedCannotDelete'));
      }

      assertProductMovementPermission(
        permissionRef,
        isletmeId,
        'delete',
        hareket,
      );
      const { error: deleteError } = await supabase
        .rpc('delete_urun_hareket_atomik_v2', {
          p_isletme_id: isletmeId,
          p_hareket_id: hareketId,
        });

      if (deleteError) throw deleteError;

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
    // Stok geri-al + yeniden-uygula tek atomik write'tır. HTTP cevabı kaybolursa tüm RPC'yi
    // otomatik tekrarlamak yerine çağıran sonucu kontrollü biçimde ele alır.
    retry: false,
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
        p_items: normalizeProductMutationItems(input.items),
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
 * Eski çağıranlarla export API'sini korur; gerçek geri-alma ve silme işlemini boş
 * items ile kanonik reapply_urun_hareketler_for_islem RPC'sine bırakır. Böylece
 * stok ve hareket satırları tek veritabanı transaction'ında değişir.
 */
export function useReverseAndDeleteUrunHareketlerForIslem() {
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (islemId: string) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));

      // `reversed` dönüş alanı eski API ile uyumluluk içindir; sayım yalnız bilgi
      // amaçlıdır, bütünlük garantisini aşağıdaki tek RPC sağlar.
      const { count: movementCount, error: countError } = await supabase
        .from('urun_hareketler')
        .select('id', { count: 'exact', head: true })
        .eq('islem_id', islemId)
        .eq('isletme_id', isletme.id);

      if (countError) throw countError;

      const { error } = await supabase.rpc('reapply_urun_hareketler_for_islem', {
        p_isletme_id: isletme.id,
        p_islem_id: islemId,
        p_items: [],
      });

      if (error) throw error;
      return { reversed: movementCount ?? 0 };
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
  /**
   * Ürünün birim KODU ('adet' | 'kg' | 'lt' ...). Otomatik açıklamada çevirisi kullanılır.
   * Verilmezse 'adet' varsayılır (eski davranış). Çağıran zaten urun nesnesine sahip.
   */
  birim?: string | null;
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
  const permissionRef = useLatestProductMovementPermissions();

  return useMutation({
    mutationFn: async (input: CreateUrunHareketWithCariInput) => {
      const isletmeId = permissionRef.current.isletmeId;
      if (!isletmeId) throw new Error(i18n.t('common:errors.businessNotFound'));
      assertCariLinkedCreatePermission(permissionRef, isletmeId);

      // İşlem tipi: giris → cari_alis (tedarikçiden alım), cikis → cari_satis (müşteriye satış)
      const islemType: IslemType = input.hareket_tipi === 'giris' ? 'cari_alis' : 'cari_satis';

      // KDV dahil toplam tutarı hesapla
      const normalizedItem = normalizeProductMutationItem({
        miktar: input.miktar,
        birim_fiyat: input.birim_fiyat,
      });
      const subtotal = normalizedItem.miktar * normalizedItem.birim_fiyat;
      const kdvAmount = subtotal * (input.kdv_orani / 100);
      const totalAmount = roundCurrency(subtotal + kdvAmount);

      // ATOMİK: islem + cari bakiye + ürün hareketi TEK transaction (create_islem_with_urun_atomik).
      // Önceden 4 ayrı adım + yutulan best-effort rollback vardı → ortada patlarsa kısmi stok/bakiye.
      // Bakiye: cari_alis -total, cari_satis +total (mevcut balanceChange ile BİREBİR).
      const { data, error } = await supabase.rpc('create_islem_with_urun_atomik', {
        p_isletme_id: isletmeId,
        p_new_row: {
          type: islemType,
          amount: totalAmount,
          cari_id: input.cari_id,
          hesap_id: input.hesap_id ?? null,
          // Otomatik açıklama DB'YE YAZILIR (sonradan çevrilemez) — bu yüzden sabit
          // Türkçe "adet" ve ham miktar interpolasyonu kabul edilemez: İngilizce
          // kullanıcının İşlemler listesinde kalıcı olarak "Cement - 2.5 adet" kalıyordu
          // ve ham interpolasyon her zaman NOKTA bastığı için TR kullanıcı 5.977 kg'ı
          // "5977" okuyabiliyordu. formatQuantity + birim çevirisi ile üretiliyor.
          description:
            input.aciklama ||
            i18n.t('products:stock.autoDescription', {
              name: input.urun_ad,
              qty: formatQuantity(normalizedItem.miktar),
              unit: i18n.t(`products:units.${input.birim || 'adet'}`),
            }),
          date: input.date || new Date().toISOString(),
        },
        p_balance_ops: [{
          t: 'cariler',
          id: input.cari_id,
          d: islemType === 'cari_alis' ? -totalAmount : totalAmount,
        }],
        p_items: [{
          urun_id: input.urun_id,
          hareket_tipi: input.hareket_tipi,
          miktar: normalizedItem.miktar,
          birim_fiyat: normalizedItem.birim_fiyat,
          kdv_orani: input.kdv_orani,
          aciklama: input.aciklama ?? null,
        }],
      });

      if (error) throw error;
      const islem = data as { id: string };
      return { islemId: islem.id, totalAmount };
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
  const permissionRef = useLatestProductMovementPermissions();

  return useMutation({
    mutationFn: async (input: CreateBulkUrunHareketWithCariInput) => {
      const isletmeId = permissionRef.current.isletmeId;
      if (!isletmeId) throw new Error(i18n.t('common:errors.businessNotFound'));
      assertCariLinkedCreatePermission(permissionRef, isletmeId);
      if (input.items.length === 0) throw new Error(i18n.t('common:errors.atLeastOneProductRequired'));

      const islemType: IslemType = input.hareket_tipi === 'giris' ? 'cari_alis' : 'cari_satis';

      // Toplam tutarı hesapla (tüm ürünlerin KDV dahil toplamı)
      const normalizedItems = normalizeProductMutationItems(input.items);
      const grandTotal = roundCurrency(normalizedItems.reduce((acc, item) => {
        const subtotal = item.miktar * item.birim_fiyat;
        const kdv = subtotal * (item.kdv_orani / 100);
        return acc + subtotal + kdv;
      }, 0));

      // Ürün adları listesi (açıklama için). Miktar formatQuantity'den geçer: ham
      // interpolasyon her zaman NOKTA basıyordu (TR'de 5.977 kg → "5977" okunabiliyor).
      const urunListesi = input.items.map(i => `${i.urun_ad} (${formatQuantity(i.miktar)})`).join(', ');

      // ATOMİK: tek islem + cari bakiye + N ürün hareketi TEK transaction
      // (create_islem_with_urun_atomik). Önceden ardışık adımlar + yutulan best-effort
      // rollback vardı → çok-kalemde ortada patlarsa kısmi stok/bakiye. Bakiye mevcutla BİREBİR.
      const { data, error } = await supabase.rpc('create_islem_with_urun_atomik', {
        p_isletme_id: isletmeId,
        p_new_row: {
          type: islemType,
          amount: grandTotal,
          cari_id: input.cari_id,
          hesap_id: input.hesap_id ?? null,
          description: input.aciklama || urunListesi,
          date: input.date || new Date().toISOString(),
        },
        p_balance_ops: [{
          t: 'cariler',
          id: input.cari_id,
          d: islemType === 'cari_alis' ? -grandTotal : grandTotal,
        }],
        p_items: normalizedItems.map((item) => ({
          urun_id: item.urun_id,
          hareket_tipi: input.hareket_tipi,
          miktar: item.miktar,
          birim_fiyat: item.birim_fiyat,
          kdv_orani: item.kdv_orani,
          aciklama: input.aciklama ?? null,
        })),
      });

      if (error) throw error;
      const islem = data as { id: string };
      return {
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

// === Ürün detay dashboard özeti (get_urun_ozet RPC) ===
export interface UrunOzet {
  /** Net alış tutarı (alış − alış iadesi), KDV hariç, ürün para biriminde */
  alisTutar: number;
  /** Net satış tutarı (satış − satış iadesi), KDV hariç */
  satisTutar: number;
  /** Net alış miktarı */
  alisMiktar: number;
  /** Net satış miktarı */
  satisMiktar: number;
}

/**
 * Ürünün ömür-boyu alış/satış toplamları (tutar + miktar). RPC hareket_tipi ×
 * işlem-tipi kırılımını döndürür; aile netleştirmesi (iade düşümü) CLIENT'ta
 * urunHareketYon ile yapılır — TS'teki aile kuralları tek kaynak kalır.
 */
export function useUrunOzet(urunId: string | undefined, enabled = true) {
  const { isletme } = useAuthContext();
  const { canAccessModule } = usePermissions();
  const canSeeUrunler = canAccessModule('urunler');

  return useQuery({
    queryKey: queryKeys.urunHareketler.urunOzet(urunId ?? '', isletme?.id ?? ''),
    enabled: enabled && canSeeUrunler && !!urunId && !!isletme?.id,
    queryFn: async (): Promise<UrunOzet> => {
      const bos: UrunOzet = { alisTutar: 0, satisTutar: 0, alisMiktar: 0, satisMiktar: 0 };
      if (!canSeeUrunler || !urunId || !isletme?.id) return bos;
      const { data, error } = await supabase.rpc('get_urun_ozet', {
        p_isletme_id: isletme.id,
        p_urun_id: urunId,
      });
      if (error) throw error;

      const rows = (data ?? []) as { hareket_tipi: UrunHareketTipi; islem_type: IslemType | null; miktar: unknown; tutar: unknown }[];
      const out = { ...bos };
      for (const r of rows) {
        const yon = urunHareketYon(r.hareket_tipi, r.islem_type);
        const isaret = aileNetIsaret(yon);
        if (isaret === 0) continue; // düzeltme aileye yazılmaz
        const miktar = Number(r.miktar) || 0;
        const tutar = Number(r.tutar) || 0;
        if (isAlisAilesi(yon)) {
          out.alisMiktar += isaret * miktar;
          out.alisTutar = roundCurrency(out.alisTutar + isaret * tutar);
        } else if (isSatisAilesi(yon)) {
          out.satisMiktar += isaret * miktar;
          out.satisTutar = roundCurrency(out.satisTutar + isaret * tutar);
        }
      }
      return out;
    },
  });
}
