-- =============================================================================
-- ACİL FIX — notify_linked_users_on_islem_insert işlemleri bloklamasın
--
-- Sorun: Bağlantılı (cari_links) bir cari'ye işlem eklenince, AFTER INSERT
-- trigger'ı edge function'ı çağırmak için current_setting('app.settings.service_role_key')
-- okuyor. Bu GUC tanımlı DEĞİL → current_setting hata fırlatıyor → AFTER trigger
-- hatası tüm INSERT'i geri alıyor → kullanıcı "İşlem gerçekleştirilemedi" görüyor.
-- (Owner dahil herkes, linkli cari'ye işlem yapamıyor — RLS/yetki sorunu DEĞİL.)
--
-- Çözüm: Bildirim TAMAMEN best-effort olsun:
--   1) GUC yoksa/boşsa → bildirimi atla, işlemi tamamla.
--   2) net.http_post veya başka her hata → yut (EXCEPTION WHEN OTHERS), işlemi tamamla.
-- Bildirim, app.settings.service_role_key ayarlanınca yeniden çalışır.
-- SECURITY DEFINER + search_path=public KORUNUR.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notify_linked_users_on_islem_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _has_links BOOLEAN;
  _key text;
BEGIN
  -- cari_id yoksa hiçbir şey yapma
  IF NEW.cari_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Bu cari'nin bağlantısı var mı?
  SELECT EXISTS(SELECT 1 FROM cari_links WHERE cari_id = NEW.cari_id) INTO _has_links;
  IF NOT _has_links THEN
    RETURN NEW;
  END IF;

  -- Konfig yoksa bildirimi atla — çekirdek işlemi ASLA bloklama
  _key := current_setting('app.settings.service_role_key', true);
  IF _key IS NULL OR _key = '' THEN
    RETURN NEW;
  END IF;

  -- Bildirim best-effort: herhangi bir hata işlemi bozmasın (fire & forget)
  BEGIN
    PERFORM net.http_post(
      url := 'https://ulohxpkhesxozwnlnonb.supabase.co/functions/v1/notify-linked-users',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || _key,
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
  EXCEPTION WHEN OTHERS THEN
    -- bildirim başarısız olsa da işlem kaydı tamamlanır
    NULL;
  END;

  RETURN NEW;
END;
$$;
