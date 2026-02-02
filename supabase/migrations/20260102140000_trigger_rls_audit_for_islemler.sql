 -- Trigger kontrolü
 SELECT tgname, tgrelid::regclass, tgenabled
 FROM pg_trigger
 WHERE tgrelid = 'islemler'::regclass;

 -- RLS policy kontrolü
 SELECT * FROM pg_policies WHERE tablename = 'islemler';

 -- Son insert'leri kontrol et
 SELECT id, date, amount, created_at
 FROM islemler
 ORDER BY created_at DESC
 LIMIT 10;