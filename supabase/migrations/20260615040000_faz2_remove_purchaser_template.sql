-- =============================================================================
-- Faz 2 — role_templates'ten 'purchaser' (Satın Almacı) şablonunu kaldır.
-- =============================================================================
-- Kod (RoleSelector) purchaser'ı zaten UI'dan filtreliyor; bu yalnızca DB temizliği.
-- role_templates'e referans veren FK YOK (doğrulandı) → silme güvenli.
--
-- NOT: role='purchaser' olan mevcut kullanıcı/davetler ETKİLENMEZ — 'role' bir metin
--   kolonu; şablon yalnızca davet oluştururken varsayılan izin kaynağıdır. O kayıtlar
--   kendi saklı permissions'larıyla çalışmaya devam eder. (Şu an: 1 purchaser kullanıcı
--   + 6 bekleyen purchaser daveti mevcut; bunların dönüşümü ayrı bir karar.)
-- =============================================================================

DELETE FROM role_templates WHERE name = 'purchaser';

-- GERİ ALMA: silinen şablon eski default_permissions'ıyla yeniden eklenmek istenirse
-- yedekten (backups/) geri yüklenebilir.
