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
const MIGRATION = path.join(KOK, 'supabase/migrations/20260729064915_pb_internal_yetki_altyapisi.sql');
const FALLBACK = path.join(KOK, 'docs/security/taslak/PB-FALLBACK.sql');
const POSTGRES_BEHAVIOR = path.join(
  KOK,
  'docs/security/taslak/PB-POSTGRES-DAVRANIS-TESTI.sql',
);

const ham = fs.readFileSync(MIGRATION, 'utf8');
/** Yorum satırlarını atarak yalnız çalışacak SQL'i bırakır. */
const kod = ham
  .split('\n')
  .filter((s) => !s.trimStart().startsWith('--'))
  .join('\n');

function fonksiyonKodu(ad: string): string {
  const baslangic = kod.indexOf(`CREATE FUNCTION internal.${ad}`);
  if (baslangic < 0) throw new Error(`Fonksiyon bulunamadı: internal.${ad}`);
  const bitis = kod.indexOf('$fn$;', baslangic);
  if (bitis < 0) throw new Error(`Fonksiyon gövde sonu bulunamadı: internal.${ad}`);
  return kod.slice(baslangic, bitis + '$fn$;'.length);
}

const resolverKodu = fonksiyonKodu('etkin_yetki');
const cevrilenTutarKodu = fonksiyonKodu('cevrilen_tutar');

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

  it('her fonksiyonda PUBLIC/anon/authenticated/service_role EXECUTE önce kaldırılmış', () => {
    for (const fn of [
      'internal\\.islem_tipi_modulu\\(text\\)',
      'internal\\.etkin_yetki\\(uuid, text\\)',
      'internal\\.cevrilen_tutar\\(numeric, numeric, text, text\\)',
      'internal\\.bakiye_ops\\(jsonb\\)',
    ]) {
      expect(kod).toMatch(new RegExp(
        `REVOKE EXECUTE ON FUNCTION ${fn}\\s+FROM PUBLIC, anon, authenticated, service_role;`,
      ));
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

  it('PG17 global PUBLIC defaultu per-schema ALTER DEFAULT ile değiştirilmiyor', () => {
    expect(kod).not.toMatch(/\bALTER DEFAULT PRIVILEGES\b/i);
  });

  it('dört fonksiyondan sonra final schema sweep var; resolver grantı sweep’ten sonra', () => {
    const finalSweep =
      'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA internal';
    const resolverGrant =
      'GRANT EXECUTE ON FUNCTION internal.etkin_yetki(uuid, text) TO authenticated;';
    const sonFonksiyon = kod.indexOf(
      'CREATE FUNCTION internal.bakiye_ops(p_islem jsonb)',
    );
    const sweepIndex = kod.indexOf(finalSweep);
    const grantIndex = kod.indexOf(resolverGrant);

    expect(kod).toMatch(
      /REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA internal\s+FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(sonFonksiyon).toBeGreaterThan(-1);
    expect(sweepIndex).toBeGreaterThan(sonFonksiyon);
    expect(grantIndex).toBeGreaterThan(sweepIndex);
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

  it('mevcut tablo/veriye dokunan DML, backfill veya ALTER TABLE içermiyor', () => {
    expect(kod).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(kod).not.toMatch(/\bUPDATE\s+[a-z"]/i);
    expect(kod).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(kod).not.toMatch(/\bTRUNCATE\b/i);
    expect(kod).not.toMatch(/\bALTER\s+TABLE\b/i);
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
    // can_create satırı yalnız can_create okumalı; delete/update bayrağı KARIŞMAMALI.
    expect(resolverKodu).toMatch(
      /COALESCE\(v_act->p_modul->'can_create' = 'true'::jsonb, false\),/,
    );
    // can_create'in bulunduğu satırda başka bir aksiyon bayrağı geçmemeli
    const satir = resolverKodu.split('\n').find((s) => s.includes("'can_create'"));
    expect(satir).toBeDefined();
    expect(satir).not.toMatch(/can_delete|can_update/);
  });

  it('notlar/birikim legacy fallback’i görünürlükte; raw action kapısı ayrı', () => {
    expect(resolverKodu).toMatch(
      /WHEN 'notlar'\s+THEN[\s\S]*?v_legacy[\s\S]*?NOT \(v_mod \? 'notlar'\)/,
    );
    expect(resolverKodu).toMatch(
      /WHEN 'birikim'\s+THEN\s+v_hesaplar_acik\s+AND[\s\S]*?v_legacy[\s\S]*?NOT \(v_mod \? 'birikim'\)/,
    );
    expect(resolverKodu).toMatch(
      /IF NOT v_gorunur OR NOT v_raw_modul_acik THEN[\s\S]*?v_gorunur, false, false, false, false, false,/,
    );
  });

  it('level AÇIK ALLOWLIST ile sınırlı — fail-closed', () => {
    expect(resolverKodu).toMatch(
      /jsonb_typeof\(v_level_json\) IS DISTINCT FROM 'string'/,
    );
    expect(resolverKodu).toMatch(
      /IF v_level NOT IN \('view', 'add', 'edit_own', 'edit_all'\) THEN\s+RETURN QUERY SELECT\s+false, false, false, false, false, false, v_can_see_all_users_data;/,
    );
  });

  it('can_create fail-OPEN `<> view` DEĞİL, pozitif allowlist', () => {
    expect(resolverKodu).not.toMatch(/v_level\s*<>\s*'view'/);
    expect(resolverKodu).toMatch(
      /\(v_level IN \('add', 'edit_own', 'edit_all'\)\),/,
    );
  });

  it('permissions boolean’larında text->boolean cast YOK; yalnız exact jsonb true var', () => {
    expect(resolverKodu).not.toMatch(/::boolean/);
    expect(resolverKodu).not.toMatch(
      /->>\s*'(?:can_create|can_update_own|can_update_all|can_delete_own|can_delete_all|can_see_all_users_data)'/,
    );
    for (const alan of [
      'can_create',
      'can_update_own',
      'can_update_all',
      'can_delete_own',
      'can_delete_all',
      'can_see_all_users_data',
    ]) {
      expect(resolverKodu).toContain(`'${alan}' = 'true'::jsonb`);
    }
  });

  it('görünür/derived modül sözleşmesinin bütün 14 dalı açıkça tanımlı', () => {
    for (const modul of [
      'dashboard',
      'hesaplar',
      'birikim',
      'cariler',
      'personel',
      'islemler',
      'kategoriler',
      'raporlar',
      'cekler',
      'ileri_tarihli',
      'urunler',
      'notlar',
      'arsiv',
      'ayarlar',
    ]) {
      expect(resolverKodu).toMatch(new RegExp(`WHEN '${modul}'\\s+THEN`));
    }
    expect(resolverKodu).toMatch(
      /v_islem_kaynagi_acik :=\s+v_hesaplar_acik OR v_cariler_acik OR v_urunler_acik OR v_personel_acik;/,
    );
    expect(resolverKodu).toMatch(/WHEN 'birikim'\s+THEN\s+v_hesaplar_acik\s+AND/);
    expect(resolverKodu).toMatch(/ELSE false\s+END;/);
  });

  it('global visibility exact true ve bilinmeyen level/modül dönüşünden bağımsız', () => {
    expect(resolverKodu).toMatch(
      /v_can_see_all_users_data := COALESCE\(\s+v_perm->'visibility'->'can_see_all_users_data' = 'true'::jsonb,\s+false\s+\);/,
    );
    expect(resolverKodu).toMatch(
      /IF v_level NOT IN[\s\S]*?false, false, false, false, false, false, v_can_see_all_users_data;/,
    );
    expect(resolverKodu).toMatch(
      /IF NOT v_gorunur OR NOT v_raw_modul_acik THEN[\s\S]*?v_can_see_all_users_data;/,
    );
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
    expect(cevrilenTutarKodu).toMatch(
      /IF p_rate IS NOT NULL[\s\S]*?OR p_rate <= 0\s+\) THEN\s+RAISE EXCEPTION/,
    );
    expect(cevrilenTutarKodu).toMatch(
      /IF p_rate IS NULL THEN\s+RAISE EXCEPTION/,
    );
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
    expect(cevrilenTutarKodu).toMatch(/p_rate = 'NaN'::numeric/);
    expect(cevrilenTutarKodu).toMatch(/p_amount = 'NaN'::numeric/);
  });

  it('cevrilen_tutar amount/rate güvenlik guard’ları same-currency early return’den ÖNCE', () => {
    const tutarGuard = cevrilenTutarKodu.indexOf('IF p_amount IS NULL');
    const kurGuard = cevrilenTutarKodu.indexOf('IF p_rate IS NOT NULL');
    const erkenDonus = cevrilenTutarKodu.indexOf(
      "IF COALESCE(p_source, 'TRY') = COALESCE(p_target, 'TRY')",
    );
    expect(tutarGuard).toBeGreaterThan(-1);
    expect(kurGuard).toBeGreaterThan(-1);
    expect(erkenDonus).toBeGreaterThan(-1);
    expect(tutarGuard).toBeLessThan(erkenDonus);
    expect(kurGuard).toBeLessThan(erkenDonus);
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

  it('geçerlilik penceresinin P-D bağımlılıkları nedeniyle kapandığı görünür biçimde yazılı', () => {
    expect(f).toMatch(/YALNIZ, HİÇBİR P-C \/ P-D \/ P-F BAĞIMLILIĞI KURULMADAN ÖNCE/);
    expect(f).toMatch(/BU PENCERE KAPANMIŞTIR/);
    expect(f).toMatch(/get_kategori_secim_referanslari\(uuid,text\)/);
    expect(f).toMatch(/get_transaction_creator_labels\(uuid\)/);
    expect(f).toMatch(/TEK BAŞINA GERİ ALINAMAZ/);
    expect(f).toMatch(/SECURITY DEFINER public wrapper'lar/);
    expect(f).toMatch(/LIKE '%islem_tipi_modulu%'/);
  });

  it('çalışan SQL bağımlılık guardı + REVOKE içeriyor; DROP yok', () => {
    expect(fKod).toMatch(/\bBEGIN;/);
    expect(fKod).toMatch(/DO \$pb_fallback_dependency_guard\$/);
    expect(fKod).toMatch(/P-B fallback blocked: internal resolver dependencies still exist/);
    expect(fKod).toMatch(/policy_dependencies=%s, function_dependencies=%s/);
    expect(fKod).toMatch(/internal\\\.\(etkin_yetki\|islem_tipi_modulu\)/);
    expect(fKod).toMatch(/FROM pg_catalog\.pg_views AS view_def/);
    expect(fKod).toMatch(/FROM pg_catalog\.pg_depend AS dep/);
    expect(fKod).toMatch(/REVOKE EXECUTE ON FUNCTION internal\.etkin_yetki\(uuid, text\) FROM authenticated;/);
    expect(fKod).toMatch(/REVOKE USAGE\s+ON SCHEMA\s+internal\s+FROM authenticated;/);
    expect(fKod).toMatch(/\bCOMMIT;/);
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

describe('P-B gerçek PostgreSQL adversarial test sözleşmesi', () => {
  const pgTest = fs.readFileSync(POSTGRES_BEHAVIOR, 'utf8');

  it('yalnız izole ortam için transaction + zorunlu rollback ile kilitli', () => {
    expect(pgTest).toMatch(/ÜRETİMDE ÇALIŞTIRMA/);
    expect(pgTest).toMatch(/\\set ON_ERROR_STOP on/);
    expect(pgTest).toMatch(/\bBEGIN;/);
    expect(pgTest).toMatch(/\bROLLBACK;/);
    expect(pgTest).not.toMatch(/\bCOMMIT;/);
  });

  it('PostgreSQL boolean-cast adversarial değerlerini actual resolverda sınar', () => {
    expect(pgTest).toContain('[null,"true","yes","on","1",1,{},[]]');
    expect(pgTest).toMatch(/FROM internal\.etkin_yetki\(v_isletme, 'cariler'\)/);
    expect(pgTest).toMatch(/exact-jsonb ihlali/);
  });

  it('derived/birikim/legacy/unknown-level/global-visibility davranışlarını sınar', () => {
    for (const kanit of [
      'derived görünürlük/raw action kapısı başarısız',
      'birikim Hesaplar kapalıyken görünür oldu',
      'legacy modules=null notlar fallback başarısız',
      'unknown-level/global-visibility sözleşmesi başarısız',
    ]) {
      expect(pgTest).toContain(kanit);
    }
  });

  it('same-currency direct helper NaN testleri ve resultant ACL testi var', () => {
    expect(pgTest).toMatch(
      /internal\.cevrilen_tutar\('NaN'::numeric, NULL, 'TRY', 'TRY'\)/,
    );
    expect(pgTest).toMatch(/aclexplode\(/);
    expect(pgTest).toContain('PB_POSTGRES_BEHAVIOR_OK');
  });
});
