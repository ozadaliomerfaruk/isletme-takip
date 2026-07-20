import { useMutation } from '@tanstack/react-query';
import { supabase, SUPABASE_PROJECT_URL } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';

/**
 * Web-ekstre linki (Faz 4): opak token'lı public HTML ekstre.
 * Cari başına TEK aktif link — yeni üretim eskisini sunucuda otomatik iptal eder;
 * ekstre_link_iptal ile elle de kapatılabilir. Token dışında hiçbir yetki yok.
 */

export function ekstreLinkUrl(token: string): string {
  return `${SUPABASE_PROJECT_URL}/functions/v1/cari-ekstre?token=${token}`;
}

export function useEkstreLinkOlustur() {
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (cariId: string): Promise<{ url: string; expiresAt: string }> => {
      if (!isletme?.id) throw new Error('isletme yok');
      const { data, error } = await supabase.rpc('ekstre_link_olustur', {
        p_isletme_id: isletme.id,
        p_cari_id: cariId,
      });
      if (error) throw error;
      const result = data as { token: string; expires_at: string };
      return { url: ekstreLinkUrl(result.token), expiresAt: result.expires_at };
    },
  });
}

export function useEkstreLinkIptal() {
  const { isletme } = useAuthContext();

  return useMutation({
    mutationFn: async (cariId: string): Promise<number> => {
      if (!isletme?.id) throw new Error('isletme yok');
      const { data, error } = await supabase.rpc('ekstre_link_iptal', {
        p_isletme_id: isletme.id,
        p_cari_id: cariId,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
  });
}
