import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION = path.join(
  ROOT,
  'supabase/migrations/20260728232027_owner_only_kategoriler_atomik_archive.sql'
);
const sql = fs.readFileSync(MIGRATION, 'utf8');

describe('S-09 kategori owner-only migration contract', () => {
  it.each(['INSERT', 'UPDATE', 'DELETE'])(
    '%s yazimini RESTRICTIVE owner politikasi ile daraltir',
    (command) => {
      expect(sql).toMatch(
        new RegExp(
          `CREATE POLICY "[^"]+"\\s+ON public\\.kategoriler\\s+AS RESTRICTIVE\\s+FOR ${command}\\s+TO authenticated`,
          'i'
        )
      );
    }
  );

  it('owner kosulunu isletme ve auth uid ile tenant kapsamli kurar', () => {
    expect(sql).toContain('FROM public.isletmeler i');
    expect(sql).toContain('i.id = kategoriler.isletme_id');
    expect(sql).toContain('i.user_id = (SELECT auth.uid())');
  });

  it('UPDATE hem eski hem yeni satirda ayni isletmenin owner kosulunu ister', () => {
    const updatePolicy = sql.match(
      /CREATE POLICY "Category writes require owner - update"([\s\S]*?)CREATE POLICY "Category writes require owner - delete"/
    )?.[1] ?? '';

    expect(updatePolicy).toMatch(/USING\s*\(\s*EXISTS/i);
    expect(updatePolicy).toMatch(/WITH CHECK\s*\(\s*EXISTS/i);
    expect(updatePolicy.match(/i\.id = kategoriler\.isletme_id/g)).toHaveLength(2);
    expect(updatePolicy).not.toMatch(/USING\s*\(\s*true\s*\)/i);
  });

  it('shared SELECT politikasini kaldirmaz veya degistirmez', () => {
    expect(sql).not.toMatch(/DROP POLICY/i);
    expect(sql).not.toMatch(/ALTER POLICY/i);
    expect(sql).not.toMatch(/FOR SELECT/i);
  });

  it('atomik soft-archive RPC owner guard, kilit ve sabit search_path tasir', () => {
    expect(sql).toContain(
      'FUNCTION public.archive_kategori_atomik(\n  p_isletme_id uuid,\n  p_kategori_id uuid'
    );
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain("SET search_path TO ''");
    expect(sql).toContain("RAISE EXCEPTION 'CATEGORY_OWNER_ONLY'");
    expect(sql).toContain('FOR UPDATE');
  });

  it('islem ve pending/notified ileri tarihli baglarini ilk yazmadan once reddeder', () => {
    const guard = sql.indexOf("RAISE EXCEPTION 'CATEGORY_HAS_TRANSACTIONS'");
    const firstWrite = sql.indexOf('UPDATE public.urunler');

    expect(sql).toContain('FROM public.islemler i');
    expect(sql).toContain('FROM public.ileri_tarihli_islemler ii');
    expect(sql).toContain("ii.status IN ('pending', 'notified')");
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(firstWrite);
  });

  it('urun, child ve iki mapping bagini ayni tenantta temizler', () => {
    expect(sql).toMatch(
      /UPDATE public\.urunler u[\s\S]*u\.kategori_id = p_kategori_id[\s\S]*u\.isletme_id = p_isletme_id/
    );
    expect(sql).toMatch(
      /UPDATE public\.kategoriler child[\s\S]*child\.parent_id = p_kategori_id[\s\S]*child\.isletme_id = p_isletme_id/
    );
    expect(sql).toMatch(
      /SET mapped_gelir_kategori_id = NULL[\s\S]*source\.isletme_id = p_isletme_id/
    );
    expect(sql).toMatch(
      /SET mapped_gider_kategori_id = NULL[\s\S]*source\.isletme_id = p_isletme_id/
    );
  });

  it('kategori ve kullanici islemi silmez; yalniz is_active=false yapar', () => {
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
    expect(sql).toMatch(
      /UPDATE public\.kategoriler k[\s\S]*SET is_active = false[\s\S]*k\.id = p_kategori_id/
    );
  });

  it('RPC ACL yalniz authenticated istemciye aciktir', () => {
    expect(sql).toMatch(
      /REVOKE ALL\s+ON FUNCTION public\.archive_kategori_atomik\(uuid, uuid\)\s+FROM PUBLIC, anon;/
    );
    expect(sql).toMatch(
      /GRANT EXECUTE\s+ON FUNCTION public\.archive_kategori_atomik\(uuid, uuid\)\s+TO authenticated;/
    );
  });
});
