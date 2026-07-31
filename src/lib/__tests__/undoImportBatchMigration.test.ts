/**
 * undo_import_batch güvenlik migration'ının SÖZLEŞME testleri.
 *
 * NE TEST EDİLİYOR: migration dosyasının, bozulması geriye-uyumluluğu kıracak
 * özelliklerini koruduğu. SQL'in ÇALIŞMA MANTIĞI burada test EDİLEMEZ (yerelde
 * Postgres yok) — o, test ortamında ayrıca doğrulanacak.
 *
 * NEDEN DOSYA OKUYORUZ: AGENTS.md kuralı "RPC değişikliğinde imza korunur" ve
 * istemci dönüşteki `deleted_transactions` anahtarını okuyor. Bu iki sözleşme
 * sessizce bozulursa üretimde eski client kırılır; test onları kilitliyor.
 */

import fs from 'fs';
import path from 'path';

const KOK = path.resolve(__dirname, '../../..');
const MIGRATION = path.join(
  KOK,
  'supabase/migrations/20260729084545_harden_undo_import_batch_owner_guard.sql'
);
const FALLBACK = path.join(KOK, 'docs/security/taslak/undo_import_batch-FALLBACK.sql');
const SNAPSHOT = path.join(
  KOK,
  'docs/security/db-snapshots/2026-07-26/undo_import_batch.live.sql'
);

const sql = fs.readFileSync(MIGRATION, 'utf8');
const clientHook = fs.readFileSync(
  path.join(KOK, 'src/hooks/useImportHistory.ts'),
  'utf8',
);

describe('undo_import_batch migration — sözleşme', () => {
  it('imza DEĞİŞMEMİŞ: undo_import_batch(p_transaction_ids uuid[])', () => {
    expect(sql).toContain('FUNCTION public.undo_import_batch(p_transaction_ids uuid[])');
  });

  it('dönüş tipi json ve istemcinin okuduğu anahtar korunmuş', () => {
    expect(sql).toMatch(/RETURNS json/);
    expect(sql).toContain("json_build_object('deleted_transactions', deleted_count)");
  });

  it('SECURITY DEFINER boş search_path ve şema-nitelikli domain tabloları kullanır', () => {
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain("SET search_path TO ''");
    for (const table of ['islemler', 'isletmeler', 'hesaplar', 'cariler', 'personel']) {
      expect(sql).toContain(`public.${table}`);
      expect(sql).not.toMatch(
        new RegExp(`\\b(?:FROM|UPDATE|DELETE FROM)\\s+${table}\\b`)
      );
    }
  });

  it('canlı gövde beklenen hash’ten farklıysa üzerine yazmadan durur', () => {
    expect(sql).toContain(
      "pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))"
    );
    expect(sql).toContain(
      "pg_catalog.to_regprocedure('public.undo_import_batch(uuid[])')"
    );
    expect(sql).toContain('d276147891f458fd7cc74cc632e1b43c');
    expect(sql).toContain('pg_catalog.pg_get_userbyid(p.proowner)');
    expect(sql).toContain('pg_catalog.pg_get_function_result(p.oid)');
    expect(sql).toContain(
      "'{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'",
    );
    expect(sql).toContain("ARRAY['search_path=public']::text[]");
    expect(sql).toContain("USING ERRCODE = '55000'");
    expect(sql.indexOf('DO $guard$')).toBeLessThan(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.undo_import_batch')
    );
  });

  it('owner kontrolü generic 42501 verir ve owner satırını işlem satırlarından önce kilitler', () => {
    expect(sql).toContain('FROM public.isletmeler');
    expect(sql).toContain('user_id = auth.uid()');
    // Aktif üyelik yardımcısına DÜŞÜLMEMELİ — owner-only bilinçli karar.
    expect(sql).not.toContain('user_has_isletme_access');
    expect(sql).toContain('WHERE i.id = p_transaction_ids[1]');
    expect(
      sql.match(
        /RAISE EXCEPTION 'undo_import_batch: bu islem icin yetkiniz yok'/g,
      ),
    ).toHaveLength(2);
    expect(sql).not.toContain('bazi islemler bulunamadi');

    const ownerLock = sql.indexOf(
      'FROM public.isletmeler AS isletme',
    );
    const transactionLock = sql.indexOf(
      'PERFORM i.id FROM public.islemler i',
    );
    expect(ownerLock).toBeGreaterThan(0);
    expect(ownerLock).toBeLessThan(transactionLock);
    expect(sql.slice(ownerLock, transactionLock)).toContain('FOR UPDATE');
  });

  it('PUBLIC/anon/service_role kapalı; owner ve yalnız authenticated explicit', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.undo_import_batch\(uuid\[\]\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(sql).toMatch(/GRANT\s+EXECUTE ON FUNCTION public\.undo_import_batch\(uuid\[\]\) TO authenticated;/);
    expect(sql).toContain(
      'ALTER FUNCTION public.undo_import_batch(uuid[]) OWNER TO postgres;',
    );
  });

  it('min(uuid) KULLANILMIYOR — Postgres’te böyle bir aggregate yok', () => {
    expect(sql).not.toMatch(/min\s*\(\s*[a-z_.]*isletme_id/i);
  });

  it('bütün guard’lar İLK YAZMA işleminden önce geliyor', () => {
    const ilkYazma = Math.min(
      ...[
        'UPDATE public.hesaplar',
        'UPDATE public.cariler',
        'UPDATE public.personel',
        'DELETE FROM public.islemler',
      ]
        .map((k) => sql.indexOf(k))
        .filter((i) => i >= 0)
    );
    const sonGuard = Math.max(
      ...['islem listesi bos', 'cok fazla islem', 'NULL kimlik', 'yinelenen kimlik',
        'bu islem icin yetkiniz yok', 'islem listesi gecersiz veya farkli isletmeye ait']
        .map((k) => sql.indexOf(k))
        .filter((i) => i >= 0)
    );
    expect(sonGuard).toBeGreaterThan(0);
    expect(sonGuard).toBeLessThan(ilkYazma);
  });

  it('yarış penceresi kapalı: deterministik kilit ve kilit-sonrası adet kontrolü var', () => {
    const kilit = sql.indexOf(
      'PERFORM i.id FROM public.islemler i',
    );
    const ilkYazma = sql.indexOf('UPDATE public.hesaplar');
    expect(kilit).toBeGreaterThan(0);
    expect(kilit).toBeLessThan(ilkYazma);
    expect(sql).toMatch(
      /PERFORM i\.id FROM public\.islemler i[\s\S]*ORDER BY i\.id[\s\S]*FOR UPDATE;/
    );
    expect(sql).toContain(
      'GET DIAGNOSTICS v_locked_count = ROW_COUNT;'
    );
    expect(sql).toContain('IF v_locked_count <> v_input_count THEN');
  });

  it('eski geçmiş timestamp migration yolu kaldırılmıştır', () => {
    expect(
      fs.existsSync(
        path.join(
          KOK,
          'supabase/migrations/20260726120000_undo_import_batch_owner_guard.sql',
        ),
      ),
    ).toBe(false);
  });

  it('bütün yazma sorguları tenant kapsamlı (isletme_id = v_isletme_id)', () => {
    // DELETE mutlaka kapsamlı olmalı
    expect(sql).toMatch(/DELETE FROM public\.islemler\s+WHERE id = ANY\(p_transaction_ids\)\s+AND isletme_id = v_isletme_id/);
    // Üç bakiye UPDATE'inin hedef tablosu da kapsamlı olmalı
    expect(sql).toMatch(/WHERE h\.id = agg\.entity_id AND h\.isletme_id = v_isletme_id/);
    expect(sql).toMatch(/WHERE c\.id = agg\.entity_id AND c\.isletme_id = v_isletme_id/);
    expect(sql).toMatch(/WHERE p\.id = agg\.entity_id AND p\.isletme_id = v_isletme_id/);
  });

  it('maksimum batch sınırı gerçek üretim tavanının (35.606) ÜSTÜNDE', () => {
    const m = sql.match(/c_max_batch CONSTANT INT := (\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(35606);
  });

  it('istemci yalnız atomik deadlock kodunda bir kez bounded retry yapar', () => {
    expect(clientHook).toContain(
      "if ((rpcError as { code?: string } | null)?.code === '40P01')",
    );
    expect(clientHook).toContain('UNDO_DEADLOCK_RETRY_DELAY_MS = 150');
    expect(clientHook).toContain(
      '({ data, error: rpcError } = await callUndoImportBatch());',
    );
    expect(clientHook).toContain("if (kod === '40P01')");
    expect(clientHook).toContain(
      'Hiçbir değişiklik yapılmadı; lütfen tekrar deneyin.',
    );
    expect(clientHook.match(/await callUndoImportBatch\(\)/g)).toHaveLength(2);
  });

  it('bakiye matematiği canlı gövdeyle aynı: çapraz-kur dalları korunmuş', () => {
    // Bu üç tip çapraz-kur hesabı yapıyor; kaybolurlarsa bakiyeler yanlış geri alınır.
    for (const tip of ['cari_odeme', 'cari_tahsilat', 'personel_odeme', 'personel_tahsilat']) {
      expect(sql).toContain(`WHEN type = '${tip}' THEN`);
    }
    expect(sql).toContain("WHEN source_currency = 'TRY' THEN amount / exchange_rate");
  });
});

describe('yardımcı dosyalar', () => {
  it('canlı gövde snapshot’ı mevcut ve hash’i yazılı', () => {
    expect(fs.existsSync(SNAPSHOT)).toBe(true);
    const s = fs.readFileSync(SNAPSHOT, 'utf8');
    expect(s).toContain('d276147891f458fd7cc74cc632e1b43c');
  });

  it('fallback SAVUNMASIZ hâle dönmüyor: owner guard ve REVOKE korunuyor', () => {
    expect(fs.existsSync(FALLBACK)).toBe(true);
    const f = fs.readFileSync(FALLBACK, 'utf8');

    // Canlı kanonik hash sabittir; format/katalog sapmasında fail-closed kalır.
    expect(f).toContain(
      "v_expected_hash CONSTANT text := '09d0aa42428d8fef0c9966dfb1f8a217'",
    );
    expect(f).toContain("v_expected_hash !~ '^[0-9a-f]{32}$'");
    expect(f).toContain('v_live_hash IS DISTINCT FROM v_expected_hash');
    expect(f).toContain(
      "'{postgres=X/postgres,authenticated=X/postgres}'",
    );
    expect(f).toContain("ARRAY['search_path=\"\"']::text[]");
    expect(f).toContain("USING ERRCODE = '55000'");
    expect(f.indexOf('DO $fallback_guard$')).toBeLessThan(
      f.indexOf('CREATE OR REPLACE FUNCTION public.undo_import_batch'),
    );

    // Owner-only + oracle kapalı generic hata + tam UUID seti.
    expect(f).toContain('user_id = auth.uid()');
    expect(
      f.match(
        /RAISE EXCEPTION 'undo_import_batch: bu islem icin yetkiniz yok'/g,
      ),
    ).toHaveLength(2);
    expect(f).toContain('listede NULL kimlik var');
    expect(f).toContain('listede yinelenen kimlik var');
    expect(f).toContain('IF v_locked_count <> v_input_count THEN');
    expect(f).not.toContain('v_found_count');
    expect(f).not.toContain('v_tenant_cnt');

    const ownerLock = f.indexOf('FROM public.isletmeler AS isletme');
    const transactionLock = f.indexOf(
      'PERFORM i.id\n    FROM public.islemler AS i',
    );
    expect(ownerLock).toBeGreaterThan(0);
    expect(ownerLock).toBeLessThan(transactionLock);
    expect(f.slice(ownerLock, transactionLock)).toContain('FOR UPDATE');
    expect(f.slice(transactionLock)).toMatch(
      /ORDER BY i\.id[\s\S]*FOR UPDATE;/,
    );

    // Boş search_path + tenant scope + yalnız authenticated execute.
    expect(f).toContain("SET search_path TO ''");
    expect(f).toContain(
      'ALTER FUNCTION public.undo_import_batch(uuid[]) OWNER TO postgres;',
    );
    expect(f).toMatch(
      /REVOKE ALL ON FUNCTION public\.undo_import_batch\(uuid\[\]\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(f).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.undo_import_batch\(uuid\[\]\) TO authenticated;/,
    );
    for (const table of ['islemler', 'isletmeler', 'hesaplar', 'cariler', 'personel']) {
      expect(f).toContain(`public.${table}`);
      expect(f).not.toMatch(
        new RegExp(`\\b(?:FROM|UPDATE|DELETE FROM)\\s+${table}\\b`),
      );
    }
    expect(f).toContain('AND isletme_id = v_isletme_id');
    expect(f).toContain('BEGIN;');
    expect(f).toContain('DO $post_guard$');
    expect(f).toContain('COMMIT;');

    // Kanonikten tek işlevsel gevşeme: 50.000 -> 100.000 batch tavanı.
    const canonicalLimit = sql.match(/c_max_batch CONSTANT INT := (\d+)/);
    const fallbackLimit = f.match(/c_max_batch CONSTANT INT := (\d+)/);
    expect(canonicalLimit).not.toBeNull();
    expect(fallbackLimit).not.toBeNull();
    expect(Number(canonicalLimit![1])).toBe(50000);
    expect(Number(fallbackLimit![1])).toBe(100000);
    for (const tip of [
      'cari_odeme',
      'cari_tahsilat',
      'personel_odeme',
      'personel_tahsilat',
    ]) {
      expect(f).toContain(`WHEN type = '${tip}' THEN`);
    }
    expect(f).toContain(
      "WHEN source_currency = 'TRY' THEN amount / exchange_rate",
    );
  });
});
