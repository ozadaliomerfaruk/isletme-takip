-- Her gün gece 03:00'te (UTC) Edge Function'ı çağır
-- Clean/local databases must enable these extensions before cron.schedule is used.
-- Hosted projects where they are already enabled treat both statements as no-ops.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.schedule(
  'delete-scheduled-accounts-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ulohxpkhesxozwnlnonb.supabase.co/functions/v1/delete-scheduled-accounts',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
