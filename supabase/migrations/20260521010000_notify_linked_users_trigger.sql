-- İşlem INSERT'lerinde bağlantılı cari varsa notify-linked-users edge function'ını çağır.
-- Client tarafından çağırmak yerine DB trigger kullanarak edge function invocation sayısını azaltır.
-- Sadece cari_id olan INSERT'lerde ve cari_links'te eşleşme varsa tetiklenir.

CREATE OR REPLACE FUNCTION notify_linked_users_on_islem_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _has_links BOOLEAN;
BEGIN
  -- cari_id yoksa hiçbir şey yapma
  IF NEW.cari_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Bu cari'nin bağlantısı var mı kontrol et
  SELECT EXISTS(SELECT 1 FROM cari_links WHERE cari_id = NEW.cari_id) INTO _has_links;

  IF NOT _has_links THEN
    RETURN NEW;
  END IF;

  -- Edge function'ı çağır (fire & forget)
  PERFORM net.http_post(
    url := 'https://ulohxpkhesxozwnlnonb.supabase.co/functions/v1/notify-linked-users',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'record', jsonb_build_object(
        'id', NEW.id,
        'cari_id', NEW.cari_id,
        'type', NEW.type,
        'amount', NEW.amount,
        'description', NEW.description,
        'isletme_id', NEW.isletme_id
      ),
      'type', 'INSERT'
    )
  );

  RETURN NEW;
END;
$$;

-- Trigger: sadece INSERT'lerde çalışır
CREATE TRIGGER trg_notify_linked_users_on_islem_insert
  AFTER INSERT ON islemler
  FOR EACH ROW
  EXECUTE FUNCTION notify_linked_users_on_islem_insert();
