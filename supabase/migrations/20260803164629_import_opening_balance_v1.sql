-- Import opening-balance safety.
--
-- ADDITIVE: yeni RPC disinda sema/veri degisikligi yoktur; backfill yapmaz.
-- 1.5.x ETKISI: YOK. Eski istemciler mevcut direct-table/increment_balance
-- yollarini kullanmaya devam eder. Yeni istemci kur-dogru ve kilitli RPC'yi kullanir.
--
-- Amaç:
-- * hesap/cari/personel acilis bakiyesini entity satiri kilitliyken uygulamak,
-- * cari/personel mevcut islem etkisini source/target/exchange_rate ile hesaplamak,
-- * ayni tutarla kayip HTTP cevabi sonrasi tekrar cagrida no-op/idempotent olmak,
-- * otomatik importta mevcut acilis bakiyesini ezmemek; manuel duzeltmede ise
--   yalniz fark kadar atomik delta uygulamak.

CREATE FUNCTION public.apply_import_opening_balance_v1(
  p_isletme_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_amount numeric,
  p_replace_existing boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_balance numeric := 0;
  v_tx_effect numeric := 0;
  v_existing_initial numeric := 0;
  v_delta numeric := 0;
BEGIN
  IF auth.uid() IS NULL
     OR p_isletme_id IS NULL
     OR p_entity_id IS NULL
     OR p_entity_type NOT IN ('hesap', 'cari', 'personel')
     OR p_amount IS NULL
     OR p_amount = 'NaN'::numeric
     OR p_amount = 'Infinity'::numeric
     OR p_amount = '-Infinity'::numeric THEN
    RAISE EXCEPTION 'IMPORT_OPENING_BALANCE_INVALID_INPUT_OR_ACCESS'
      USING ERRCODE = '42501';
  END IF;

  -- Tum finansal V2 motorlariyla ayni ilk kilit: tenant. Yalniz owner import eder.
  PERFORM business.id
  FROM public.isletmeler AS business
  WHERE business.id = p_isletme_id
    AND business.user_id = auth.uid()
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'IMPORT_OPENING_BALANCE_INVALID_INPUT_OR_ACCESS'
      USING ERRCODE = '42501';
  END IF;

  IF p_entity_type = 'hesap' THEN
    SELECT
      COALESCE(account.balance, 0),
      COALESCE(account.initial_balance, 0)
    INTO v_balance, v_existing_initial
    FROM public.hesaplar AS account
    WHERE account.id = p_entity_id
      AND account.isletme_id = p_isletme_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'IMPORT_OPENING_BALANCE_ENTITY_NOT_FOUND'
        USING ERRCODE = '23503';
    END IF;

  ELSIF p_entity_type = 'cari' THEN
    SELECT COALESCE(customer.balance, 0)
    INTO v_balance
    FROM public.cariler AS customer
    WHERE customer.id = p_entity_id
      AND customer.isletme_id = p_isletme_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'IMPORT_OPENING_BALANCE_ENTITY_NOT_FOUND'
        USING ERRCODE = '23503';
    END IF;

    SELECT COALESCE(
      pg_catalog.sum(
        CASE transaction_row.type::text
          WHEN 'cari_alis' THEN -transaction_row.amount
          WHEN 'cari_satis' THEN transaction_row.amount
          WHEN 'cari_alis_iade' THEN transaction_row.amount
          WHEN 'cari_satis_iade' THEN -transaction_row.amount
          WHEN 'cari_odeme' THEN
            CASE
              WHEN transaction_row.source_currency IS NOT NULL
                   AND transaction_row.target_currency IS NOT NULL
                   AND transaction_row.source_currency
                       <> transaction_row.target_currency
                   AND transaction_row.exchange_rate IS NOT NULL
                   AND transaction_row.exchange_rate > 0 THEN
                CASE
                  WHEN transaction_row.source_currency = 'TRY'
                    THEN transaction_row.amount / transaction_row.exchange_rate
                  ELSE transaction_row.amount * transaction_row.exchange_rate
                END
              ELSE transaction_row.amount
            END
          WHEN 'cari_tahsilat' THEN
            -(CASE
              WHEN transaction_row.source_currency IS NOT NULL
                   AND transaction_row.target_currency IS NOT NULL
                   AND transaction_row.source_currency
                       <> transaction_row.target_currency
                   AND transaction_row.exchange_rate IS NOT NULL
                   AND transaction_row.exchange_rate > 0 THEN
                CASE
                  WHEN transaction_row.source_currency = 'TRY'
                    THEN transaction_row.amount / transaction_row.exchange_rate
                  ELSE transaction_row.amount * transaction_row.exchange_rate
                END
              ELSE transaction_row.amount
            END)
          ELSE 0
        END
      ),
      0
    )
    INTO v_tx_effect
    FROM public.islemler AS transaction_row
    WHERE transaction_row.isletme_id = p_isletme_id
      AND transaction_row.cari_id = p_entity_id;

    v_existing_initial := v_balance - v_tx_effect;

  ELSE
    SELECT COALESCE(employee.balance, 0)
    INTO v_balance
    FROM public.personel AS employee
    WHERE employee.id = p_entity_id
      AND employee.isletme_id = p_isletme_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'IMPORT_OPENING_BALANCE_ENTITY_NOT_FOUND'
        USING ERRCODE = '23503';
    END IF;

    SELECT COALESCE(
      pg_catalog.sum(
        CASE transaction_row.type::text
          WHEN 'personel_gider' THEN -transaction_row.amount
          WHEN 'personel_satis' THEN transaction_row.amount
          WHEN 'personel_odeme' THEN
            CASE
              WHEN transaction_row.source_currency IS NOT NULL
                   AND transaction_row.target_currency IS NOT NULL
                   AND transaction_row.source_currency
                       <> transaction_row.target_currency
                   AND transaction_row.exchange_rate IS NOT NULL
                   AND transaction_row.exchange_rate > 0 THEN
                CASE
                  WHEN transaction_row.source_currency = 'TRY'
                    THEN transaction_row.amount / transaction_row.exchange_rate
                  ELSE transaction_row.amount * transaction_row.exchange_rate
                END
              ELSE transaction_row.amount
            END
          WHEN 'personel_tahsilat' THEN
            -(CASE
              WHEN transaction_row.source_currency IS NOT NULL
                   AND transaction_row.target_currency IS NOT NULL
                   AND transaction_row.source_currency
                       <> transaction_row.target_currency
                   AND transaction_row.exchange_rate IS NOT NULL
                   AND transaction_row.exchange_rate > 0 THEN
                CASE
                  WHEN transaction_row.source_currency = 'TRY'
                    THEN transaction_row.amount / transaction_row.exchange_rate
                  ELSE transaction_row.amount * transaction_row.exchange_rate
                END
              ELSE transaction_row.amount
            END)
          ELSE 0
        END
      ),
      0
    )
    INTO v_tx_effect
    FROM public.islemler AS transaction_row
    WHERE transaction_row.isletme_id = p_isletme_id
      AND transaction_row.personel_id = p_entity_id;

    v_existing_initial := v_balance - v_tx_effect;
  END IF;

  -- Kayip HTTP cevabindan sonra ayni payload tekrar gelirse ikinci delta yazma.
  IF pg_catalog.abs(v_existing_initial - p_amount) <= 0.009 THEN
    RETURN pg_catalog.jsonb_build_object(
      'applied', true,
      'changed', false,
      'existing_initial_balance', v_existing_initial
    );
  END IF;

  IF p_replace_existing IS NOT TRUE
     AND pg_catalog.abs(v_existing_initial) > 0.009 THEN
    RETURN pg_catalog.jsonb_build_object(
      'applied', false,
      'changed', false,
      'existing_initial_balance', v_existing_initial
    );
  END IF;

  v_delta := p_amount - v_existing_initial;

  IF p_entity_type = 'hesap' THEN
    UPDATE public.hesaplar AS account
    SET balance = COALESCE(account.balance, 0) + v_delta,
        initial_balance = p_amount,
        updated_at = pg_catalog.clock_timestamp()
    WHERE account.id = p_entity_id
      AND account.isletme_id = p_isletme_id;
  ELSIF p_entity_type = 'cari' THEN
    UPDATE public.cariler AS customer
    SET balance = COALESCE(customer.balance, 0) + v_delta,
        updated_at = pg_catalog.clock_timestamp()
    WHERE customer.id = p_entity_id
      AND customer.isletme_id = p_isletme_id;
  ELSE
    UPDATE public.personel AS employee
    SET balance = COALESCE(employee.balance, 0) + v_delta,
        updated_at = pg_catalog.clock_timestamp()
    WHERE employee.id = p_entity_id
      AND employee.isletme_id = p_isletme_id;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'IMPORT_OPENING_BALANCE_UPDATE_MISSING'
      USING ERRCODE = '55000';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'applied', true,
    'changed', true,
    'existing_initial_balance', v_existing_initial
  );
END;
$function$;

ALTER FUNCTION public.apply_import_opening_balance_v1(
  uuid, text, uuid, numeric, boolean
) OWNER TO postgres;
REVOKE ALL
ON FUNCTION public.apply_import_opening_balance_v1(
  uuid, text, uuid, numeric, boolean
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
ON FUNCTION public.apply_import_opening_balance_v1(
  uuid, text, uuid, numeric, boolean
)
TO authenticated;
