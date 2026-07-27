-- =============================================================================
-- undo_import_batch — OWNER GUARD + TENANT KAPSAMI + YETKİ TEMİZLİĞİ
--
-- ⚠️ HENÜZ ÜRETİME UYGULANMADI. Uygulama için ayrı onay gerekir.
--
-- SORUN (P0): fonksiyon SECURITY DEFINER, HİÇBİR erişim kontrolü yapmıyordu ve
-- EXECUTE yetkisi anon + public dahil herkesteydi (canlı katalogdan doğrulandı).
-- Verilen UUID dizisi için hesap/cari/personel bakiyelerini geri alıp işlemleri
-- SİLİYOR. UUID'ler farklı işletmelerden olabiliyordu; hiçbir yerde isletme_id
-- kullanılmıyordu. Kısıtlı bir ortak, hatta giriş yapmamış biri, elindeki
-- UUID'lerle başka işletmenin kayıtlarını silebilirdi.
--
-- GÖVDE KAYNAĞI: CANLI TANIM (repo dosyası DEĞİL).
--   docs/security/db-snapshots/2026-07-26/undo_import_batch.live.sql
--   md5 = d276147891f458fd7cc74cc632e1b43c   (uygulama anında YENİDEN doğrula)
-- Sebep: repo bu fonksiyonda da bayat olabilir; önceki migration denemesi
-- (20260726000000) tam bu yüzden geri çekildi.
--
-- KORUNANLAR (sözleşme):
--   • imza      : undo_import_batch(p_transaction_ids uuid[])
--   • dönüş     : json  →  {"deleted_transactions": N}   ← istemci bu anahtarı okuyor
--                 (src/hooks/useImportHistory.ts: data?.deleted_transactions)
--   • SECURITY DEFINER ve SET search_path TO 'public'
--   • Bakiye geri alma matematiği BİREBİR (çapraz-kur dalları dahil) — dokunulmadı
--
-- =============================================================================
-- NEDEN OWNER-ONLY (üyelik + silme yetkisi DEĞİL)
--
-- Ürün sözleşmesi zaten owner-only: "Veri İçe Aktar" menüsü yalnız sahibe
-- gösteriliyor (src/app/(tabs)/daha.tsx:303 → {isOwner && ...}).
-- DB guard'ını bundan gevşek tutmak gereksiz risk yüzeyi açar: level='edit_all'
-- bir ortak, SAHİBİN içe aktardığı on binlerce işlemi topluca geri alabilirdi.
-- P0 düzeltmesinde en güvenli ve en sade kontrol doğrudan owner doğrulamasıdır.
-- İleride ortakların import yapması istenirse ayrı bir 'can_import_data' yetkisi
-- eklenir; o zaman buradaki kontrol ona genişletilir.
--
-- =============================================================================
-- MAKSİMUM BATCH SINIRI — 50.000 (varsayım BELGELİ)
--
-- Sunucuda "import batch" kavramı YOK (islemler'de import_batch_id kolonu yok,
-- %import%/%batch% adlı tablo da yok — ikisi de sorgulandı). Bu yüzden gerçek
-- batch büyüklüğü doğrudan ölçülemiyor. VEKİL ölçüm olarak aynı-gün yığınlarına
-- bakıldı (26 Tem, anonim toplamlar):
--     en büyük tek-gün yığını : 35.606 işlem   ← gerçek bir içe aktarma
--     500'ü aşan gün sayısı   : 1
--     ortalama işletme        : 145 işlem
--     en büyük işletme        : 40.247 işlem
-- Sınır bu gerçek tavanın ÜSTÜNDE seçildi (50.000). Daha düşük bir sayı
-- (ör. 10.000) en büyük gerçek kullanıcının geri alma yeteneğini KIRARDI.
-- Amaç isabet değil, kaza ve kötüye kullanım yüzeyini sınırlamak.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.undo_import_batch(p_transaction_ids uuid[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  deleted_count   INT;
  v_isletme_id    uuid;
  v_input_count   INT;
  v_distinct_in   INT;
  v_found_count   INT;
  v_tenant_count  INT;
  -- Bkz. başlıktaki gerekçe: gerçek tavan 35.606, sınır onun üstünde.
  c_max_batch CONSTANT INT := 50000;
BEGIN
  -- ==========================================================================
  -- GUARD BLOĞU — HİÇBİR YAZMA İŞLEMİNDEN ÖNCE.
  -- Buradaki her RAISE, tek bir satır bile değiştirilmeden çalışır; başarısız
  -- güvenlik kontrolü kullanıcı verisine DOKUNMAZ.
  -- ==========================================================================

  -- (a) NULL / boş dizi
  IF p_transaction_ids IS NULL OR cardinality(p_transaction_ids) = 0 THEN
    RAISE EXCEPTION 'undo_import_batch: islem listesi bos'
      USING ERRCODE = '22023';
  END IF;

  v_input_count := cardinality(p_transaction_ids);

  -- (b) Boyut tavanı
  IF v_input_count > c_max_batch THEN
    RAISE EXCEPTION 'undo_import_batch: cok fazla islem (% adet, tavan %)',
      v_input_count, c_max_batch USING ERRCODE = '22023';
  END IF;

  -- (c) Dizi içinde NULL eleman
  IF EXISTS (SELECT 1 FROM unnest(p_transaction_ids) AS x WHERE x IS NULL) THEN
    RAISE EXCEPTION 'undo_import_batch: listede NULL kimlik var'
      USING ERRCODE = '22023';
  END IF;

  -- (d) Yinelenen kimlik — sessizce tekilleştirmek YOK, açıkça reddedilir.
  --     (Aksi halde "istenen adet = bulunan adet" kontrolü yanlış sonuç verir.)
  SELECT count(DISTINCT x) INTO v_distinct_in FROM unnest(p_transaction_ids) AS x;
  IF v_distinct_in <> v_input_count THEN
    RAISE EXCEPTION 'undo_import_batch: listede yinelenen kimlik var'
      USING ERRCODE = '22023';
  END IF;

  -- (e) HEPSİ VAR MI + KAÇ FARKLI İŞLETMEDEN
  --     NOT: min(uuid) aggregate'i Postgres'te YOKTUR — isletme_id ayrı
  --     sorguyla alınır (canlı katalogda doğrulandı).
  SELECT count(*), count(DISTINCT i.isletme_id)
    INTO v_found_count, v_tenant_count
    FROM islemler i
   WHERE i.id = ANY(p_transaction_ids);

  IF v_found_count <> v_input_count THEN
    RAISE EXCEPTION 'undo_import_batch: bazi islemler bulunamadi (istenen %, bulunan %)',
      v_input_count, v_found_count USING ERRCODE = '22023';
  END IF;

  -- (f) Karışık tenant = saldırı imzası. Kısmi işlem YOK, tamamı reddedilir.
  IF v_tenant_count <> 1 THEN
    RAISE EXCEPTION 'undo_import_batch: islemler tek isletmeye ait olmali'
      USING ERRCODE = '42501';
  END IF;

  SELECT i.isletme_id INTO v_isletme_id
    FROM islemler i
   WHERE i.id = ANY(p_transaction_ids)
   LIMIT 1;

  -- (g) YALNIZ İŞLETME SAHİBİ. Aktif üye yetmez — bkz. başlıktaki gerekçe.
  IF NOT EXISTS (
    SELECT 1 FROM isletmeler
     WHERE id = v_isletme_id
       AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'undo_import_batch: bu islemi yalnizca isletme sahibi yapabilir'
      USING ERRCODE = '42501';
  END IF;

  -- (h) YARIŞ PENCERESİNİ KAPAT: kontroller ile silme arasında satırlar
  --     değişmesin/silinmesin diye hedef satırlar kilitlenir.
  PERFORM 1 FROM islemler
   WHERE id = ANY(p_transaction_ids)
     AND isletme_id = v_isletme_id
     FOR UPDATE;

  -- ==========================================================================
  -- BURADAN SONRASI CANLI GÖVDENİN AYNISI — tek fark: her sorguya
  -- "AND isletme_id = v_isletme_id" tenant kapsamı eklendi (savunma derinliği).
  -- Bakiye matematiğine (çapraz-kur dalları dahil) DOKUNULMADI.
  -- ==========================================================================

  -- 1. Hesap bakiyelerini geri al (aggregate + tek UPDATE)
  UPDATE hesaplar h
  SET balance = h.balance + agg.delta, updated_at = NOW()
  FROM (
    SELECT entity_id, SUM(delta) as delta FROM (
      SELECT hesap_id as entity_id,
        CASE
          WHEN type IN ('gelir', 'cari_tahsilat', 'personel_tahsilat') THEN -amount
          WHEN type IN ('gider', 'cari_odeme', 'personel_odeme') THEN amount
          WHEN type = 'transfer' THEN amount
          ELSE 0
        END as delta
      FROM islemler
      WHERE id = ANY(p_transaction_ids) AND isletme_id = v_isletme_id AND hesap_id IS NOT NULL
      UNION ALL
      SELECT hedef_hesap_id as entity_id,
        -(CASE
          WHEN source_currency IS NOT NULL AND target_currency IS NOT NULL
               AND source_currency <> target_currency
               AND exchange_rate IS NOT NULL AND exchange_rate > 0 THEN
            CASE
              WHEN source_currency = 'TRY' THEN amount / exchange_rate
              ELSE amount * exchange_rate
            END
          ELSE amount
        END) as delta
      FROM islemler
      WHERE id = ANY(p_transaction_ids) AND isletme_id = v_isletme_id
        AND type = 'transfer' AND hedef_hesap_id IS NOT NULL
    ) sub GROUP BY entity_id
  ) agg
  WHERE h.id = agg.entity_id AND h.isletme_id = v_isletme_id;

  -- 2. Cari bakiyelerini geri al - CROSS-CURRENCY AWARE
  UPDATE cariler c
  SET balance = c.balance + agg.delta, updated_at = NOW()
  FROM (
    SELECT cari_id as entity_id, SUM(
      CASE
        WHEN type IN ('cari_satis', 'cari_alis_iade') THEN -amount
        WHEN type IN ('cari_alis', 'cari_satis_iade') THEN amount
        WHEN type = 'cari_odeme' THEN
          -(CASE
            WHEN source_currency IS NOT NULL AND target_currency IS NOT NULL
                 AND source_currency <> target_currency
                 AND exchange_rate IS NOT NULL AND exchange_rate > 0 THEN
              CASE
                WHEN source_currency = 'TRY' THEN amount / exchange_rate
                ELSE amount * exchange_rate
              END
            ELSE amount
          END)
        WHEN type = 'cari_tahsilat' THEN
          (CASE
            WHEN source_currency IS NOT NULL AND target_currency IS NOT NULL
                 AND source_currency <> target_currency
                 AND exchange_rate IS NOT NULL AND exchange_rate > 0 THEN
              CASE
                WHEN source_currency = 'TRY' THEN amount / exchange_rate
                ELSE amount * exchange_rate
              END
            ELSE amount
          END)
        ELSE 0
      END
    ) as delta
    FROM islemler
    WHERE id = ANY(p_transaction_ids) AND isletme_id = v_isletme_id AND cari_id IS NOT NULL
    GROUP BY cari_id
  ) agg
  WHERE c.id = agg.entity_id AND c.isletme_id = v_isletme_id;

  -- 3. Personel bakiyelerini geri al - CROSS-CURRENCY AWARE
  UPDATE personel p
  SET balance = p.balance + agg.delta, updated_at = NOW()
  FROM (
    SELECT personel_id as entity_id, SUM(
      CASE
        WHEN type = 'personel_gider' THEN amount
        WHEN type = 'personel_satis' THEN -amount
        WHEN type = 'personel_odeme' THEN
          -(CASE
            WHEN source_currency IS NOT NULL AND target_currency IS NOT NULL
                 AND source_currency <> target_currency
                 AND exchange_rate IS NOT NULL AND exchange_rate > 0 THEN
              CASE
                WHEN source_currency = 'TRY' THEN amount / exchange_rate
                ELSE amount * exchange_rate
              END
            ELSE amount
          END)
        WHEN type = 'personel_tahsilat' THEN
          (CASE
            WHEN source_currency IS NOT NULL AND target_currency IS NOT NULL
                 AND source_currency <> target_currency
                 AND exchange_rate IS NOT NULL AND exchange_rate > 0 THEN
              CASE
                WHEN source_currency = 'TRY' THEN amount / exchange_rate
                ELSE amount * exchange_rate
              END
            ELSE amount
          END)
        ELSE 0
      END
    ) as delta
    FROM islemler
    WHERE id = ANY(p_transaction_ids) AND isletme_id = v_isletme_id AND personel_id IS NOT NULL
    GROUP BY personel_id
  ) agg
  WHERE p.id = agg.entity_id AND p.isletme_id = v_isletme_id;

  -- 4. Islemleri sil (tenant kapsamlı)
  DELETE FROM islemler
   WHERE id = ANY(p_transaction_ids)
     AND isletme_id = v_isletme_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- Dönüş sözleşmesi DEĞİŞMEDİ — istemci bu anahtarı okuyor.
  RETURN json_build_object('deleted_transactions', deleted_count);
END;
$function$;


-- =============================================================================
-- YETKİ TEMİZLİĞİ — anon ve PUBLIC çalıştıramaz
-- Canlı durum (26 Tem): EXECUTE = anon, authenticated, public, service_role
-- =============================================================================
REVOKE EXECUTE ON FUNCTION public.undo_import_batch(uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.undo_import_batch(uuid[]) TO authenticated;


-- =============================================================================
-- ESKİ CLIENT NE YAŞAR? (AGENTS.md kuralı — yazılı cevap)
--
-- 1) İŞLETME SAHİBİ kendi import'unu geri alıyor:
--    DEĞİŞİKLİK YOK. Aynı imza, aynı dönüş, aynı bakiye matematiği.
--    Menü zaten yalnız sahibe görünüyor → normal akış birebir korunur.
--
-- 2) ORTAK (owner değil) geri almayı deniyor:
--    ARTIK 42501 hatası alır. ÖNCEDEN BAŞARIYLA SİLEBİLİYORDU.
--    ⚠️ Görünür davranış değişikliği. Ama menü zaten owner-only olduğu için
--    ortak bu akışa normal yoldan ULAŞAMIYOR; yalnız deep-link ya da doğrudan
--    API çağrısı senaryosunda karşılaşılır. İstemci tarafında bu hata
--    kullanıcı dostu Türkçe mesaja çevrildi (useImportHistory).
--
-- 3) ANON çağrı: EXECUTE kalktı. İstemcide anon çağrı YOK (kod tarandı).
--
-- 4) Bozuk/eksik/yinelenen UUID listesi: ÖNCEDEN sessizce kısmi iş yapıyordu
--    (var olanları siler, olmayanları yok sayardı). ARTIK tamamı reddedilir.
--    Bu bir DÜZELTMEdir ama davranış değişikliğidir — kısmi geri alma ile
--    oluşan bakiye tutarsızlıkları da böylece imkânsızlaşır.
--
-- 5) Aynı anda iki geri alma: FOR UPDATE kilidi sayesinde ikincisi bekler,
--    sonra "bazi islemler bulunamadi" ile reddedilir (çifte geri alma yok).
--
-- VERİ SİLİNMİYOR/DEĞİŞTİRİLMİYOR: bu migration yalnız fonksiyon gövdesini ve
-- EXECUTE yetkisini değiştirir. Tablo/kolon/satır düşürülmez.
--
-- GERİ ALMA: docs/security/taslak/undo_import_batch-FALLBACK.sql
-- =============================================================================
