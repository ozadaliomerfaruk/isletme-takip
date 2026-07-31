/**
 * P-A migration'ının SÖZLEŞME testleri.
 *
 * NE TEST EDİLİYOR: migration dosyasının, bozulması güvenlik açığı yaratacak
 * özelliklerini koruduğu. SQL'in ÇALIŞMA SONUCU burada test EDİLEMEZ (yerelde
 * Postgres yok) — o, test ortamında ayrıca doğrulanacak.
 *
 * NEDEN DOSYA OKUYORUZ: bu migration'ın tek işi ACL daraltmak. Gövdeye dokunan
 * bir satır (CREATE OR REPLACE) veya geri gelen bir GRANT, açığı sessizce
 * yeniden açar. Test bunları kilitliyor.
 */

import fs from 'fs';
import path from 'path';

const KOK = path.resolve(__dirname, '../../..');
const MIGRATION = path.join(KOK, 'supabase/migrations/20260729035553_cleanup_audit_log_acl.sql');
const FALLBACK = path.join(KOK, 'docs/security/taslak/cleanup_audit_log_acl-FALLBACK.sql');
const SNAPSHOT = path.join(
  KOK,
  'docs/security/db-snapshots/2026-07-26/cleanup_old_islem_audit_log.live.sql'
);

const sql = fs.readFileSync(MIGRATION, 'utf8');
/** Yorum satırlarını atarak yalnız çalışacak SQL'i bırakır. */
const kod = sql
  .split('\n')
  .filter((s) => !s.trimStart().startsWith('--'))
  .join('\n');

describe('P-A: cleanup_old_islem_audit_log ACL migration', () => {
  it('GÖVDEYE DOKUNMUYOR — CREATE OR REPLACE yok', () => {
    expect(kod).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i);
  });

  it('hiçbir DROP içermiyor', () => {
    expect(kod).not.toMatch(/\bDROP\b/i);
  });

  it('CASCADE içermiyor', () => {
    expect(kod).not.toMatch(/\bCASCADE\b/i);
  });

  it('REVOKE tam imzayla ve üç rolü birden kapsıyor', () => {
    expect(kod).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.cleanup_old_islem_audit_log\(\)\s*\n?\s*FROM PUBLIC, anon, authenticated;/
    );
  });

  it('çıplak ad KULLANMIYOR — her referans "()" imzasıyla', () => {
    const referanslar = kod.match(/cleanup_old_islem_audit_log(\s*\()?/g) ?? [];
    expect(referanslar.length).toBeGreaterThan(0);
    for (const r of referanslar) {
      expect(r).toMatch(/\($/); // hepsi "(" ile bitmeli
    }
  });

  it('hiçbir GRANT içermiyor — açığı geri açacak satır yok', () => {
    expect(kod).not.toMatch(/\bGRANT\b/i);
  });

  it('anon/PUBLIC yalnız REVOKE tarafında geçiyor', () => {
    // "anon" veya "PUBLIC" geçen her kod satırı REVOKE satırı olmalı
    const satirlar = kod.split('\n').filter((s) => /\b(anon|PUBLIC)\b/.test(s));
    expect(satirlar.length).toBeGreaterThan(0);
    for (const s of satirlar) {
      expect(s).toMatch(/REVOKE|FROM PUBLIC/);
    }
  });
});

describe('P-A: yardımcı dosyalar', () => {
  it('canlı gövde snapshot’ı mevcut ve md5 yazılı', () => {
    expect(fs.existsSync(SNAPSHOT)).toBe(true);
    const s = fs.readFileSync(SNAPSHOT, 'utf8');
    expect(s).toContain('638fc810853a0acbea7b106407ac1a1b');
  });

  it('snapshot çalıştırılmaması gerektiğini açıkça söylüyor', () => {
    const s = fs.readFileSync(SNAPSHOT, 'utf8');
    expect(s).toMatch(/ÇALIŞTIRILMAK İÇİN DEĞİLDİR/);
  });

  it('FALLBACK savunmasız hâle DÖNMÜYOR: anon/PUBLIC GRANT yok', () => {
    expect(fs.existsSync(FALLBACK)).toBe(true);
    const f = fs
      .readFileSync(FALLBACK, 'utf8')
      .split('\n')
      .filter((s) => !s.trimStart().startsWith('--'))
      .join('\n');
    expect(f).toMatch(/GRANT EXECUTE ON FUNCTION public\.cleanup_old_islem_audit_log\(\) TO authenticated;/);
    expect(f).not.toMatch(/TO\s+anon/i);
    expect(f).not.toMatch(/TO\s+PUBLIC/i);
  });
});
