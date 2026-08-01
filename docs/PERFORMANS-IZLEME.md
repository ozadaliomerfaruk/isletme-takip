# Kaydetme ve personel detay performans izleme

Bu izleme, sahadaki gecikmeyi istemci aşamalarına ayırmak için kullanılır. Finansal
tutar, açıklama, kişi/hesap adı ve entity kimliği telemetriye yazılmaz. Kayıt ile
hemen ardından açılan personel detayı, yalnız bellekte tutulan rastgele bir
`trace_id` üzerinden ilişkilendirilir.

## Olaylar

### `save_submit_trace`

Gerçek bir yazma girişimi başladığında, başarılı veya hatalı olmasına bakılmadan
bir kez üretilir.

- `total_ms`: Kaydetme akışının kullanıcıya yansıyan toplam süresi.
- `preflight_ms`: Yazma çağrısından önceki doğrulama/hazırlık süresi.
- `write_chain_ms`: Yazma ile yazma sonucunun alınması arasındaki toplam süre.
- `write_rpc_ms`: Mutation/RPC beklemelerinin toplamı. Bu istemciden ölçülür;
  mobil ağ, TLS, Supabase gateway/auth ve PostgreSQL süresinin tamamını içerir.
- `photo_ms`, `photo_cleanup_ms`, `conversion_cleanup_rpc_ms`: Varsa yazma
  sonrasındaki ayrı adımlar.
- `recovery_probe_ms`: Cevabı kaybolmuş olabilecek kaydı doğrulama süresi.
- `settle_ms`: Yazma sonucu alındıktan sonra form kapatma, callback ve istemci
  yerleşme süresi.
- `write_path`, `outcome`, `error_kind`: Hangi kod yolu ve sonuç.
- `network_type`, `device_network`, `backend_reachability`, `app_state`,
  `ms_since_fg`, `native_build`: Ağ/uygulama bağlamı.

### `personel_detail_trace`

Personel detayının gereken ilk veri kümesi hazır olup bir sonraki çizim karesi
geldiğinde üretilir. `personel_ready_ms`, `transactions_ready_ms`,
`products_ready_ms`, `scheduled_ready_ms`, `notes_ready_ms` ve `leave_ready_ms`
hangi kaynağın beklettiğini gösterir. `render_settle_ms`, veri hazır olduktan
sonraki çizim maliyetidir. `initial_*_cache` alanları ekran açılırken ilgili
verinin diskte/bellekte hazır olup olmadığını gösterir.

Ana personel listesinden yapılan açılışlarda `navigation_to_mount_ms`, dokunma ile
detay component'inin çalışmaya başlaması arasındaki router/JS süresini;
`navigation_to_paint_ms` ise dokunmadan ilk hazır çizime kadar geçen uçtan uca
süreyi gösterir. Böylece sorgular hızlı olduğu hâlde navigasyonun takılması da
ölçüm dışında kalmaz.

Sekiz saniyede tamamlanmazsa `personel_detail_stall`, kullanıcı iki saniyeden
sonra sayfadan çıkarsa `personel_detail_abandoned` üretilir. Bu iki olayda
`pending_*` alanları hâlâ beklenen kaynağı gösterir.

## Yorumlama

- `write_rpc_ms` yüksek, aynı dönemde `pg_stat_statements` içindeki ilgili RPC
  düşükse gecikme PostgreSQL sorgusundan önce/sonradır: mobil ağ, bağlantı
  kurulumu, Supabase gateway veya auth beklemesi.
- `write_rpc_ms` ve PostgreSQL çalışma süresi birlikte yüksekse RPC/indeks/sorgu
  planı incelenir.
- `photo_ms` yüksekse Storage; `recovery_probe_ms` yüksekse cevap kaybı veya
  kararsız ağ; `settle_ms` yüksekse istemci cache invalidation/render yolu öne
  çıkar.
- Personel detayında en yüksek `*_ready_ms` bekleten sorgudur. Tüm hazır olma
  süreleri düşük fakat `render_settle_ms` yüksekse sorun ağ değil çizim/JS
  yüküdür.
- `initial_personel_cache=false` ve `personel_ready_ms` yüksek olduğunda tam
  ekran yükleme doğrudan personel ana satırını bekliyordur.

## Supabase analiz sorguları

Yeni build'in veri üretmeye başladığını doğrulama:

```sql
select
  event_name,
  meta->>'native_build' as native_build,
  count(*) as olay,
  min(created_at) as ilk,
  max(created_at) as son
from public.app_events
where created_at >= now() - interval '7 days'
  and event_name in (
    'save_submit_trace',
    'personel_detail_trace',
    'personel_detail_stall',
    'personel_detail_abandoned'
  )
group by 1, 2
order by son desc;
```

Kaydetme dağılımı (build, ağ ve yazma yolu):

```sql
select
  date_trunc('day', created_at) as gun,
  coalesce(meta->>'native_build', app_version, '?') as build,
  coalesce(meta->>'network_type', '?') as ag,
  coalesce(meta->>'write_path', '?') as yol,
  coalesce(meta->>'outcome', '?') as sonuc,
  count(*) as adet,
  round((percentile_cont(.50) within group
    (order by (meta->>'total_ms')::numeric))::numeric) as p50_ms,
  round((percentile_cont(.95) within group
    (order by (meta->>'total_ms')::numeric))::numeric) as p95_ms,
  max((meta->>'total_ms')::numeric) as max_ms
from public.app_events
where created_at >= now() - interval '60 days'
  and event_name = 'save_submit_trace'
  and jsonb_typeof(meta->'total_ms') = 'number'
group by 1, 2, 3, 4, 5
order by gun desc, p95_ms desc;
```

Kaydetmede hangi fazın baskın olduğunu görme:

```sql
select
  coalesce(meta->>'native_build', app_version, '?') as build,
  coalesce(meta->>'network_type', '?') as ag,
  count(*) as adet,
  round(avg((meta->>'total_ms')::numeric)) as toplam_ort_ms,
  round(avg(coalesce((meta->>'preflight_ms')::numeric, 0))) as preflight_ort_ms,
  round(avg(coalesce((meta->>'write_rpc_ms')::numeric, 0))) as rpc_ort_ms,
  round(avg(coalesce((meta->>'photo_ms')::numeric, 0))) as fotograf_ort_ms,
  round(avg(coalesce((meta->>'recovery_probe_ms')::numeric, 0))) as probe_ort_ms,
  round(avg(coalesce((meta->>'settle_ms')::numeric, 0))) as settle_ort_ms
from public.app_events
where created_at >= now() - interval '60 days'
  and event_name = 'save_submit_trace'
group by 1, 2
order by toplam_ort_ms desc;
```

Personel detayında bekleten kaynağı görme:

```sql
select
  coalesce(meta->>'native_build', app_version, '?') as build,
  coalesce(meta->>'network_type', '?') as ag,
  count(*) as adet,
  round((percentile_cont(.95) within group
    (order by (meta->>'total_ms')::numeric))::numeric) as toplam_p95_ms,
  round(avg(coalesce((meta->>'navigation_to_mount_ms')::numeric, 0))) as navigasyon_ort_ms,
  round(avg(coalesce((meta->>'personel_ready_ms')::numeric, 0))) as personel_ort_ms,
  round(avg(coalesce((meta->>'transactions_ready_ms')::numeric, 0))) as islemler_ort_ms,
  round(avg(coalesce((meta->>'products_ready_ms')::numeric, 0))) as urunler_ort_ms,
  round(avg(coalesce((meta->>'scheduled_ready_ms')::numeric, 0))) as ileri_ort_ms,
  round(avg(coalesce((meta->>'notes_ready_ms')::numeric, 0))) as notlar_ort_ms,
  round(avg(coalesce((meta->>'leave_ready_ms')::numeric, 0))) as izin_ort_ms,
  round(avg(coalesce((meta->>'render_settle_ms')::numeric, 0))) as render_ort_ms
from public.app_events
where created_at >= now() - interval '60 days'
  and event_name = 'personel_detail_trace'
  and jsonb_typeof(meta->'total_ms') = 'number'
group by 1, 2
order by toplam_p95_ms desc;
```

Kaydetme ile hemen sonraki personel detayını aynı anonim iz üzerinde inceleme:

```sql
select
  s.created_at as kaydetme_zamani,
  s.meta->>'network_type' as ag,
  s.meta->>'write_path' as yazma_yolu,
  (s.meta->>'total_ms')::numeric as kaydetme_ms,
  (s.meta->>'write_rpc_ms')::numeric as yazma_rpc_ms,
  (d.meta->>'ms_since_save')::numeric as detay_acma_araligi_ms,
  (d.meta->>'total_ms')::numeric as detay_ms,
  d.meta->>'personel_ready_ms' as personel_ms,
  d.meta->>'transactions_ready_ms' as islemler_ms,
  d.meta->>'products_ready_ms' as urunler_ms
from public.app_events s
join public.app_events d
  on d.event_name = 'personel_detail_trace'
 and d.meta->>'source_save_trace_id' = s.meta->>'trace_id'
where s.created_at >= now() - interval '60 days'
  and s.event_name = 'save_submit_trace'
order by s.created_at desc;
```

Ham `app_events` kayıtları 90 gün tutulur; bu nedenle bir-iki aylık faz analizi
için mevcut retention yeterlidir. Günlük kalıcı özet yalnız olay adetlerini tutar,
faz ayrıntıları için değerlendirme 90 gün dolmadan yapılmalıdır.
