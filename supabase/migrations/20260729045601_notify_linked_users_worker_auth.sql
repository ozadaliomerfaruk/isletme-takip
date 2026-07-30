-- Canli migration surumu: 20260729045601
-- P0-S5: notify-linked-users privileged side effects may originate only from
-- the database INSERT trigger. No business row/column is deleted or rewritten.
--
-- Environment credentials are intentionally NOT provisioned by this portable
-- schema migration. Each environment stores
-- `notify_linked_users_service_role_key` in Vault through the reviewed rollout
-- runbook. If the secret is absent or unreadable, notification delivery fails
-- closed while the financial INSERT still succeeds.

CREATE OR REPLACE FUNCTION public.notify_linked_users_on_islem_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_has_links boolean;
  v_service_role_key text;
BEGIN
  IF NEW.cari_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.cari_links AS cl
    WHERE cl.cari_id = NEW.cari_id
      AND (
        cl.owner_isletme_id = NEW.isletme_id
        OR cl.viewer_isletme_id = NEW.isletme_id
      )
  )
  INTO v_has_links;

  IF NOT v_has_links THEN
    RETURN NEW;
  END IF;

  SELECT ds.decrypted_secret
  INTO v_service_role_key
  FROM vault.decrypted_secrets AS ds
  WHERE ds.name = 'notify_linked_users_service_role_key'
  ORDER BY ds.created_at DESC
  LIMIT 1;

  IF v_service_role_key IS NULL OR v_service_role_key = '' THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://ulohxpkhesxozwnlnonb.supabase.co/functions/v1/notify-linked-users',
    headers := pg_catalog.jsonb_build_object(
      'Authorization', 'Bearer ' || v_service_role_key,
      'Content-Type', 'application/json'
    ),
    body := pg_catalog.jsonb_build_object(
      'record', pg_catalog.jsonb_build_object('id', NEW.id)
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- A notification/Vault/network failure must never roll back a financial INSERT.
    RETURN NEW;
END;
$function$;

ALTER FUNCTION public.notify_linked_users_on_islem_insert() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.notify_linked_users_on_islem_insert()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.notify_linked_users_on_islem_insert() IS
  'Non-blocking INSERT trigger: sends only the canonical transaction id to notify-linked-users using a Vault-held service-role credential.';
