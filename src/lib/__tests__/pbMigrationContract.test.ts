/**
 * P-B migration'ının SÖZLEŞME testleri.
 *
 * NE TEST EDİLİYOR: migration ve fallback dosyalarının, bozulması güvenlik
 * açığı yaratacak özelliklerini koruduğu. SQL'in ÇALIŞMA SONUCU burada test
 * EDİLEMEZ (yerelde Postgres yok) — o, test ortamında doğrulanacak.
 */

import fs from 'fs';
import path from 'path';

const KOK = path.resolve(__dirname, '../../..');
const MIGRATION = path.join(KOK, 'supabase/migrations/20260726140000_pb_internal_yetki_altyapisi.sql');
const FALLBACK = path.join(KOK, 'docs/security/taslak/PB-FALLBACK.sql');

const ham = fs.readFileSync(MIGRATION, 'utf8');
/** Yorum satırlarını atarak yalnız çalışacak SQL'i bırakır. */
const kod = ham
  .split('\n')
  .filter((s) => !s.trimStart().startsWith('--'))
  .join('\n');

describe('P-B migration: şema ve grant hijyeni', () => {
  it('ön koşul kapısı var: internal şeması varsa DURUR', () => {
    expect(kod).toMatch(/IF EXISTS \(SELECT 1 FROM pg_namespace WHERE nspname = 'internal'\) THEN/);
    expect(kod).toMatch(/RAISE EXCEPTION[\s\S]*?zaten mevcut/);
  });

  it('CREATE SCHEMA IF NOT EXISTS KULLANMIYOR — sessiz yeniden kullanım yok', () => {
    expect(kod).not.toMatch(/CREATE SCHEMA IF NOT EXISTS/i);
    expect(kod).toMatch(/CREATE SCHEMA internal;/);
  });

  it('şema seviyesinde PUBLIC ve anon REVOKE edilmiş', () => {
    expect(kod).toMatch(/REVOKE ALL ON SCHEMA internal FROM PUBLIC;/);
    expect(kod).toMatch(/REVOKE ALL ON SCHEMA internal FROM anon;/);
  });

  it('authenticated’a yalnız USAGE verilmiş (şema seviyesinde ALL yok)', () => {
    expect(kod).toMatch(/GRANT USAGE ON SCHEMA internal TO authenticated;/);
    expect(kod).not.toMatch(/GRANT ALL ON SCHEMA internal/i);
  });

  it('her fonksiyon için PUBLIC/anon EXECUTE açıkça kaldırılmış', () => {
    for (const fn of [
      'internal\\.islem_tipi_modulu\\(text\\)',
      'internal\\.etkin_yetki\\(uuid, text\\)',
      'internal\\.cevrilen_tutar\\(numeric, numeric, text, text\\)',
      'internal\\.bakiye_ops\\(jsonb\\)',
    ]) {
      expect(kod).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION ${fn} FROM PUBLIC, anon;`));
    }
  });

  it('authenticated EXECUTE YALNIZ resolver’a, tam imzayla verilmiş', () => {
    const grantlar = kod.match(/GRANT\s+EXECUTE ON FUNCTION [^;]+;/g) ?? [];
    expect(grantlar).toHaveLength(1);
    expect(grantlar[0]).toMatch(/internal\.etkin_yetki\(uuid, text\) TO authenticated;/);
  });

  it('bakiye türetme fonksiyonlarına authenticated GRANT YOK', () => {
    expect(kod).not.toMatch(/bakiye_ops\(jsonb\) TO authenticated/);
    expect(kod).not.toMatch(/cevrilen_tutar\([^)]*\) TO authenticated/);
    expect(kod).not.toMatch(/islem_tipi_modulu\(text\) TO authenticated/);
  });

  it('DEFAULT PRIVILEGES ile yeni fonksiyonlar PUBLIC’e açık doğmuyor', () => {
    expect(kod).toMatch(/ALTER DEFAULT PRIVILEGES IN SCHEMA internal REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;/);
  });

  it('her SECURITY DEFINER / fonksiyonda SET search_path var', () => {
    const fnSayisi = (kod.match(/^CREATE FUNCTION /gm) ?? []).length;
    const searchPathSayisi = (kod.match(/SET search_path TO /g) ?? []).length;
    expect(fnSayisi).toBe(4);
    expect(searchPathSayisi).toBe(fnSayisi);
  });

  it('DROP ve CASCADE içermiyor', () => {
    expect(kod).not.toMatch(/\bDROP\b/i);
    expect(kod).not.toMatch(/\bCASCADE\b/i);
  });
});

describe('P-B migration: resolver semantiği', () => {
  it('caller tarafından seçilebilen user_id parametresi YOK', () => {
    expect(kod).toMatch(/CREATE FUNCTION internal\.etkin_yetki\(p_isletme_id uuid, p_modul text\)/);
    expect(kod).not.toMatch(/etkin_yetki\([^)]*user_id[^)]*\)/i);
    expect(kod).not.toMatch(/etkin_yetki\([^)]*p_user[^)]*\)/i);
  });

  it('kimlik daima auth.uid()’den geliyor', () => {
    expect(kod).toMatch(/v_uid\s+uuid\s*:=\s*auth\.uid\(\)/);
  });

  it('bağlam parametresi tenant kapsamında doğrulanıyor', () => {
    // owner kontrolü ve aktif üyelik kontrolü ikisi de p_isletme_id ile bağlı
    expect(kod).toMatch(/FROM public\.isletmeler\s*\n?\s*WHERE id = p_isletme_id AND user_id = v_uid/);
    expect(kod).toMatch(/iu\.isletme_id = p_isletme_id[\s\S]*?iu\.user_id = v_uid[\s\S]*?iu\.status = 'active'/);
  });

  it('ham permissions JSON’u döndürmüyor — dönüş tipi yalnız boolean’lar', () => {
    const donus = kod.match(/RETURNS TABLE \(([\s\S]*?)\)\s*\nLANGUAGE plpgsql\s*\nSTABLE/);
    expect(donus).not.toBeNull();
    expect(donus![1]).not.toMatch(/jsonb|json|permissions/i);
    expect((donus![1].match(/boolean/g) ?? []).length).toBe(7);
  });

  it('legacy COLLAPSE YOK: can_create yalnız can_create’ten türüyor', () => {
    // can_create satırı yalnız can_create okumalı; delete/update bayrağı KARIŞMAMALI
    expect(kod).toMatch(/COALESCE\(\(v_act->p_modul->>'can_create'\)::boolean, false\),/);
    // can_create'in bulunduğu satırda başka bir aksiyon bayrağı geçmemeli
    const satir = kod.split('\n').find((s) => s.includes("'can_create'"));
    expect(satir).toBeDefined();
    expect(satir).not.toMatch(/can_delete|can_update/);
  });

  it('notlar/birikim fallback’i YALNIZ görünürlüğe uygulanıyor', () => {
    expect(kod).toMatch(/v_gorunur := \(p_modul IN \('notlar', 'birikim'\)\);/);
    // aynı dalda aksiyon kapısı kapatılıyor
    expect(kod).toMatch(/v_modul_acik := false;\s*--\s*fallback AKSİYONA uygulanmaz/);
  });

  it('level AÇIK ALLOWLIST ile sınırlı — fail-closed', () => {
    expect(kod).toMatch(/IF v_level NOT IN \('view', 'add', 'edit_own', 'edit_all'\) THEN\s*\n\s*RETURN QUERY SELECT false, false, false, false, false, false, false;/);
  });

  it('can_create fail-OPEN `<> view` DEĞİL, pozitif allowlist', () => {
    expect(kod).not.toMatch(/v_level\s*<>\s*'view'/);
    expect(kod).toMatch(/\(v_level IN \('add', 'edit_own', 'edit_all'\)\),\s*--\s*can_create/);
  });

  it('search_path YALNIZ pg_catalog — public gölgeleme yüzeyi yok', () => {
    expect(kod).not.toMatch(/SET search_path TO 'pg_catalog', 'public'/);
    expect(kod).not.toMatch(/SET search_path TO 'public'/);
    const spSatirlari = kod.match(/SET search_path TO [^\n]+/g) ?? [];
    expect(spSatirlari).toHaveLength(4);
    for (const s of spSatirlari) expect(s).toMatch(/SET search_path TO 'pg_catalog'$/);
  });

  it('public/auth nesneleri TAM ŞEMALI çağrılıyor', () => {
    expect(kod).toMatch(/FROM public\.isletmeler/);
    expect(kod).toMatch(/FROM public\.isletme_users/);
    expect(kod).toMatch(/auth\.uid\(\)/);
    expect(kod).toMatch(/internal\.cevrilen_tutar\(/);
    // Şemasız tablo referansı olmamalı
    expect(kod).not.toMatch(/FROM\s+isletme_users/);
    expect(kod).not.toMatch(/FROM\s+isletmeler/);
  });

  it('anon / kimliksiz çağrıda her şey false', () => {
    expect(kod).toMatch(/IF v_uid IS NULL OR p_isletme_id IS NULL OR p_modul IS NULL THEN\s*\n\s*RETURN QUERY SELECT false, false, false, false, false, false, false;/);
  });
});

describe('P-B migration: tip allowlist’i', () => {
  it('ELSE NULL ile bitiyor — "default -> no-op" yetkilendirmede yok', () => {
    expect(kod).toMatch(/ELSE NULL\s+--/);
  });

  it('nakit_avans_taksit allowlist’te YOK (emekli özellik → deny)', () => {
    const fn = kod.slice(kod.indexOf('islem_tipi_modulu'), kod.indexOf('etkin_yetki'));
    expect(fn).not.toMatch(/WHEN 'nakit_avans_taksit'/);
  });

  it('personel ödeme/tahsilat birleşik kural: iki modül birden', () => {
    expect(kod).toMatch(/WHEN 'personel_odeme'\s+THEN ARRAY\['personel','hesaplar'\]/);
    expect(kod).toMatch(/WHEN 'personel_tahsilat'\s+THEN ARRAY\['personel','hesaplar'\]/);
  });

  it('hesaba dokunmayan cari tipleri yalnız cariler modülü ister', () => {
    for (const t of ['cari_alis', 'cari_satis', 'cari_alis_iade', 'cari_satis_iade']) {
      expect(kod).toMatch(new RegExp(`WHEN '${t}'\\s+THEN ARRAY\\['cariler'\\]`));
    }
  });
});

describe('P-B migration: bakiye türetme (computeBalanceOps paritesi)', () => {
  it('çapraz kur yönü istemciyle aynı VE round(...,2) uygulanıyor', () => {
    expect(kod).toMatch(/IF COALESCE\(p_source, 'TRY'\) = 'TRY' THEN\s*\n\s*RETURN round\(p_amount \/ p_rate, 2\);/);
    expect(kod).toMatch(/RETURN round\(p_amount \* p_rate, 2\);/);
    // Yuvarlamasız ham dönüş KALMAMALI
    expect(kod).not.toMatch(/RETURN p_amount \/ p_rate;/);
    expect(kod).not.toMatch(/RETURN p_amount \* p_rate;/);
  });

  it('aynı para biriminde YUVARLAMA YOK (TS erken return ediyor)', () => {
    expect(kod).toMatch(/IF COALESCE\(p_source, 'TRY'\) = COALESCE\(p_target, 'TRY'\) THEN\s*\n\s*RETURN p_amount;/);
  });

  it('kur yok/geçersiz ve para birimleri farklıysa HATA', () => {
    const fn = kod.slice(
      kod.indexOf('CREATE FUNCTION internal.cevrilen_tutar'),
      kod.indexOf('CREATE FUNCTION internal.bakiye_ops')
    );
    expect(fn).toMatch(/IF p_rate IS NULL[\s\S]*?OR p_rate <= 0 THEN\s*\n\s*RAISE EXCEPTION/);
  });

  it('0/negatif kur ÜST SEVİYEDE reddediliyor (aynı para biriminde bile)', () => {
    const fn = kod.slice(kod.indexOf('CREATE FUNCTION internal.bakiye_ops'));
    expect(fn).toMatch(/IF v_rate IS NOT NULL\s*\n\s*AND \([\s\S]*?OR v_rate <= 0\) THEN\s*\n\s*RAISE EXCEPTION/);
    // Bu kontrol tip switch'inden ÖNCE gelmeli
    expect(fn.indexOf('v_rate <= 0')).toBeLessThan(fn.indexOf('CASE v_type'));
  });

  it('float8 kullanılmıyor — numeric zorunlu (IEEE754 sapması olmasın)', () => {
    expect(kod).not.toMatch(/\bfloat8\b|\bdouble precision\b|\breal\b/i);
  });

  it('NaN/±Infinity TUTAR için reddediliyor (CHECK amount>0 NaN’ı geçirir)', () => {
    const fn = kod.slice(kod.indexOf('CREATE FUNCTION internal.bakiye_ops'));
    expect(fn).toMatch(/v_amount = 'NaN'::numeric/);
    expect(fn).toMatch(/v_amount =\s+'Infinity'::numeric/);
    expect(fn).toMatch(/v_amount = '-Infinity'::numeric/);
  });

  it('NaN/±Infinity KUR için reddediliyor ve kontrol <=0’DAN ÖNCE geliyor', () => {
    const fn = kod.slice(kod.indexOf('CREATE FUNCTION internal.bakiye_ops'));
    expect(fn).toMatch(/v_rate = 'NaN'::numeric/);
    expect(fn).toMatch(/v_rate =\s+'Infinity'::numeric/);
    expect(fn).toMatch(/v_rate = '-Infinity'::numeric/);
    // 'NaN' <= 0 FALSE olduğu için sıralama önemli
    expect(fn.indexOf("v_rate = 'NaN'::numeric")).toBeLessThan(fn.indexOf('v_rate <= 0'));
  });

  it('cevrilen_tutar da NaN/sonsuz savunmasını TEKRARLIYOR (derinlemesine)', () => {
    const fn = kod.slice(
      kod.indexOf('CREATE FUNCTION internal.cevrilen_tutar'),
      kod.indexOf('CREATE FUNCTION internal.bakiye_ops')
    );
    expect(fn).toMatch(/p_rate = 'NaN'::numeric/);
    expect(fn).toMatch(/p_amount = 'NaN'::numeric/);
  });

  it('IS NULL kontrolü TEK BAŞINA kullanılmıyor — NaN IS NULL false döner', () => {
    const fn = kod.slice(kod.indexOf('CREATE FUNCTION internal.bakiye_ops'));
    // v_amount guard'ında NULL kontrolü NaN kontrolüyle BİRLİKTE olmalı
    expect(fn).toMatch(/IF v_amount IS NULL\s*\n\s*OR v_amount = 'NaN'::numeric/);
  });

  it('13 bakiye etkileyen tipin hepsi mevcut', () => {
    for (const t of [
      'gelir', 'gider', 'transfer',
      'cari_alis', 'cari_satis', 'cari_odeme', 'cari_tahsilat',
      'cari_alis_iade', 'cari_satis_iade',
      'personel_gider', 'personel_odeme', 'personel_tahsilat', 'personel_satis',
    ]) {
      expect(kod).toMatch(new RegExp(`WHEN '${t}' THEN`));
    }
  });

  it('izin tipleri ve nakit_avans_taksit op üretmiyor (ELSE RETURN)', () => {
    const fn = kod.slice(kod.indexOf('CREATE FUNCTION internal.bakiye_ops'));
    expect(fn).not.toMatch(/WHEN 'personel_izin_hakki'/);
    expect(fn).not.toMatch(/WHEN 'nakit_avans_taksit'/);
    expect(fn).toMatch(/ELSE\s*\n[\s\S]*?RETURN;/);
  });

  it('id NULL ise op üretilmiyor (istemcideki `if (id)` karşılığı)', () => {
    const opSatirlari = kod.match(/RETURN QUERY SELECT '(hesaplar|cariler|personel)'[^;]+;/g) ?? [];
    expect(opSatirlari.length).toBeGreaterThan(12);
    for (const s of opSatirlari) expect(s).toMatch(/WHERE v_\w+\s+IS NOT NULL/);
  });
});

describe('P-B fallback', () => {
  const f = fs.readFileSync(FALLBACK, 'utf8');
  const fKod = f
    .split('\n')
    .filter((s) => !s.trimStart().startsWith('--'))
    .join('\n');

  it('geçerlilik penceresi uyarısı görünür biçimde yazılı', () => {
    expect(f).toMatch(/YALNIZ, HİÇBİR P-C \/ P-F BAĞIMLILIĞI KURULMADAN ÖNCE/);
    expect(f).toMatch(/TEK BAŞINA GERİ ALINAMAZ/);
  });

  it('çalışan SQL yalnız REVOKE — DROP yok', () => {
    expect(fKod).toMatch(/REVOKE EXECUTE ON FUNCTION internal\.etkin_yetki\(uuid, text\) FROM authenticated;/);
    expect(fKod).toMatch(/REVOKE USAGE\s+ON SCHEMA\s+internal\s+FROM authenticated;/);
    expect(fKod).not.toMatch(/\bDROP\b/i);
  });

  it('CASCADE çalışan SQL’de YOK; yorumdaki her geçiş bir YASAK ifadesi', () => {
    // Çalışacak SQL'de kesinlikle bulunmamalı
    expect(fKod).not.toMatch(/\bCASCADE\b/i);
    // Yorumda geçebilir ama YALNIZ yasağı anlatmak için
    const cascadeSatirlari = f.split('\n').filter((x) => /CASCADE/.test(x));
    expect(cascadeSatirlari.length).toBeGreaterThan(0); // yasak açıkça yazılmış olmalı
    for (const s of cascadeSatirlari) {
      expect(s.trimStart().startsWith('--')).toBe(true); // yorum satırı
      expect(s).toMatch(/KULLANILMAZ|YOK|sessizce siler|eklenmeyecek/);
    }
  });

  it('DROP satırları yorumda ve üç şarta bağlanmış', () => {
    expect(f).toMatch(/-- DROP FUNCTION internal\.etkin_yetki\(uuid, text\);/);
    expect(f).toMatch(/AYRI AÇIK ONAY/);
  });
});
