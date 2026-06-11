-- notify-linked-users edge function'ı push token'ı açık kolon listesiyle sorguluyor:
--   select("user_id, token, locale")
-- ama locale kolonu hiç oluşturulmamıştı → PostgREST 42703 → data=null → her alıcı
-- "if (!pushTokenRecord) continue" ile atlanıyor ve bağlantılı cari bildirimleri
-- sessizce (HTTP 200 + sent:0) hiç gönderilmiyordu.
-- Kolon eklendiğinde mevcut satırlarda locale NULL kalır; edge function 'tr' varsayılanına düşer.
-- Client tarafı (src/lib/notifications.ts savePushToken) bundan sonra kullanıcı dilini yazar.
ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS locale text;
