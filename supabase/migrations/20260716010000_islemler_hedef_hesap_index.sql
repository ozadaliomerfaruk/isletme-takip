-- Gelen transferlerin (hedef_hesap_id) sorgu deseni icin composite index.
--
-- islemler.hedef_hesap_id FK'si index'siz idi (performans advisor: unindexed_foreign_keys).
-- Hesap-detay listesi .or(hesap_id.eq.X, hedef_hesap_id.eq.X) sorgusunda, bir hesabin GELEN
-- transferleri seyrek/eski oldugunda (hesap_id, date DESC) index'i filtreyi geriye dogru
-- uzun tariyordu. Bu index onu (hesap_id, date DESC) ile SIMETRIK kapatir.
--
-- Partial (yalniz hedef_hesap_id IS NOT NULL): 64k satirin ~%2'si transfer -> kucuk, hedefli.
-- ADDITIVE: yalniz okuma hizlanir; yazma tarafinda tek transfer basina 1 index bakimi.
CREATE INDEX IF NOT EXISTS idx_islemler_hedef_hesap_date
  ON public.islemler (hedef_hesap_id, date DESC)
  WHERE hedef_hesap_id IS NOT NULL;
