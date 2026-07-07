-- GUVENLIK (savunma-derinligi): get_account_report ve get_balance_activity_report
-- fonksiyonlarindan PUBLIC + anon EXECUTE grant'ini kaldir.
--
-- Ikisi de govde-guard'li (get_account_report yetkisizde bos doner,
-- get_balance_activity_report exception atar) -> su an sizinti YOK. Ancak ACL'de
-- PUBLIC (=X) ve anon=X grant'i vardi; tek koruma govde guard'i olmasin diye
-- (bir CREATE OR REPLACE guard'i silerse dogrudan anon-erisimli finansal sizinti
-- olurdu) anon/PUBLIC EXECUTE revoke edilir. authenticated erisimi korunur.
--
-- ETKI: YOK. Yayinlanan client'lar authenticated rolu ile cagirir. Guard zaten
-- var -> sifir kirilma riski. Salt grant degisikligi; veri/tablo degismez.

REVOKE EXECUTE ON FUNCTION public.get_account_report(uuid, text[], timestamptz, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_account_report(uuid, text[], timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_account_report(uuid, text[], timestamptz, timestamptz) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_balance_activity_report(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_balance_activity_report(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_balance_activity_report(uuid) TO authenticated;
