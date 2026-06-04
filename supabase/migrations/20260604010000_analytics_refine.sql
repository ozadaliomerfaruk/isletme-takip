-- =============================================================================
-- Analitik İyileştirme (Faz 1.1)
-- - isletmeler.is_internal bayrağı (kurucu/test hesabını analizden çıkarmak için)
-- - Tüm analitik view'ler internal hesabı HARİÇ tutacak şekilde güncellendi
-- - kohort_retention: penceresi dolmamış kohortlarda D7/D30 artık NULL (yanıltmaz)
-- - Yeni view: buyume_trend (haftalık büyüme)
-- - Yeni view: kullanim_profili (işlem tipi dağılımı)
-- Veriye dokunmaz: is_internal NOT NULL DEFAULT false eklenir; yalnızca kurucu
-- hesabı (user_id) işaretlenir; view'ler CREATE OR REPLACE. security_invoker = on.
-- =============================================================================

ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

-- Kurucu/test hesabı (analizleri çarpıtıyordu) — yalnızca bu user_id işaretlenir
UPDATE isletmeler SET is_internal = true
WHERE user_id = 'd8eaa4a8-1a01-4198-bac8-79c3aebf9b53';

CREATE OR REPLACE VIEW daily_usage_summary WITH (security_invoker = on) AS
WITH first_seen AS (
  SELECT user_id, MIN(opened_at::date) AS ilk_giris
  FROM app_sessions
  WHERE user_id NOT IN (SELECT user_id FROM isletmeler WHERE is_internal)
  GROUP BY user_id
)
SELECT
  s.opened_at::date AS gun,
  COUNT(DISTINCT s.user_id) AS toplam_kullanici,
  COUNT(DISTINCT CASE WHEN f.ilk_giris = s.opened_at::date THEN s.user_id END) AS yeni_kullanici,
  COUNT(DISTINCT CASE WHEN f.ilk_giris < s.opened_at::date THEN s.user_id END) AS geri_donen,
  COUNT(*) AS toplam_giris
FROM app_sessions s
JOIN first_seen f ON f.user_id = s.user_id
GROUP BY s.opened_at::date
ORDER BY s.opened_at::date DESC;

CREATE OR REPLACE VIEW isletme_ozet WITH (security_invoker = on) AS
SELECT
  i.id AS isletme_id, i.name AS isletme_adi, i.created_at::date AS kayit_tarihi,
  COALESCE(s.islem_sayisi, 0) AS islem_sayisi, s.son_islem::date AS son_islem,
  COALESCE(h.aktif_hesap, 0) AS aktif_hesap, COALESCE(c.cari_sayisi, 0) AS cari_sayisi,
  COALESCE(p.personel_sayisi, 0) AS personel_sayisi, 1 + COALESCE(u.ek_kullanici, 0) AS kullanici_sayisi,
  CASE WHEN COALESCE(s.islem_sayisi,0)=0 THEN 'olu'
       WHEN s.son_islem >= NOW() - INTERVAL '30 days' THEN 'aktif' ELSE 'uyuyan' END AS durum,
  CASE WHEN COALESCE(s.islem_sayisi,0)=0 THEN 'hayalet' WHEN s.islem_sayisi>=100 THEN 'power'
       WHEN s.islem_sayisi>=10 THEN 'duzenli' ELSE 'baslangic' END AS segment
FROM isletmeler i
LEFT JOIN (SELECT isletme_id, COUNT(*) AS islem_sayisi, MAX(created_at) AS son_islem FROM islemler GROUP BY isletme_id) s ON s.isletme_id = i.id
LEFT JOIN (SELECT isletme_id, COUNT(*) AS aktif_hesap FROM hesaplar WHERE is_active GROUP BY isletme_id) h ON h.isletme_id = i.id
LEFT JOIN (SELECT isletme_id, COUNT(*) AS cari_sayisi FROM cariler GROUP BY isletme_id) c ON c.isletme_id = i.id
LEFT JOIN (SELECT isletme_id, COUNT(*) AS personel_sayisi FROM personel GROUP BY isletme_id) p ON p.isletme_id = i.id
LEFT JOIN (SELECT isletme_id, COUNT(*) AS ek_kullanici FROM isletme_users WHERE status = 'active' GROUP BY isletme_id) u ON u.isletme_id = i.id
WHERE NOT i.is_internal
ORDER BY s.son_islem DESC NULLS LAST;

CREATE OR REPLACE VIEW isletme_aktivasyon WITH (security_invoker = on) AS
SELECT
  i.id AS isletme_id, i.name AS isletme_adi, i.created_at::date AS kayit_tarihi,
  EXISTS (SELECT 1 FROM hesaplar h WHERE h.isletme_id = i.id) AS hesap_var,
  COALESCE(s.islem_sayisi, 0) AS islem_sayisi, s.ilk_islem::date AS ilk_islem_tarihi,
  (s.ilk_islem::date - i.created_at::date) AS ilk_islem_gun_farki
FROM isletmeler i
LEFT JOIN (SELECT isletme_id, COUNT(*) AS islem_sayisi, MIN(created_at) AS ilk_islem FROM islemler GROUP BY isletme_id) s ON s.isletme_id = i.id
WHERE NOT i.is_internal
ORDER BY i.created_at DESC;

CREATE OR REPLACE VIEW aktivasyon_hunisi WITH (security_invoker = on) AS
SELECT
  COUNT(*) AS toplam_isletme,
  COUNT(*) FILTER (WHERE has_hesap) AS hesap_ekleyen,
  COUNT(*) FILTER (WHERE has_islem) AS ilk_islem_giren,
  COUNT(*) FILTER (WHERE has_cari_personel) AS cari_personel_ekleyen,
  ROUND(100.0 * COUNT(*) FILTER (WHERE has_hesap) / NULLIF(COUNT(*), 0), 1) AS hesap_orani,
  ROUND(100.0 * COUNT(*) FILTER (WHERE has_islem) / NULLIF(COUNT(*), 0), 1) AS islem_orani,
  ROUND(100.0 * COUNT(*) FILTER (WHERE has_cari_personel) / NULLIF(COUNT(*), 0), 1) AS cari_personel_orani
FROM (
  SELECT i.id,
    EXISTS (SELECT 1 FROM hesaplar h WHERE h.isletme_id = i.id) AS has_hesap,
    EXISTS (SELECT 1 FROM islemler x WHERE x.isletme_id = i.id) AS has_islem,
    (EXISTS (SELECT 1 FROM cariler c WHERE c.isletme_id = i.id) OR EXISTS (SELECT 1 FROM personel p WHERE p.isletme_id = i.id)) AS has_cari_personel
  FROM isletmeler i
  WHERE NOT i.is_internal
) t;

CREATE OR REPLACE VIEW ozellik_penetrasyonu WITH (security_invoker = on) AS
SELECT
  COUNT(*) AS toplam_isletme,
  COUNT(*) FILTER (WHERE coklu_pb) AS coklu_para_birimi,
  COUNT(*) FILTER (WHERE multi_user) AS multi_user,
  COUNT(*) FILTER (WHERE cek_var) AS cek,
  COUNT(*) FILTER (WHERE urun_var) AS urun_stok,
  COUNT(*) FILTER (WHERE ileri_var) AS ileri_tarihli,
  COUNT(*) FILTER (WHERE not_var) AS notlar,
  ROUND(100.0 * COUNT(*) FILTER (WHERE coklu_pb)   / NULLIF(COUNT(*), 0), 1) AS coklu_pb_oran,
  ROUND(100.0 * COUNT(*) FILTER (WHERE multi_user) / NULLIF(COUNT(*), 0), 1) AS multi_user_oran,
  ROUND(100.0 * COUNT(*) FILTER (WHERE cek_var)    / NULLIF(COUNT(*), 0), 1) AS cek_oran,
  ROUND(100.0 * COUNT(*) FILTER (WHERE urun_var)   / NULLIF(COUNT(*), 0), 1) AS urun_stok_oran,
  ROUND(100.0 * COUNT(*) FILTER (WHERE ileri_var)  / NULLIF(COUNT(*), 0), 1) AS ileri_tarihli_oran,
  ROUND(100.0 * COUNT(*) FILTER (WHERE not_var)    / NULLIF(COUNT(*), 0), 1) AS notlar_oran
FROM (
  SELECT i.id,
    EXISTS (SELECT 1 FROM hesaplar h WHERE h.isletme_id = i.id AND h.currency <> 'TRY') AS coklu_pb,
    EXISTS (SELECT 1 FROM isletme_users u WHERE u.isletme_id = i.id AND u.status = 'active') AS multi_user,
    EXISTS (SELECT 1 FROM cekler c WHERE c.isletme_id = i.id) AS cek_var,
    EXISTS (SELECT 1 FROM urun_hareketler uh WHERE uh.isletme_id = i.id) AS urun_var,
    EXISTS (SELECT 1 FROM ileri_tarihli_islemler it WHERE it.isletme_id = i.id) AS ileri_var,
    EXISTS (SELECT 1 FROM notlar n WHERE n.isletme_id = i.id) AS not_var
  FROM isletmeler i
  WHERE NOT i.is_internal
) t;

CREATE OR REPLACE VIEW aktiflik_ozeti WITH (security_invoker = on) AS
SELECT
  COUNT(DISTINCT user_id) FILTER (WHERE opened_at::date = CURRENT_DATE) AS dau_bugun,
  COUNT(DISTINCT user_id) FILTER (WHERE opened_at >= NOW() - INTERVAL '1 day') AS dau,
  COUNT(DISTINCT user_id) FILTER (WHERE opened_at >= NOW() - INTERVAL '7 days') AS wau,
  COUNT(DISTINCT user_id) FILTER (WHERE opened_at >= NOW() - INTERVAL '30 days') AS mau,
  ROUND(100.0 * COUNT(DISTINCT user_id) FILTER (WHERE opened_at >= NOW() - INTERVAL '1 day')
    / NULLIF(COUNT(DISTINCT user_id) FILTER (WHERE opened_at >= NOW() - INTERVAL '30 days'), 0), 1) AS yapiskanlik_orani
FROM app_sessions
WHERE user_id NOT IN (SELECT user_id FROM isletmeler WHERE is_internal);

CREATE OR REPLACE VIEW kullanici_durumu WITH (security_invoker = on) AS
SELECT
  user_id,
  MIN(opened_at)::date AS ilk_giris,
  MAX(opened_at)::date AS son_giris,
  (CURRENT_DATE - MAX(opened_at)::date) AS gun_once,
  COUNT(*) AS toplam_giris,
  CASE WHEN MAX(opened_at) >= NOW() - INTERVAL '7 days' THEN 'aktif'
       WHEN MAX(opened_at) >= NOW() - INTERVAL '30 days' THEN 'uyuyan' ELSE 'churn' END AS durum
FROM app_sessions
WHERE user_id NOT IN (SELECT user_id FROM isletmeler WHERE is_internal)
GROUP BY user_id
ORDER BY son_giris DESC;

CREATE OR REPLACE VIEW kohort_retention WITH (security_invoker = on) AS
WITH ilk AS (
  SELECT user_id, MIN(opened_at::date) AS ilk_gun FROM app_sessions
  WHERE user_id NOT IN (SELECT user_id FROM isletmeler WHERE is_internal)
  GROUP BY user_id
),
gunler AS (
  SELECT DISTINCT user_id, opened_at::date AS gun FROM app_sessions
  WHERE user_id NOT IN (SELECT user_id FROM isletmeler WHERE is_internal)
),
agg AS (
  SELECT
    date_trunc('week', i.ilk_gun)::date AS kohort_hafta,
    COUNT(DISTINCT i.user_id) AS kullanici,
    COUNT(DISTINCT g.user_id) FILTER (WHERE g.gun = i.ilk_gun + 1) AS d1_raw,
    COUNT(DISTINCT g.user_id) FILTER (WHERE g.gun > i.ilk_gun AND g.gun <= i.ilk_gun + 7) AS d7_raw,
    COUNT(DISTINCT g.user_id) FILTER (WHERE g.gun > i.ilk_gun AND g.gun <= i.ilk_gun + 30) AS d30_raw
  FROM ilk i LEFT JOIN gunler g ON g.user_id = i.user_id
  GROUP BY date_trunc('week', i.ilk_gun)
)
SELECT
  kohort_hafta, kullanici,
  CASE WHEN CURRENT_DATE >= kohort_hafta + 7  THEN d1_raw  END AS d1,
  CASE WHEN CURRENT_DATE >= kohort_hafta + 13 THEN d7_raw  END AS d7,
  CASE WHEN CURRENT_DATE >= kohort_hafta + 36 THEN d30_raw END AS d30,
  CASE WHEN CURRENT_DATE >= kohort_hafta + 13 THEN ROUND(100.0 * d7_raw  / NULLIF(kullanici, 0), 1) END AS d7_oran,
  CASE WHEN CURRENT_DATE >= kohort_hafta + 36 THEN ROUND(100.0 * d30_raw / NULLIF(kullanici, 0), 1) END AS d30_oran
FROM agg
ORDER BY kohort_hafta DESC;

CREATE OR REPLACE VIEW platform_dagilimi WITH (security_invoker = on) AS
SELECT
  platform,
  COUNT(DISTINCT user_id) AS kullanici,
  COUNT(*) AS oturum,
  COUNT(DISTINCT user_id) FILTER (WHERE opened_at >= NOW() - INTERVAL '30 days') AS aktif_kullanici_30g
FROM app_sessions
WHERE user_id NOT IN (SELECT user_id FROM isletmeler WHERE is_internal)
GROUP BY platform
ORDER BY kullanici DESC;

CREATE OR REPLACE VIEW edge_fonksiyon_kullanimi WITH (security_invoker = on) AS
SELECT
  function_name AS fonksiyon,
  COUNT(*) AS cagri_sayisi,
  COUNT(DISTINCT user_id) AS kullanici_sayisi,
  MAX(called_at)::date AS son_cagri,
  COUNT(*) FILTER (WHERE called_at >= NOW() - INTERVAL '30 days') AS son_30g_cagri
FROM api_usage
WHERE user_id NOT IN (SELECT user_id FROM isletmeler WHERE is_internal)
GROUP BY function_name
ORDER BY cagri_sayisi DESC;

-- YENİ: buyume_trend — haftalık büyüme
CREATE OR REPLACE VIEW buyume_trend WITH (security_invoker = on) AS
WITH ilk_giris AS (
  SELECT user_id, date_trunc('week', MIN(opened_at))::date AS hafta
  FROM app_sessions
  WHERE user_id NOT IN (SELECT user_id FROM isletmeler WHERE is_internal)
  GROUP BY user_id
),
haftalar AS (
  SELECT generate_series(
    date_trunc('week', (SELECT MIN(created_at) FROM isletmeler WHERE NOT is_internal)),
    date_trunc('week', NOW()),
    INTERVAL '1 week'
  )::date AS hafta
)
SELECT
  h.hafta,
  (SELECT COUNT(*) FROM isletmeler i WHERE NOT i.is_internal AND date_trunc('week', i.created_at)::date = h.hafta) AS yeni_isletme,
  (SELECT COUNT(*) FROM ilk_giris ig WHERE ig.hafta = h.hafta) AS yeni_kullanici,
  (SELECT COUNT(DISTINCT x.isletme_id) FROM islemler x JOIN isletmeler i ON i.id = x.isletme_id
     WHERE NOT i.is_internal AND date_trunc('week', x.created_at)::date = h.hafta) AS aktif_isletme,
  (SELECT COUNT(*) FROM islemler x JOIN isletmeler i ON i.id = x.isletme_id
     WHERE NOT i.is_internal AND date_trunc('week', x.created_at)::date = h.hafta) AS islem_sayisi
FROM haftalar h
ORDER BY h.hafta DESC;

-- YENİ: kullanim_profili — işlem tipi dağılımı
CREATE OR REPLACE VIEW kullanim_profili WITH (security_invoker = on) AS
SELECT
  x.type AS islem_tipi,
  COUNT(*) AS islem_sayisi,
  COUNT(DISTINCT x.isletme_id) AS isletme_sayisi,
  ROUND(100.0 * COUNT(*) / NULLIF(
    (SELECT COUNT(*) FROM islemler y JOIN isletmeler j ON j.id = y.isletme_id WHERE NOT j.is_internal), 0), 1) AS oran
FROM islemler x
JOIN isletmeler i ON i.id = x.isletme_id
WHERE NOT i.is_internal
GROUP BY x.type
ORDER BY islem_sayisi DESC;
