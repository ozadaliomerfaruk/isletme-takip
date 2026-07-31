import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const read = (relativePath: string) =>
  fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const migration = read(
  'supabase/migrations/20260729052402_add_urun_minimal_cari_labels_rpc.sql'
);
const hook = read('src/hooks/useUrunHareketler.ts');
const detail = read('src/app/urunler/[id].tsx');

describe('C9 minimal urun-cari etiketi sunucu sozlesmesi', () => {
  it('yalniz hareket kimligi ve cari adini dondurur', () => {
    expect(migration).toMatch(
      /RETURNS TABLE\s*\(\s*urun_hareket_id uuid,\s*cari_name text\s*\)/s
    );
    expect(migration).toContain('uh.id AS urun_hareket_id');
    expect(migration).toContain('c.name::text AS cari_name');
    const returnColumns =
      migration.match(/RETURNS TABLE\s*\(([^)]*)\)/s)?.[1] ?? '';
    expect(returnColumns).not.toMatch(
      /\b(?:cari_id|cari_type|islem_id|amount|balance)\b/
    );
  });

  it('tenant ve Urunler modulu disinda fail-closed kalir', () => {
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain("SET search_path TO ''");
    expect(migration).toContain('auth.uid() IS NULL');
    expect(migration).toContain('FROM public.isletmeler AS b');
    expect(migration).toContain('FROM public.isletme_users AS iu');
    expect(migration).toContain("iu.status = 'active'");
    expect(migration).toContain(
      "v_member_permissions->'modules'->'urunler'"
    );
    expect(migration).toContain("= 'true'::pg_catalog.jsonb");
    expect(migration).toMatch(
      /v_member_permissions->>'level' IS NULL[\s\S]*?'view'[\s\S]*?'add'[\s\S]*?'edit_own'[\s\S]*?'edit_all'/
    );
    expect(migration).not.toContain('public.user_has_module_access');
    expect(migration).toContain('u.isletme_id = p_isletme_id');
    expect(migration).toContain('i.isletme_id = p_isletme_id');
    expect(migration).toContain('c.isletme_id = p_isletme_id');
    expect(migration).toContain('uh.isletme_id = p_isletme_id');
    expect(migration).toContain('FROM PUBLIC, anon');
    expect(migration).toContain('TO authenticated');
  });

  it('urun RLS ile ayni arsiv gorunurlugunu uygular', () => {
    expect(migration).toContain(
      "v_member_permissions->'visibility'->'can_see_archived'"
    );
    expect(migration).toMatch(
      /v_is_owner\s+OR v_can_see_archived\s+OR u\.is_archived IS FALSE/s
    );
  });

  it('additive ve veri silmeyen migrationdir', () => {
    expect(migration).not.toMatch(
      /\b(?:DROP|TRUNCATE|DELETE|UPDATE|ALTER TABLE|INSERT INTO)\b/i
    );
  });
});

describe('C9 istemci projeksiyon sozlesmesi', () => {
  it('Cariler kapaliyken ayri ve diske yazilmayan RPC sorgusu kullanir', () => {
    expect(hook).toContain('useUrunHareketMinimalCariLabels');
    expect(hook).toContain("'get_urun_hareket_minimal_cari_labels'");
    expect(hook).toContain('!canSeeCariler');
    expect(hook).toContain("persist: false");
    expect(hook).toContain(
      "query_purpose: 'urunler:minimal-cari-labels'"
    );
    expect(hook).toContain("'minimal-cari-labels'");
  });

  it('genis cari relationini yalniz Cariler modulu acikken secer', () => {
    expect(hook).toContain(
      "canSeeCariler ? 'cariler(id, name, type)' : null"
    );
    expect(hook).toMatch(
      /'source-visibility',\s*canSeeCariler,\s*canSeeHesaplar,\s*canSeePersonel/s
    );
    expect(hook).toContain('cari: canSeeCariler && cariData');
  });

  it('minimal etiketi linksiz gosterir; tam cari yetkisinde eski link korunur', () => {
    expect(detail).not.toContain('useUrunHareketMinimalCariLabels');
    expect(detail).toContain(
      'minimalSourceLabel?.cari_name'
    );
    expect(detail).toContain(') : minimalCariName ? (');
    expect(detail).toContain('{minimalCariName}');
    expect(detail).toContain(
      "router.push(`/cariler/${hareket.cari!.id}`)"
    );
  });
});
