-- Fix: inline CHECK constraint'in adı farklı olabilir
-- Tüm check constraint'leri kategoriler.type üzerinden kaldır ve yeniden oluştur

DO $$
DECLARE
  r RECORD;
BEGIN
  -- kategoriler tablosundaki tüm check constraint'leri bul ve sil
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'kategoriler'
      AND nsp.nspname = 'public'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%type%'
  LOOP
    EXECUTE format('ALTER TABLE kategoriler DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- Yeni constraint ekle: gelir, gider, urun
ALTER TABLE kategoriler
ADD CONSTRAINT kategoriler_type_check
CHECK (type IN ('gelir', 'gider', 'urun'));
