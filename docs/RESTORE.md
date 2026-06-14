# Yedekten Geri Yükleme Rehberi (defter-app)

> Yedek nasıl alınır: `scripts/backup-db.ps1` (veritabanı) + `scripts/backup-storage.mjs` (fotoğraflar).
> Yedekler `backups/<tarih>/` altında durur, **git'e girmez** (.gitignore). Bir kopyayı repo dışında tut.
> Proje FREE planda — Supabase otomatik yedeği YOK; bu yedekler tek güvence.

## Yedek içeriği

| Dosya | Ne | Geri yükleme aracı |
|---|---|---|
| `db/roles.sql` | Veritabanı rolleri | psql |
| `db/schema.sql` | Tüm şema (tablo/view/fonksiyon/trigger/RLS; public+auth+storage+cron) | psql |
| `db/data.sql` | Tüm veri — **auth.users (kullanıcı hesapları) dahil** | psql |
| `db/full.dump` | Aynı içeriğin pg_dump -Fc tek-dosya hali (çift güvence) | pg_restore |
| `storage/islem-photos/` | İşlem fotoğrafları (dosyaların kendisi) + `manifest.json` | scripts/restore-storage (aşağıda) |

Yedekte OLMAYANLAR (ayrıca not al / repo'da zaten var):
- Edge function **kodu** → repo `supabase/functions/` ✅
- Edge function **secrets** (GEMINI_API_KEY vb.) → Dashboard → Edge Functions → Secrets'tan elle not al
- Auth provider ayarları (Apple/Google client ID'leri, Apple secret JWT) → Dashboard'dan elle not al
- Storage bucket tanımı/policy'leri → `schema.sql` içinde (storage şeması dahil edildi) ✅

## Senaryo A — Aynı projeye geri dönüş (yanlış migration/veri kazası)

Küçük kazalarda önce `supabase/rollback/` altındaki ilgili down script'ini dene.
Tam geri dönüş gerekiyorsa (DİKKAT: mevcut veriyi ezer):

```powershell
$pg = "$env:TEMP\pgsql-extract\pgsql\bin"   # taşınabilir psql
$env:PGPASSWORD = "<db-parolası>"
$conn = @('-h','aws-1-eu-central-1.pooler.supabase.com','-p','5432','-U','postgres.ulohxpkhesxozwnlnonb','-d','postgres')

# Yalnızca veriyi geri yüklemek için (şema yerindeyse): önce tabloları boşalt, sonra:
& "$pg\psql.exe" @conn -f backups\<tarih>\db\data.sql
```

## Senaryo B — Sıfır/yeni Supabase projesine taşıma

1. Yeni proje oluştur, ref'ini al (`<YENİ_REF>`); bağlantı host'u dashboard'daki pooler adresi.
2. Sırayla:

```powershell
$pg = "$env:TEMP\pgsql-extract\pgsql\bin"
$env:PGPASSWORD = "<yeni-projenin-db-parolası>"
$conn = @('-h','<YENİ_POOLER_HOST>','-p','5432','-U','postgres.<YENİ_REF>','-d','postgres')

& "$pg\psql.exe" @conn -f backups\<tarih>\db\roles.sql
& "$pg\psql.exe" @conn -f backups\<tarih>\db\schema.sql
& "$pg\psql.exe" @conn -f backups\<tarih>\db\data.sql
```

   Alternatif (tek dosya): `& "$pg\pg_restore.exe" @conn --clean --if-exists backups\<tarih>\db\full.dump`

3. **Storage**: `storage.objects` satırlarını DB'den taşımak yerine dosyaları yeniden YÜKLE
   (yeni projenin service key'iyle; script: `scripts/backup-storage.mjs`'in tersi —
   her dosya için `POST /storage/v1/object/islem-photos/<path>`). Önce dashboard'dan
   `islem-photos` bucket'ını (private) oluştur.
4. Edge function'ları deploy et: `npx supabase functions deploy <isim>` (repo'dan).
5. Secrets + auth provider ayarlarını dashboard'dan elle gir.
6. Client `.env`'de URL/anon key'i yeni projeye çevir.

## Geri yükleme sonrası doğrulama

Satır sayılarını yedek günü kaydedilen baseline ile karşılaştır
(`backups/<tarih>/db/baseline-counts.json`):

```sql
select
  (select count(*) from isletmeler)  as isletmeler,
  (select count(*) from auth.users)  as auth_users,
  (select count(*) from islemler)    as islemler,
  (select count(*) from hesaplar)    as hesaplar,
  (select count(*) from cariler)     as cariler,
  (select count(*) from app_sessions) as sessions,
  (select count(*) from storage.objects where bucket_id = 'islem-photos') as foto;
```

> Test edilmemiş yedek, yedek değil umuttur: İlk fırsatta bir restore provası yap
> (Docker kurulu bir makinede `supabase start` ile lokal stack'e yükleyip
> yukarıdaki sayıları karşılaştırmak yeterli).
