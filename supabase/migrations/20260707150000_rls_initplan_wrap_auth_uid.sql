-- PERFORMANS (A-1): RLS politikalarindaki auth.uid() cagrisini (select auth.uid())
-- ile sar (initplan optimizasyonu) — buyuk veride her-satir yeniden degerlendirmeyi
-- onler.
--
-- DURUM: Bu optimizasyon URETIMDE ZATEN CANLI (MCP ile uygulanmis; 108 policy'nin
-- 103'u wrapped, 0 bare). ANCAK repo migration'larinda karsiligi YOKTU -> repo<->prod
-- drift + `supabase db reset` optimizasyonu kaybeder. Bu migration drift'i kapatir.
--
-- IDEMPOTENT + PROD'DA NO-OP: Her public policy icin, "sarmalanmis ( SELECT auth.uid()
-- AS uid) formlarini metinden cikardiktan sonra geriye BARE auth.uid() kaliyor mu?"
-- diye bakar; yalniz kalan (henuz sarilmamis) policy'leri ALTER eder. Uretimde bare
-- policy OLMADIGI icin (dogrulandi: 0) hicbir policy degismez; taze bir DB'de (reset)
-- ise cıplak policy'ler sarilir. Cift-sarma olmaz.

DO $mig$
DECLARE
  r record;
  v_new_qual text;
  v_new_check text;
  v_needs boolean;
  v_strip constant text := '\(\s*select\s+auth\.uid\(\)(\s+as\s+[a-z_]+)?\s*\)';
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    v_needs := false;
    v_new_qual := r.qual;
    v_new_check := r.with_check;

    IF r.qual IS NOT NULL
       AND regexp_replace(r.qual, v_strip, '', 'gi') ~ 'auth\.uid\(\)' THEN
      v_new_qual := regexp_replace(r.qual, 'auth\.uid\(\)', '(select auth.uid())', 'g');
      v_needs := true;
    END IF;

    IF r.with_check IS NOT NULL
       AND regexp_replace(r.with_check, v_strip, '', 'gi') ~ 'auth\.uid\(\)' THEN
      v_new_check := regexp_replace(r.with_check, 'auth\.uid\(\)', '(select auth.uid())', 'g');
      v_needs := true;
    END IF;

    CONTINUE WHEN NOT v_needs;

    IF r.qual IS NOT NULL AND r.with_check IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s) WITH CHECK (%s)',
                     r.policyname, r.schemaname, r.tablename, v_new_qual, v_new_check);
    ELSIF r.qual IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)',
                     r.policyname, r.schemaname, r.tablename, v_new_qual);
    ELSE
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)',
                     r.policyname, r.schemaname, r.tablename, v_new_check);
    END IF;

    RAISE NOTICE 'RLS initplan wrap uygulandi: %.%', r.tablename, r.policyname;
  END LOOP;
END
$mig$;
