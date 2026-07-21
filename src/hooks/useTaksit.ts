import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/queryKeys';
import { roundCurrency } from '@/lib/currency';

/**
 * Taksit (Faz 3) okuma hook'ları. Yazma yolu QTB → taksit_plani_olustur RPC
 * (useCreateIslemTaksitli); burada yalnız liste/detay okunur. Tüm "ödenen/kalan"
 * değerleri tahsis defterinden türer — balance'a hiçbir katkısı yoktur.
 */

export interface TaksitPlanOzet {
  plan_id: string;
  islem_id: string;
  cari_id: string;
  cari_name: string;
  currency: string;
  type: 'cari_satis' | 'cari_alis';
  islem_date: string;
  toplam: number;
  taksit_adedi: number;
  odenen: number;
  odenen_taksit_adedi: number;
  sonraki_vade: string | null;
  gecikmis_adet: number;
}

export function useTaksitPlanListesi(enabled = true) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.taksit.list(isletme?.id ?? ''),
    enabled: enabled && !!isletme?.id,
    queryFn: async (): Promise<TaksitPlanOzet[]> => {
      if (!isletme?.id) return [];
      const { data, error } = await supabase.rpc('get_taksit_plan_listesi', {
        p_isletme_id: isletme.id,
      });
      if (error) throw error;
      return ((data as TaksitPlanOzet[]) ?? []).map((r) => ({
        ...r,
        toplam: Number(r.toplam) || 0,
        odenen: Number(r.odenen) || 0,
        taksit_adedi: Number(r.taksit_adedi) || 0,
        odenen_taksit_adedi: Number(r.odenen_taksit_adedi) || 0,
        gecikmis_adet: Number(r.gecikmis_adet) || 0,
      }));
    },
  });
}

/**
 * İşlemin taksit planı var mı? — QTB edit'te vade segmentini kilitlemek için
 * hafif kontrol. Sunucudaki update_islem_atomik taksitli işlemde vade'yi
 * SESSİZCE koruduğundan (taksit satırlarıyla senkron kalmalı), kullanıcının
 * boşuna vade değiştirip "güncellenmedi" yaşamaması için UI'da engellenir.
 */
export function useIslemTaksitliMi(islemId: string | undefined) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.taksit.byIslem(islemId ?? '', isletme?.id ?? ''),
    enabled: !!islemId && !!isletme?.id,
    queryFn: async (): Promise<boolean> => {
      if (!islemId || !isletme?.id) return false;
      const { data, error } = await supabase
        .from('taksit_planlari')
        .select('id')
        .eq('islem_id', islemId)
        .eq('isletme_id', isletme.id)
        .limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
  });
}

export interface BuAyTaksitOzeti {
  /** Bu ay vadesi gelen ve kalanı açık taksit sayısı (tüm para birimleri). */
  adet: number;
  /** Ana para birimindeki satış taksitlerinin kalan toplamı (tahsil edilecek). */
  tahsilKalan: number;
  /** Ana para birimindeki alış taksitlerinin kalan toplamı (ödenecek). */
  odemeKalan: number;
  currency: string;
}

/**
 * Cariler mini-dashboard "Bu Ay Taksit" kartı: içinde bulunulan ayda vadesi gelen
 * açık taksitlerin adedi + yön bazlı kalan toplamları. Tutarlar TEK para biriminde
 * (TRY varsa TRY, yoksa ilk görülen) toplanır — çapraz-para toplama YOK (Net Varlık
 * artefakt dersi); adet tüm para birimlerini sayar.
 */
export function useBuAyTaksitOzeti(enabled = true) {
  const { isletme } = useAuthContext();
  const now = new Date();
  const ay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  return useQuery({
    queryKey: queryKeys.taksit.buAy(isletme?.id ?? '', ay),
    enabled: enabled && !!isletme?.id,
    queryFn: async (): Promise<BuAyTaksitOzeti> => {
      const bos: BuAyTaksitOzeti = { adet: 0, tahsilKalan: 0, odemeKalan: 0, currency: 'TRY' };
      if (!isletme?.id) return bos;

      const yil = now.getFullYear();
      const ayIdx = now.getMonth();
      const start = `${yil}-${String(ayIdx + 1).padStart(2, '0')}-01`;
      const sonGun = new Date(yil, ayIdx + 1, 0).getDate();
      const end = `${yil}-${String(ayIdx + 1).padStart(2, '0')}-${String(sonGun).padStart(2, '0')}`;

      const { data: taksitler, error } = await supabase
        .from('taksitler')
        .select('id, tutar, islem:islemler(type, cari:cariler(currency))')
        .eq('isletme_id', isletme.id)
        .gte('vade_tarihi', start)
        .lte('vade_tarihi', end);
      if (error) throw error;
      if (!taksitler || taksitler.length === 0) return bos;

      const { data: tahsisler, error: tErr } = await supabase
        .from('islem_tahsis')
        .select('taksit_id, tutar')
        .eq('isletme_id', isletme.id)
        .in('taksit_id', taksitler.map((tk) => tk.id));
      if (tErr) throw tErr;

      const odenenMap: Record<string, number> = {};
      for (const t of tahsisler ?? []) {
        if (!t.taksit_id) continue;
        odenenMap[t.taksit_id] = roundCurrency((odenenMap[t.taksit_id] ?? 0) + (Number(t.tutar) || 0));
      }

      type Satir = { kalan: number; type: string; currency: string };
      const acik: Satir[] = [];
      for (const tk of taksitler) {
        const kalan = roundCurrency((Number(tk.tutar) || 0) - (odenenMap[tk.id] ?? 0));
        if (kalan <= 0.009) continue;
        const islemRaw = (tk as { islem?: unknown }).islem;
        const islem = (Array.isArray(islemRaw) ? islemRaw[0] : islemRaw) as
          | { type?: string; cari?: { currency?: string | null } | { currency?: string | null }[] }
          | undefined;
        const cariRaw = islem?.cari;
        const cari = Array.isArray(cariRaw) ? cariRaw[0] : cariRaw;
        acik.push({ kalan, type: islem?.type ?? '', currency: cari?.currency || 'TRY' });
      }
      if (acik.length === 0) return bos;

      const currency = acik.some((s) => s.currency === 'TRY') ? 'TRY' : acik[0].currency;
      return {
        adet: acik.length,
        tahsilKalan: roundCurrency(acik.filter((s) => s.currency === currency && s.type === 'cari_satis').reduce((a, s) => a + s.kalan, 0)),
        odemeKalan: roundCurrency(acik.filter((s) => s.currency === currency && s.type === 'cari_alis').reduce((a, s) => a + s.kalan, 0)),
        currency,
      };
    },
  });
}

export interface TaksitSatirDetay {
  id: string;
  sira: number;
  vade_tarihi: string;
  tutar: number;
  odenen: number;
  kalan: number;
}

export interface TaksitPlanDetay {
  planId: string;
  islemId: string;
  /* Plan meta'sı detay sorgusunun KENDİSİNDEN gelir (işlem + cari join) —
     liste sorgusuna bağımlılık deep-link/soğuk açılışta yanlış para birimi
     ve kayıp Tahsil Et butonu üretiyordu. */
  cariId: string | null;
  cariName: string | null;
  currency: string;
  type: 'cari_satis' | 'cari_alis' | null;
  toplam: number;
  odenen: number;
  taksitler: TaksitSatirDetay[];
}

/** Plan detayı: taksit satırları + taksit-bazlı tahsis toplamlarından kalanlar. */
export function useTaksitPlanDetay(planId: string | undefined) {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.taksit.detay(planId ?? '', isletme?.id ?? ''),
    enabled: !!planId && !!isletme?.id,
    queryFn: async (): Promise<TaksitPlanDetay | null> => {
      if (!planId || !isletme?.id) return null;

      const { data: taksitler, error } = await supabase
        .from('taksitler')
        .select('id, islem_id, sira, vade_tarihi, tutar')
        .eq('plan_id', planId)
        .eq('isletme_id', isletme.id)
        .order('sira', { ascending: true });
      if (error) throw error;
      if (!taksitler || taksitler.length === 0) return null;

      const islemId = taksitler[0].islem_id as string;
      const [{ data: tahsisler, error: tErr }, { data: islem, error: iErr }] = await Promise.all([
        supabase
          .from('islem_tahsis')
          .select('taksit_id, tutar')
          .eq('isletme_id', isletme.id)
          .eq('borc_islem_id', islemId),
        supabase
          .from('islemler')
          .select('id, cari_id, type, cari:cariler(name, currency)')
          .eq('id', islemId)
          .eq('isletme_id', isletme.id)
          .single(),
      ]);
      if (tErr) throw tErr;
      if (iErr) throw iErr;

      const odenenMap: Record<string, number> = {};
      for (const t of tahsisler ?? []) {
        if (!t.taksit_id) continue;
        odenenMap[t.taksit_id] = roundCurrency((odenenMap[t.taksit_id] ?? 0) + (Number(t.tutar) || 0));
      }

      const satirlar = taksitler.map((tk) => {
        const tutar = Number(tk.tutar) || 0;
        const odenen = odenenMap[tk.id] ?? 0;
        return {
          id: tk.id,
          sira: tk.sira,
          vade_tarihi: String(tk.vade_tarihi),
          tutar,
          odenen,
          kalan: Math.max(0, roundCurrency(tutar - odenen)),
        };
      });

      // Join tek satır obje döner ama tipte dizi görünebilir — her iki şekli de karşıla
      const cariRaw = (islem as { cari?: { name: string; currency: string | null } | { name: string; currency: string | null }[] } | null)?.cari;
      const cari = Array.isArray(cariRaw) ? cariRaw[0] : cariRaw;
      const islemType = (islem?.type === 'cari_satis' || islem?.type === 'cari_alis') ? islem.type : null;

      return {
        planId,
        islemId,
        cariId: (islem?.cari_id as string | null) ?? null,
        cariName: cari?.name ?? null,
        // Liste RPC'siyle aynı kaynak: COALESCE(cari.currency, 'TRY')
        currency: cari?.currency || 'TRY',
        type: islemType,
        toplam: roundCurrency(satirlar.reduce((s, x) => s + x.tutar, 0)),
        odenen: roundCurrency(satirlar.reduce((s, x) => s + x.odenen, 0)),
        taksitler: satirlar,
      };
    },
  });
}
