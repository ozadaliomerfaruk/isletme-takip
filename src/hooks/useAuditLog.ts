import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/queryKeys';
import type { IslemAuditLog, AuditLogFilters, Profile } from '@/types/multiUser';
import i18n from '@/i18n';

type LoggedAction = 'delete' | 'update';

/** old_data/new_data'dan bir alanı (id) güvenli oku. */
function field(r: IslemAuditLog, key: string): string | undefined {
  const v = (r.old_data?.[key] ?? r.new_data?.[key]) as unknown;
  return typeof v === 'string' && v ? v : undefined;
}

/**
 * Audit log kayıtlarını çek + performer/cari/hesap/kategori/personel isimlerini ekle.
 *
 * NOT: islem_audit_log.performed_by FK'sı auth.users'a baktığından PostgREST
 * `profiles!performed_by` embed'i çözülemiyordu → sayfa hep boş kalıyordu. İlişkili
 * isimleri ayrı sorgularla çekip JS'te eşliyoruz. Ayrıca her olay (eski) iki trigger
 * tarafından loglanmış olabilir → islem_id+action+created_at ile tekilleştiriyoruz.
 *
 * Ürün kalemleri burada yok: silmede işlemin ürün hareketleri de silindiğinden ve audit
 * yalnız islemler satırını sakladığından, silinen işlemin ürünleri geri getirilemez.
 */
async function fetchAuditLog(
  isletmeId: string,
  action: LoggedAction,
  filters?: AuditLogFilters
): Promise<IslemAuditLog[]> {
  let query = supabase
    .from('islem_audit_log')
    .select('*')
    .eq('isletme_id', isletmeId)
    .eq('action', action)
    .order('created_at', { ascending: false })
    .limit(100);

  // Retention: yalnızca son 30 gün gösterilir (eskiler pg_cron ile DB'den silinir).
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  query = query.gte('created_at', cutoff);

  if (filters?.startDate) query = query.gte('created_at', filters.startDate);
  if (filters?.endDate) query = query.lte('created_at', filters.endDate);

  const { data, error } = await query;
  if (error) throw error;

  // Çift-trigger kaynaklı yinelenen kayıtları ele (aynı olayın 2 satırı).
  const seen = new Set<string>();
  const rows = ((data ?? []) as IslemAuditLog[]).filter((r) => {
    const key = `${r.islem_id ?? 'null'}|${r.action}|${r.created_at}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (rows.length === 0) return rows;

  // İlişkili id'leri topla.
  const performerIds = new Set<string>();
  const hesapIds = new Set<string>();
  const cariIds = new Set<string>();
  const kategoriIds = new Set<string>();
  const personelIds = new Set<string>();
  for (const r of rows) {
    if (r.performed_by) performerIds.add(r.performed_by);
    const h = field(r, 'hesap_id'); if (h) hesapIds.add(h);
    const hh = field(r, 'hedef_hesap_id'); if (hh) hesapIds.add(hh);
    const c = field(r, 'cari_id'); if (c) cariIds.add(c);
    const k = field(r, 'kategori_id'); if (k) kategoriIds.add(k);
    const p = field(r, 'personel_id'); if (p) personelIds.add(p);
  }
  const list = (s: Set<string>) => Array.from(s);

  const [profilesRes, hesaplarRes, carilerRes, kategorilerRes, personelRes] = await Promise.all([
    performerIds.size ? supabase.from('profiles').select('*').in('id', list(performerIds)) : Promise.resolve({ data: [] as Profile[] }),
    hesapIds.size ? supabase.from('hesaplar').select('id, name').in('id', list(hesapIds)) : Promise.resolve({ data: [] }),
    cariIds.size ? supabase.from('cariler').select('id, name').in('id', list(cariIds)) : Promise.resolve({ data: [] }),
    kategoriIds.size ? supabase.from('kategoriler').select('id, name').in('id', list(kategoriIds)) : Promise.resolve({ data: [] }),
    personelIds.size ? supabase.from('personel').select('id, first_name, last_name').in('id', list(personelIds)) : Promise.resolve({ data: [] }),
  ]);

  const profileMap = new Map<string, Profile>(((profilesRes.data ?? []) as Profile[]).map((p) => [p.id, p]));
  const nameMap = (rows2: { id: string; name: string }[]) => new Map(rows2.map((x) => [x.id, x.name]));
  const hesapMap = nameMap((hesaplarRes.data ?? []) as { id: string; name: string }[]);
  const cariMap = nameMap((carilerRes.data ?? []) as { id: string; name: string }[]);
  const kategoriMap = nameMap((kategorilerRes.data ?? []) as { id: string; name: string }[]);
  const personelMap = new Map<string, string>(
    ((personelRes.data ?? []) as { id: string; first_name: string | null; last_name: string | null }[]).map((p) => [
      p.id,
      [p.first_name, p.last_name].filter(Boolean).join(' ').trim(),
    ])
  );

  return rows.map((r) => {
    const hesapId = field(r, 'hesap_id');
    const hedefHesapId = field(r, 'hedef_hesap_id');
    const cariId = field(r, 'cari_id');
    const kategoriId = field(r, 'kategori_id');
    const personelId = field(r, 'personel_id');
    return {
      ...r,
      performer: r.performed_by ? profileMap.get(r.performed_by) : undefined,
      hesapName: hesapId ? hesapMap.get(hesapId) ?? null : null,
      hedefHesapName: hedefHesapId ? hesapMap.get(hedefHesapId) ?? null : null,
      cariName: cariId ? cariMap.get(cariId) ?? null : null,
      kategoriName: kategoriId ? kategoriMap.get(kategoriId) ?? null : null,
      personelName: personelId ? personelMap.get(personelId) || null : null,
    };
  });
}

// Silinen işlemler
export function useDeletedIslemler(filters?: AuditLogFilters) {
  const { isletme, isOwner } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.auditLog.deleted(isletme?.id ?? '', filters),
    queryFn: async () => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));
      return fetchAuditLog(isletme.id, 'delete', filters);
    },
    enabled: !!isletme && isOwner,
  });
}

// Düzenlenen işlemler
export function useEditedIslemler(filters?: AuditLogFilters) {
  const { isletme, isOwner } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.auditLog.edited(isletme?.id ?? '', filters),
    queryFn: async () => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));
      return fetchAuditLog(isletme.id, 'update', filters);
    },
    enabled: !!isletme && isOwner,
  });
}
