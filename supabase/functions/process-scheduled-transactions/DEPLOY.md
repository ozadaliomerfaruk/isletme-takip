# İleri Tarihli İşlemler - Edge Function Deployment

## 1. Edge Function'ı Deploy Et

```bash
# Supabase CLI ile deploy
supabase functions deploy process-scheduled-transactions --project-ref YOUR_PROJECT_REF
```

## 2. Cron Job Ayarla

Supabase Dashboard > SQL Editor'da aşağıdaki SQL'i çalıştır:

```sql
-- pg_cron ve pg_net extension'larını kontrol et
-- Supabase Dashboard > Database > Extensions'dan aktif olduklarından emin ol

-- Mevcut job varsa sil
SELECT cron.unschedule('process-scheduled-transactions');

-- Günlük cron job oluştur (her gün 00:05 Türkiye saati = 21:05 UTC)
SELECT cron.schedule(
  'process-scheduled-transactions',
  '5 21 * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-scheduled-transactions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

**Değiştirmeniz gerekenler:**
- `YOUR_PROJECT_REF`: Supabase proje referansınız (örn: abcdefghijklmnop)
- `YOUR_SERVICE_ROLE_KEY`: Supabase service role key'iniz (Settings > API > service_role key)

## 3. Test Et

Manuel test için:

```bash
curl -X POST 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-scheduled-transactions' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json'
```

## 4. Logları Kontrol Et

Supabase Dashboard > Edge Functions > process-scheduled-transactions > Logs

## Cron Job Kontrol Komutları

```sql
-- Aktif cron job'ları listele
SELECT * FROM cron.job;

-- Job geçmişini gör
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```
