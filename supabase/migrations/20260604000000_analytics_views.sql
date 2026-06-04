-- =============================================================================
-- Analitik View'leri (Faz 1) — mevcut veriden türetilmiş, uygulamaya dokunmaz
-- =============================================================================
-- Hepsi Supabase Dashboard > Table Editor'da tablo gibi görünür.
-- Tümü WITH (security_invoker = on): Dashboard'dan (postgres/service_role) tüm
-- veriyi görürsün; uygulama kullanıcıları RLS nedeniyle yalnızca kendi verisini
-- görür (çapraz-kiracı sızıntısı yok). daily_usage_summary ile aynı desen.
--
-- View'ler ve ne işe yaradıkları:
--   isletme_ozet            : işletme başına sağlık (işlem/hesap/cari/personel/kullanıcı + durum + segment)
--   isletme_aktivasyon      : işletme başına aktivasyon (hesap var mı, ilk işlem, kayıt→ilk işlem gün farkı)
--   aktivasyon_hunisi       : toplu onboarding hunisi (oluştu → hesap → ilk işlem → cari/personel + oranlar)
--   kohort_retention        : haftalık kohort geri dönüş (D1 / D7 / D30)
--   aktiflik_ozeti          : DAU / WAU / MAU + yapışkanlık oranı
--   kullanici_durumu        : kullanıcı başına son giriş + aktif/uyuyan/churn
--   ozellik_penetrasyonu    : canlı özelliklerin % kaç işletmede kullanıldığı
--   platform_dagilimi       : iOS / Android / Web kırılımı
--   edge_fonksiyon_kullanimi: hangi edge function ne sıklıkta çağrılıyor
-- =============================================================================


-- =============================================================================
-- 1) isletme_ozet — İşletme başına sağlık karnesi (en çok kullanacağın tablo)
-- =============================================================================
CREATE OR REPLACE VIEW isletme_ozet
WITH (security_invoker = on) AS
SELECT
  i.id                                   AS isletme_id,
  i.name                                 AS isletme_adi,
  i.created_at::date                     AS kayit_tarihi,
  COALESCE(s.islem_sayisi, 0)            AS islem_sayisi,
  s.son_islem::date                      AS son_islem,
  COALESCE(h.aktif_hesap, 0)             AS aktif_hesap,
  COALESCE(c.cari_sayisi, 0)             AS cari_sayisi,
  COALESCE(p.personel_sayisi, 0)         AS personel_sayisi,
  1 + COALESCE(u.ek_kullanici, 0)        AS kullanici_sayisi,  -- sahip + aktif ek üyeler
  CASE
    WHEN COALESCE(s.islem_sayisi, 0) = 0                          THEN 'olu'
    WHEN s.son_islem >= NOW() - INTERVAL '30 days'                THEN 'aktif'
    ELSE 'uyuyan'
  END                                    AS durum,
  CASE
    WHEN COALESCE(s.islem_sayisi, 0) = 0  THEN 'hayalet'
    WHEN s.islem_sayisi >= 100            THEN 'power'
    WHEN s.islem_sayisi >= 10             THEN 'duzenli'
    ELSE 'baslangic'
  END                                    AS segment
FROM isletmeler i
LEFT JOIN (
  SELECT isletme_id, COUNT(*) AS islem_sayisi, MAX(created_at) AS son_islem
  FROM islemler GROUP BY isletme_id
) s ON s.isletme_id = i.id
LEFT JOIN (
  SELECT isletme_id, COUNT(*) AS aktif_hesap
  FROM hesaplar WHERE is_active GROUP BY isletme_id
) h ON h.isletme_id = i.id
LEFT JOIN (
  SELECT isletme_id, COUNT(*) AS cari_sayisi FROM cariler GROUP BY isletme_id
) c ON c.isletme_id = i.id
LEFT JOIN (
  SELECT isletme_id, COUNT(*) AS personel_sayisi FROM personel GROUP BY isletme_id
) p ON p.isletme_id = i.id
LEFT JOIN (
  SELECT isletme_id, COUNT(*) AS ek_kullanici
  FROM isletme_users WHERE status = 'active' GROUP BY isletme_id
) u ON u.isletme_id = i.id
ORDER BY s.son_islem DESC NULLS LAST;


-- =============================================================================
-- 2) isletme_aktivasyon — İşletme başına aktivasyon ayrıntısı
-- =============================================================================
CREATE OR REPLACE VIEW isletme_aktivasyon
WITH (security_invoker = on) AS
SELECT
  i.id                                          AS isletme_id,
  i.name                                        AS isletme_adi,
  i.created_at::date                            AS kayit_tarihi,
  EXISTS (SELECT 1 FROM hesaplar h WHERE h.isletme_id = i.id)   AS hesap_var,
  COALESCE(s.islem_sayisi, 0)                   AS islem_sayisi,
  s.ilk_islem::date                             AS ilk_islem_tarihi,
  (s.ilk_islem::date - i.created_at::date)      AS ilk_islem_gun_farki  -- kayıttan ilk işleme kaç gün
FROM isletmeler i
LEFT JOIN (
  SELECT isletme_id, COUNT(*) AS islem_sayisi, MIN(created_at) AS ilk_islem
  FROM islemler GROUP BY isletme_id
) s ON s.isletme_id = i.id
ORDER BY i.created_at DESC;


-- =============================================================================
-- 3) aktivasyon_hunisi — Toplu onboarding hunisi (tek satır)
-- =============================================================================
CREATE OR REPLACE VIEW aktivasyon_hunisi
WITH (security_invoker = on) AS
SELECT
  COUNT(*)                                                              AS toplam_isletme,
  COUNT(*) FILTER (WHERE has_hesap)                                     AS hesap_ekleyen,
  COUNT(*) FILTER (WHERE has_islem)                                     AS ilk_islem_giren,
  COUNT(*) FILTER (WHERE has_cari_personel)                             AS cari_personel_ekleyen,
  ROUND(100.0 * COUNT(*) FILTER (WHERE has_hesap) / NULLIF(COUNT(*), 0), 1)         AS hesap_orani,
  ROUND(100.0 * COUNT(*) FILTER (WHERE has_islem) / NULLIF(COUNT(*), 0), 1)         AS islem_orani,
  ROUND(100.0 * COUNT(*) FILTER (WHERE has_cari_personel) / NULLIF(COUNT(*), 0), 1) AS cari_personel_orani
FROM (
  SELECT
    i.id,
    EXISTS (SELECT 1 FROM hesaplar h WHERE h.isletme_id = i.id) AS has_hesap,
    EXISTS (SELECT 1 FROM islemler x WHERE x.isletme_id = i.id) AS has_islem,
    (   EXISTS (SELECT 1 FROM cariler  c WHERE c.isletme_id = i.id)
     OR EXISTS (SELECT 1 FROM personel p WHERE p.isletme_id = i.id)) AS has_cari_personel
  FROM isletmeler i
) t;


-- =============================================================================
-- 4) kohort_retention — Haftalık kohort geri dönüş oranları (D1 / D7 / D30)
-- =============================================================================
-- kohort_hafta: kullanıcının uygulamayı İLK açtığı haftanın başlangıcı.
-- d1   : ilk günün ertesi günü tekrar açanlar
-- d7   : ilk günden sonra 7 gün içinde en az 1 kez geri dönenler
-- d30  : ilk günden sonra 30 gün içinde en az 1 kez geri dönenler
CREATE OR REPLACE VIEW kohort_retention
WITH (security_invoker = on) AS
WITH ilk AS (
  SELECT user_id, MIN(opened_at::date) AS ilk_gun
  FROM app_sessions GROUP BY user_id
),
gunler AS (
  SELECT DISTINCT user_id, opened_at::date AS gun FROM app_sessions
)
SELECT
  date_trunc('week', i.ilk_gun)::date                                                       AS kohort_hafta,
  COUNT(DISTINCT i.user_id)                                                                 AS kullanici,
  COUNT(DISTINCT g.user_id) FILTER (WHERE g.gun = i.ilk_gun + 1)                            AS d1,
  COUNT(DISTINCT g.user_id) FILTER (WHERE g.gun > i.ilk_gun AND g.gun <= i.ilk_gun + 7)     AS d7,
  COUNT(DISTINCT g.user_id) FILTER (WHERE g.gun > i.ilk_gun AND g.gun <= i.ilk_gun + 30)    AS d30,
  ROUND(100.0 * COUNT(DISTINCT g.user_id) FILTER (WHERE g.gun > i.ilk_gun AND g.gun <= i.ilk_gun + 7)
        / NULLIF(COUNT(DISTINCT i.user_id), 0), 1)                                          AS d7_oran,
  ROUND(100.0 * COUNT(DISTINCT g.user_id) FILTER (WHERE g.gun > i.ilk_gun AND g.gun <= i.ilk_gun + 30)
        / NULLIF(COUNT(DISTINCT i.user_id), 0), 1)                                          AS d30_oran
FROM ilk i
LEFT JOIN gunler g ON g.user_id = i.user_id
GROUP BY date_trunc('week', i.ilk_gun)
ORDER BY kohort_hafta DESC;


-- =============================================================================
-- 5) aktiflik_ozeti — DAU / WAU / MAU + yapışkanlık (tek satır)
-- =============================================================================
CREATE OR REPLACE VIEW aktiflik_ozeti
WITH (security_invoker = on) AS
SELECT
  COUNT(DISTINCT user_id) FILTER (WHERE opened_at::date = CURRENT_DATE)        AS dau_bugun,
  COUNT(DISTINCT user_id) FILTER (WHERE opened_at >= NOW() - INTERVAL '1 day') AS dau,
  COUNT(DISTINCT user_id) FILTER (WHERE opened_at >= NOW() - INTERVAL '7 days') AS wau,
  COUNT(DISTINCT user_id) FILTER (WHERE opened_at >= NOW() - INTERVAL '30 days') AS mau,
  ROUND(
    100.0 * COUNT(DISTINCT user_id) FILTER (WHERE opened_at >= NOW() - INTERVAL '1 day')
    / NULLIF(COUNT(DISTINCT user_id) FILTER (WHERE opened_at >= NOW() - INTERVAL '30 days'), 0), 1
  )                                                                            AS yapiskanlik_orani  -- DAU/MAU %
FROM app_sessions;


-- =============================================================================
-- 6) kullanici_durumu — Kullanıcı başına son giriş + aktif/uyuyan/churn
-- =============================================================================
CREATE OR REPLACE VIEW kullanici_durumu
WITH (security_invoker = on) AS
SELECT
  user_id,
  MIN(opened_at)::date                          AS ilk_giris,
  MAX(opened_at)::date                          AS son_giris,
  (CURRENT_DATE - MAX(opened_at)::date)         AS gun_once,
  COUNT(*)                                      AS toplam_giris,
  CASE
    WHEN MAX(opened_at) >= NOW() - INTERVAL '7 days'  THEN 'aktif'
    WHEN MAX(opened_at) >= NOW() - INTERVAL '30 days' THEN 'uyuyan'
    ELSE 'churn'
  END                                           AS durum
FROM app_sessions
GROUP BY user_id
ORDER BY son_giris DESC;


-- =============================================================================
-- 7) ozellik_penetrasyonu — Canlı özelliklerin yaygınlığı (tek satır)
-- =============================================================================
-- NOT: OCR ve nakit avans henüz uygulamada aktif olmadığından dahil edilmedi.
-- Aktif olunca buraya eklenebilir.
CREATE OR REPLACE VIEW ozellik_penetrasyonu
WITH (security_invoker = on) AS
SELECT
  COUNT(*)                                  AS toplam_isletme,
  COUNT(*) FILTER (WHERE coklu_pb)          AS coklu_para_birimi,
  COUNT(*) FILTER (WHERE multi_user)        AS multi_user,
  COUNT(*) FILTER (WHERE cek_var)           AS cek,
  COUNT(*) FILTER (WHERE urun_var)          AS urun_stok,
  COUNT(*) FILTER (WHERE ileri_var)         AS ileri_tarihli,
  COUNT(*) FILTER (WHERE not_var)           AS notlar,
  ROUND(100.0 * COUNT(*) FILTER (WHERE coklu_pb)   / NULLIF(COUNT(*), 0), 1) AS coklu_pb_oran,
  ROUND(100.0 * COUNT(*) FILTER (WHERE multi_user) / NULLIF(COUNT(*), 0), 1) AS multi_user_oran,
  ROUND(100.0 * COUNT(*) FILTER (WHERE cek_var)    / NULLIF(COUNT(*), 0), 1) AS cek_oran,
  ROUND(100.0 * COUNT(*) FILTER (WHERE urun_var)   / NULLIF(COUNT(*), 0), 1) AS urun_stok_oran,
  ROUND(100.0 * COUNT(*) FILTER (WHERE ileri_var)  / NULLIF(COUNT(*), 0), 1) AS ileri_tarihli_oran,
  ROUND(100.0 * COUNT(*) FILTER (WHERE not_var)    / NULLIF(COUNT(*), 0), 1) AS notlar_oran
FROM (
  SELECT
    i.id,
    EXISTS (SELECT 1 FROM hesaplar h WHERE h.isletme_id = i.id AND h.currency <> 'TRY')        AS coklu_pb,
    EXISTS (SELECT 1 FROM isletme_users u WHERE u.isletme_id = i.id AND u.status = 'active')    AS multi_user,
    EXISTS (SELECT 1 FROM cekler c WHERE c.isletme_id = i.id)                                   AS cek_var,
    EXISTS (SELECT 1 FROM urun_hareketler uh WHERE uh.isletme_id = i.id)                        AS urun_var,
    EXISTS (SELECT 1 FROM ileri_tarihli_islemler it WHERE it.isletme_id = i.id)                 AS ileri_var,
    EXISTS (SELECT 1 FROM notlar n WHERE n.isletme_id = i.id)                                   AS not_var
  FROM isletmeler i
) t;


-- =============================================================================
-- 8) platform_dagilimi — iOS / Android / Web kırılımı
-- =============================================================================
CREATE OR REPLACE VIEW platform_dagilimi
WITH (security_invoker = on) AS
SELECT
  platform,
  COUNT(DISTINCT user_id)                                                        AS kullanici,
  COUNT(*)                                                                       AS oturum,
  COUNT(DISTINCT user_id) FILTER (WHERE opened_at >= NOW() - INTERVAL '30 days') AS aktif_kullanici_30g
FROM app_sessions
GROUP BY platform
ORDER BY kullanici DESC;


-- =============================================================================
-- 9) edge_fonksiyon_kullanimi — Hangi edge function ne sıklıkta çağrılıyor
-- =============================================================================
CREATE OR REPLACE VIEW edge_fonksiyon_kullanimi
WITH (security_invoker = on) AS
SELECT
  function_name                                                                 AS fonksiyon,
  COUNT(*)                                                                       AS cagri_sayisi,
  COUNT(DISTINCT user_id)                                                        AS kullanici_sayisi,
  MAX(called_at)::date                                                           AS son_cagri,
  COUNT(*) FILTER (WHERE called_at >= NOW() - INTERVAL '30 days')                AS son_30g_cagri
FROM api_usage
GROUP BY function_name
ORDER BY cagri_sayisi DESC;
