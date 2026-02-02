-- Her gün gece 03:00'te (UTC) Edge Function'ı çağır
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
