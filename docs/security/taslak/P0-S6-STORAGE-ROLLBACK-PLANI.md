# P0-S6B Storage server faz-1 rollback test planı

Bu plan `20260729184053_harden_note_photo_storage_phase1.sql` canlıya alınmadan
önce ayrı Supabase test ortamında veya üretimde hiçbir gerçek kullanıcı kaydını
hedeflemeyen sentetik `BEGIN … ROLLBACK` preflight olarak çalıştırılmıştır.
Migration 29 Temmuz 2026'da canlıya uygulanmış; aynı davranış matrisi canlı
policy'ler üzerinde ikinci kez `BEGIN … ROLLBACK` içinde geçmiştir.

## Başlangıç ve bitiş snapshot’ı

- `storage.objects` tablo sahibi/RLS/kolon hash’i, beş mevcut policy’nin tam hash’i
  ve `islem-photos` bucket ayarları alınır.
- `islemler`, `notlar`, `storage.objects`, `isletmeler`, `isletme_users` ve testte
  kullanılan bütün bağlı tabloların satır sayısı ile sıralı row hash’i alınır.
- Mevcut 41 orphan yalnız salt-okunur sorguyla sayılır; hiçbir fixture onları
  güncellemez veya silmez.
- Test sonunda `ROLLBACK` yapılır. Başlangıç/bitiş satır sayısı ve row hash’lerinin
  tamamı birebir aynı olmalıdır.

## Sentetik kimlikler

Tek kullanımlık UUID’lerle, gerçek satırlara bağlanmayan şu profiller kurulur:

1. işletme sahibi;
2. Notes `view`;
3. Notes `add`;
4. Notes `edit_own`;
5. Notes `edit_all`;
6. Notes kapalı, yalnız Cariler açık;
7. askıya alınmış/removed üye;
8. başka tenant üyesi;
9. `anon`;
10. `service_role`/güvenilir server.

JWT bağlamı `request.jwt.claim.sub` ve `request.jwt.claims` ile her profil için
ayrı kurulur. Fonksiyonlara caller UID parametresi verilmediği ayrıca doğrulanır.

## Zorunlu davranış matrisi

### Kanonik parser

- `<tenant>/<islem>_<10..20 rakam>.webp` → `islem`;
- `<tenant>/notlar/<not>_<10..20 rakam>.webp` → `not`;
- traversal, fazla segment, büyük harfli/bozuk UUID, yanlış uzantı ve 9/21
  basamaklı timestamp → sıfır satır.

### INSERT

- owner/aktif üye + canonical işlem yolu + `owner_id=auth.uid()` → geçer;
- Notes `add` + canonical not yolu + `owner_id=auth.uid()` → geçer;
- Notes yalnız `view`, kapalı/removed üye, başka tenant, yanlış `owner_id`,
  malformed yol ve `anon` → reddedilir;
- başka bucket’taki mevcut permissive test satırı → bu restrictive zarf yüzünden
  reddedilmez;
- hem eski `not INSERT → upload → pointer UPDATE`, hem yeni `upload → aynı
  INSERT’te pointer` akışı gerçek `storage.objects INSERT ... RETURNING *`
  semantiğiyle geçer. INSERT policy kadar SELECT policy de yeni satırı görmelidir;
- cleanup helper, aynı komutta henüz kendi sorgu snapshot’ından görülemeyen yeni
  `storage.objects` satırını tekrar aramaz; policy’nin değerlendirdiği mevcut
  satırın `owner_id` kolonunu kullanır.

### UPDATE

- `islem-photos` içindeki her authenticated `storage.objects UPDATE` → reddedilir;
- başka bucket’taki mevcut permissive UPDATE → geçer;
- yeni ve eski uygulamanın `upsert:false` upload’ı Storage UPDATE gerektirmez;
  ancak API `INSERT ... RETURNING` çalıştırdığı için INSERT + SELECT policy
  bileşimi birlikte doğrulanır.

### Not SELECT

- P0-S9 RLS ile görünen ve aynı `photo_path`’e bağlı not → signed URL/SELECT geçer;
- `assigned_to_user` ile başka kullanıcıya daraltılmış, `own` filtresinden
  geçmeyen veya kaynak modülü kapalı not → reddedilir;
- Notes kapalı fakat P0-S9 sözleşmesine göre Cariler üzerinden görünür cari notu
  → geçer;
- pointer’ı kaldırılmış orphan not objesi → yalnız objeyi yükleyen aktif üye veya
  işletme sahibi için cleanup amacıyla görünür; başka shared kullanıcıya reddedilir;
- canonical işlem fotoğrafı → bu fazın note kapısından etkilenmez;
- malformed mevcut obje → fail-closed;
- başka bucket → etkilenmez.

### Not DELETE

- herhangi bir `notlar.photo_path` pointer’ı hâlâ objeyi gösteriyorsa uploader,
  owner ve `delete_all` dahil herkes için reddedilir;
- pointer/satır önce kaldırıldıktan sonra uploader → geçer;
- pointer kaldırıldıktan sonra işletme sahibi → geçer;
- pointer kaldırıldıktan sonra Notes `edit_own` kullanıcısı, obje kendi
  `owner_id` değerine aitse → geçer;
- Notes `edit_all`/`delete_all` shared kullanıcı peer notun DB pointer’ını veya
  satırını başarıyla güncelleyebilir/silebilir; fakat peer’in yüklediği orphan
  Storage objesini silemez. Cleanup best-effort reddedilir, DB işlemi geri
  alınmaz; orphan daha sonra uploader/işletme sahibi temizliğine kalabilir;
- authenticated kullanıcı cleanup helper’ını sahte `owner_id` parametresiyle
  doğrudan çağırsa bile bu yalnız DML yapmayan bir boolean hesaplar; `internal`
  Data API’de exposed değildir. Asıl Storage SELECT/DELETE policy testinde helper’a
  mevcut `storage.objects.owner_id` kolonu verildiği ve peer DELETE’in `0 satır`
  etkilediği ayrıca kanıtlanır;
- yalnız `view`, removed, başka tenant ve `anon` → reddedilir;
- canonical işlem fotoğrafı → mevcut transaction DELETE politikasında kalır;
- başka bucket → etkilenmez.

### Eski istemci yaşam döngüsü

- not oluştur: DB satırı → `upsert:false` upload → yalnız `photo_path` UPDATE;
- not fotoğraf değiştir: yeni upload → DB pointer → eski obje DELETE;
- not fotoğraf kaldır: DB pointer `NULL` → obje DELETE;
- not sil: DB not satırı DELETE → obje DELETE.

Her akışta Storage DELETE sırasında artık pointer bulunmadığı kanıtlanır. Ağ hatası
simülasyonunda pointer hâlâ duruyorsa obje DELETE’in reddedildiği ayrıca sınanır.
PostgreSQL DELETE’in SELECT görünürlüğü de istediği özel olarak sınanır: pointer
`NULL` olduktan sonra restrictive SELECT, yalnız
`storage_note_photo_delete_allowed_v1(name, owner_id)` true olan
uploader/işletme sahibi için
objeyi görünür kılmalı; aksi hâlde DELETE sessizce `0 satır` etkiler.

## PostgreSQL motor kanıtı

`P0-S6-STORAGE-PG15-17-RLS-DAVRANIS-TESTI.sql` aynı permissive `OR` +
restrictive `AND` kalıbını, bucket dışı `TRUE` dalını, UPDATE deny davranışını,
canonical owner INSERT zarfını ve parser gövdesini gerçek PostgreSQL 15 ile 17’de
çalıştırır. Kabul satırı:

`P0_S6_RESTRICTIVE_RLS_OK|<server version>`

Bu motor testi Supabase Storage API bütünleşim testinin yerine geçmez. Üretim
rollback matrisinde Supabase'in doğrudan tablo DELETE koruma trigger'ı için,
Storage API'nin kendi kullandığı oturum kapısı `storage.allow_delete_query=true`
yalnız test transaction'ında açıldı; RLS/policy değerlendirmesi bypass edilmedi.
Migration öncesi prova ve migration sonrası canlı policy smoke'u
`P0_S6B_RUNTIME_ROLLBACK_OK` sonucuyla geçti, ardından transaction geri alındı.
