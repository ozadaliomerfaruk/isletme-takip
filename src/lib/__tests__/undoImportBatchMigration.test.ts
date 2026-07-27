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
  'supabase/migrations/20260726120000_undo_import_batch_owner_guard.sql'
);
const FALLBACK = path.join(KOK, 'docs/security/taslak/undo_import_batch-FALLBACK.sql');
const SNAPSHOT = path.join(
  KOK,
  'docs/security/db-snapshots/2026-07-26/undo_import_batch.live.sql'
);

const sql = fs.readFileSync(MIGRATION, 'utf8');

describe('undo_import_batch migration — sözleşme', () => {
  it('imza DEĞİŞMEMİŞ: undo_import_batch(p_transaction_ids uuid[])', () => {
    expect(sql).toContain('FUNCTION public.undo_import_batch(p_transaction_ids uuid[])');
  });

  it('dönüş tipi json ve istemcinin okuduğu anahtar korunmuş', () => {
    expect(sql).toMatch(/RETURNS json/);
    expect(sql).toContain("json_build_object('deleted_transactions', deleted_count)");
  });

  it('SECURITY DEFINER ve search_path korunmuş (SecDef fonksiyonda ayak kurşunu)', () => {
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain("SET search_path TO 'public'");
  });

  it('owner kontrolü var ve YALNIZ owner (üyelik guard’ı tek başına yeterli sayılmamış)', () => {
    expect(sql).toContain('FROM isletmeler');
    expect(sql).toContain('user_id = auth.uid()');
    // Aktif üyelik yardımcısına DÜŞÜLMEMELİ — owner-only bilinçli karar.
    expect(sql).not.toContain('user_has_isletme_access');
  });

  it('anon ve PUBLIC EXECUTE kaldırılmış, authenticated verilmiş', () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.undo_import_batch\(uuid\[\]\) FROM PUBLIC, anon;/);
    expect(sql).toMatch(/GRANT\s+EXECUTE ON FUNCTION public\.undo_import_batch\(uuid\[\]\) TO authenticated;/);
  });

  it('min(uuid) KULLANILMIYOR — Postgres’te böyle bir aggregate yok', () => {
    expect(sql).not.toMatch(/min\s*\(\s*[a-z_.]*isletme_id/i);
  });

  it('bütün guard’lar İLK YAZMA işleminden önce geliyor', () => {
    const ilkYazma = Math.min(
      ...['UPDATE hesaplar', 'UPDATE cariler', 'UPDATE personel', 'DELETE FROM islemler']
        .map((k) => sql.indexOf(k))
        .filter((i) => i >= 0)
    );
    const sonGuard = Math.max(
      ...['islem listesi bos', 'cok fazla islem', 'NULL kimlik', 'yinelenen kimlik',
        'bazi islemler bulunamadi', 'tek isletmeye ait olmali', 'yalnizca isletme sahibi']
        .map((k) => sql.indexOf(k))
        .filter((i) => i >= 0)
    );
    expect(sonGuard).toBeGreaterThan(0);
    expect(sonGuard).toBeLessThan(ilkYazma);
  });

  it('yarış penceresi kapalı: FOR UPDATE kilidi yazmalardan önce', () => {
    const kilit = sql.indexOf('FOR UPDATE');
    const ilkYazma = sql.indexOf('UPDATE hesaplar');
    expect(kilit).toBeGreaterThan(0);
    expect(kilit).toBeLessThan(ilkYazma);
  });

  it('bütün yazma sorguları tenant kapsamlı (isletme_id = v_isletme_id)', () => {
    // DELETE mutlaka kapsamlı olmalı
    expect(sql).toMatch(/DELETE FROM islemler\s+WHERE id = ANY\(p_transaction_ids\)\s+AND isletme_id = v_isletme_id/);
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
    expect(f).toContain('yalnizca isletme sahibi');
    expect(f).toContain('user_id = auth.uid()');
    expect(f).toMatch(/REVOKE EXECUTE ON FUNCTION public\.undo_import_batch\(uuid\[\]\) FROM PUBLIC, anon;/);
    // Fallback de tenant kapsamını korumalı
    expect(f).toContain('AND isletme_id = v_isletme_id');
  });
});
