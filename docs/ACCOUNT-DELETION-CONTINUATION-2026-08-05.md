# Hesap silme çalışması — devam notu (2026-08-05)

Bu çalışma kullanıcı isteğiyle durduruldu. Aşağıdaki durum canlı veride son kez
doğrulandıktan sonra **worker yeniden çalıştırılmadı**.

## Güvenli mevcut durum

- Hiçbir hesap silinmedi.
- Serkan İSLAM işi `pending`; Auth kullanıcısı ve işletmesi mevcut.
  - Başka işletme üyesi: `0`
  - Son silme tarihi sonrası kullanıcı aktivitesi: `false`
  - Son silme tarihi sonrası işletme aktivitesi: `false`
- MAKAS12 işi `pending`; Auth kullanıcısı ve işletmesi mevcut.
  - Başka işletme üyesi: `1`
  - Bu yüzden `ACCOUNT_DELETE_OTHER_BUSINESS_MEMBERS_PRESENT` çiti silmeyi
    reddediyor. Bu işletmeye veya üyeye dokunulmamalı.

## Doğrulanmış yedekler

Tam, filtresiz PostgreSQL yedeği:

- `backups/2026-08-05/db-complete/roles.sql`
- `backups/2026-08-05/db-complete/schema.sql`
- `backups/2026-08-05/db-complete/data.sql`
- `backups/2026-08-05/db-complete/full.dump`

Doğrulama:

- `pg_restore --list`: 1760 TOC girdisi
- `pg_restore --schema-only --file=/dev/null`: başarılı
- `pg_restore --data-only --file=/dev/null`: başarılı
- `public`, `auth`, `storage`, `internal`, cron nesneleri mevcut
- `auth.users`, `internal.account_deletion_jobs_v1`, `public.islemler` verileri
  mevcut
- `full.dump` SHA-256:
  `255C2E578FF244630A14A0B742C439FC7E6401E0988C8152092B25F8548DFCBB`

İkincil uygulama/Auth/Storage snapshot'ı:

- `backups/backup_2026-08-05T14-45-07`
- 112.548 satır, 969 Auth kullanıcısı, 367/367 Storage dosyası, 0 hata

Geçici `backups/supabase-db-password.xml` doğrulama sonrası silindi.

Not: `scripts/backup-db.ps1` halen yalnız `public/auth/storage/cron` alıyor ve
`internal` şemasını atlıyor. İleride "tam yedek" aracı olarak kullanılmadan önce
filtresiz tüm erişilebilir şemaları alacak şekilde düzeltilmeli.

## PROD'a uygulanmış migration'lar

1. `fix_scheduled_account_deletion_fk_blockers`
   - Yerel dosya:
     `supabase/migrations/20260805151532_fix_scheduled_account_deletion_fk_blockers.sql`
   - Yalnız aynı işletmedeki silinen kullanıcıya ait davet FK engellerini,
     mevcut pending/due/activity/Storage çitlerinin arkasında temizler.
   - İşletmede başka üye varsa silmeyi kesin olarak reddeder.
   - Kategori trigger'larının Auth `SET NULL` güncellemelerinde schema/search_path
     hatası vermesini engeller.

2. `fix_account_deletion_audit_actor_fk`
   - Yerel dosya:
     `supabase/migrations/20260805152136_fix_account_deletion_audit_actor_fk.sql`
   - `log_islem_changes()` içinde yalnız artık `auth.users` içinde bulunmayan
     audit aktörünü `NULL` yapar; aktif kullanıcı atfını korur.

3. `skip_islem_audit_on_business_cascade`
   - Yerel dosya:
     `supabase/migrations/20260805152430_skip_islem_audit_on_business_cascade.sql`
   - İlk işletme-varlığı temelli audit atlama denemesidir. PostgreSQL cascade
     sırası nedeniyle tek başına yeterli olmadığı görüldü; aşağıdaki migration
     bunu daha dar ve kesin sinyalle değiştirdi.

4. `scope_audit_skip_to_account_deletion`
   - Yerel dosya:
     `supabase/migrations/20260805152713_scope_audit_skip_to_account_deletion.sql`
   - Audit atlamayı yalnız aynı işletme için `pending` durable silme işi varken
     ve o işin Auth kullanıcısı silme transaction'ında artık görünmüyorken yapar.
   - Canlı `log_islem_changes()` içinde bu scoped guard ve önceki actor guard
     birlikte doğrulandı.

Migration listesinde ilk migration kaydı ve sonraki migration uygulamalarının
başarı yanıtları alındı. Canlı fonksiyon imza/owner/security/search_path
sözleşmeleri uygulama sonrası kontrol edildi.

## Worker denemeleri ve bulunan engeller

1. İlk deneme:
   - Serkan: `islem_audit_log_performed_by_fkey` hatası
   - MAKAS12: beklenen `ACCOUNT_DELETE_OTHER_BUSINESS_MEMBERS_PRESENT`

2. Actor FK düzeltmesinden sonraki deneme:
   - Serkan: `islem_audit_log_isletme_id_fkey` hatası
   - MAKAS12: beklenen güvenlik reddi

3. İşletme-varlığı guard'ından sonraki deneme:
   - Serkan: cascade görünürlük sırası nedeniyle yine
     `islem_audit_log_isletme_id_fkey`
   - MAKAS12: beklenen güvenlik reddi

4. Kesin `pending job + Auth user absent` guard'ı PROD'a uygulandı ve canlıda
   doğrulandı; **kullanıcı durdurduğu için bundan sonra worker çalıştırılmadı**.

Başarısız Auth silmeleri transaction olarak geri döndü; son canlı preflight'ta
iki Auth kullanıcısı ve iki işletme de hâlâ mevcuttu.

## Devam ederken yapılacaklar

1. Önce iki pending işi tekrar salt okunur sorgula; Serkan için `0` başka üye ve
   aktivite `false`, MAKAS12 için `1` başka üye koşullarını yeniden doğrula.
2. `delete-scheduled-accounts` worker'ını **bir kez** çalıştır.
3. Beklenen sonuç:
   - Serkan: `deleted`
   - MAKAS12: `ACCOUNT_DELETE_OTHER_BUSINESS_MEMBERS_PRESENT` ile korunmuş hata
4. Serkan silinirse şunları doğrula:
   - Auth kullanıcısı yok
   - işletmesi yok
   - o işletmeye bağlı işlemler yok
   - işi `completed`
5. MAKAS12 için Auth, işletme, üyelik, davet ve işlem verilerinin değişmediğini
   doğrula.
6. Serkan yine hata verirse yalnız son Auth/Postgres log satırını incele; worker'ı
   körlemesine tekrar tekrar çağırma.
7. Yerel son değişikliklerden sonra ana oturumda tam doğrulamayı yeniden çalıştır:
   TypeScript, ESLint, tüm Jest ve Metro iOS bundle. Şu an yalnız dört yeni hesap
   silme migration test dosyası birlikte çalıştırıldı: 4 suite / 19 test geçti.

## Eski client etkisi

1.5.x istemcilerin API imzaları, tablo/FK/RLS/trigger sözleşmeleri değişmedi.
Aktif kullanıcıların normal işlem audit davranışı korunuyor. Yalnız sunucuda
zaten süresi dolmuş ve güvenlik çitlerini geçen hesap silme işi etkileniyor.
