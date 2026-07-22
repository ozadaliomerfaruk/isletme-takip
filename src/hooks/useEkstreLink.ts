import { useMutation } from '@tanstack/react-query';
import i18n from '@/i18n';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { logEvent } from '@/lib/appEvents';

/**
 * Web-ekstre linki (Faz 4): opak token'lı public web ekstresi.
 * Cari başına TEK aktif link — yeni üretim eskisini sunucuda otomatik iptal eder;
 * ekstre_link_iptal ile elle de kapatılabilir. Token dışında hiçbir yetki yok.
 *
 * Link SİTEYİ gösterir (docs/ekstre — Vercel): Supabase, *.supabase.co'dan HTML
 * servisini engelliyor (zorla text/plain+sandbox). Sayfa, edge function'ın
 * ?format=json ucundan veriyi çekip arayüzü kendisi çizer.
 */

export function ekstreLinkUrl(token: string): string {
  return `https://isletmetakip.vercel.app/ekstre/?token=${token}`;
}

export function useEkstreLinkOlustur() {
  const { isletme } = useAuthContext();

  return useMutation({
    /** gecerlilikGun: gün sayısı; null = SÜRESİZ (sunucu 100 yıl damgalar). */
    mutationFn: async (
      { cariId, gecerlilikGun }: { cariId: string; gecerlilikGun: number | null },
    ): Promise<{ url: string; expiresAt: string }> => {
      if (!isletme?.id) throw new Error(i18n.t('common:errors.businessNotFound'));
      const { data, error } = await supabase.rpc('ekstre_link_olustur', {
        p_isletme_id: isletme.id,
        p_cari_id: cariId,
        p_gecerlilik_gun: gecerlilikGun,
      });
      if (error) throw error;
      const result = data as { token: string; expires_at: string };
      return { url: ekstreLinkUrl(result.token), expiresAt: result.expires_at };
    },
    onSuccess: (_data, variables) => {
      logEvent('web_ekstre_generated', { suresiz: variables.gecerlilikGun === null, sure_gun: variables.gecerlilikGun });
    },
  });
}

export function useEkstreLinkIptal() {
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (cariId: string): Promise<number> => {
      if (!isletme?.id) throw new Error(i18n.t('common:errors.businessNotFound'));
      const { data, error } = await supabase.rpc('ekstre_link_iptal', {
        p_isletme_id: isletme.id,
        p_cari_id: cariId,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
  });
}
