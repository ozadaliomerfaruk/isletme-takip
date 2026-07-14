-- =============================================================================
-- Varsayılan kategoriler v2 — zengin standart set (kullanıcının kendi kategorileri)
--
-- Kullanıcı isteği: bundan sonra AÇILACAK bütün işletmelere bu standart gider
-- kategorilerini (bir kısmı alt-kategorili) aç. GELİR kategorileri değişmedi.
--
-- KAPSAM / GÜVENLİK:
-- * Yalnızca create_default_kategoriler() trigger fonksiyonu değişir → SADECE
--   yeni işletmeleri etkiler. MEVCUT işletmelere/kategorilere DOKUNULMAZ
--   (backfill yok — kullanıcı "hali hazırdakilere eklemeye gerek yok" dedi).
-- * Otomatik "Kasa" hesabı (onboarding v15) KORUNDU — düşürülmedi.
-- * İsimler Title Case saklanır; uygulamanın görünüm katmanı gelir/gider
--   kategorilerini ekranda BÜYÜK harf gösterir (Türkçe-doğru upperTr). Title Case
--   saklamak, add_sector_kategoriler()'in lower() ile yaptığı kopya-önleme
--   kontrolünü sektör kategorileriyle güvenli tutar (ör. kafe "Gıda Malzemesi").
-- =============================================================================

CREATE OR REPLACE FUNCTION create_default_kategoriler()
RETURNS TRIGGER AS $$
DECLARE
  v_faturalar_id uuid;
  v_personel_id uuid;
BEGIN
  -- Gelir kategorileri (DEĞİŞMEDİ)
  INSERT INTO kategoriler (isletme_id, name, type, icon, color) VALUES
    (NEW.id, 'Satış', 'gelir', 'shopping-cart', '#10B981'),
    (NEW.id, 'Hizmet', 'gelir', 'briefcase', '#3B82F6'),
    (NEW.id, 'Diğer Gelir', 'gelir', 'plus-circle', '#8B5CF6');

  -- Gider kategorileri — yeni standart set (düz olanlar)
  INSERT INTO kategoriler (isletme_id, name, type, icon, color) VALUES
    (NEW.id, 'Komisyonlar', 'gider', 'percent', '#F59E0B'),
    (NEW.id, 'Diğer İşletme Giderleri', 'gider', 'minus-circle', '#6B7280'),
    (NEW.id, 'Ekipman Giderleri', 'gider', 'wrench', '#14B8A6'),
    (NEW.id, 'İşyeri Bakım Onarım', 'gider', 'hammer', '#EC4899'),
    (NEW.id, 'Gıda Malzemesi', 'gider', 'shopping-basket', '#EF4444'),
    (NEW.id, 'Kira', 'gider', 'home', '#F97316'),
    (NEW.id, 'Reklam/Pazarlama', 'gider', 'megaphone', '#8B5CF6'),
    (NEW.id, 'Tedarikçi', 'gider', 'handshake', '#0EA5E9'),
    (NEW.id, 'Ulaşım/Araba', 'gider', 'car', '#0D9488'),
    (NEW.id, 'Vergi', 'gider', 'landmark', '#DC2626'),
    (NEW.id, 'Yatırım', 'gider', 'chart-line', '#10B981');

  -- Faturalar (üst kategori + alt kategoriler: aidat, elektrik, internet, doğalgaz, su, telefon)
  INSERT INTO kategoriler (isletme_id, name, type, icon, color)
  VALUES (NEW.id, 'Faturalar', 'gider', 'file-text', '#6366F1')
  RETURNING id INTO v_faturalar_id;

  INSERT INTO kategoriler (isletme_id, name, type, icon, color, parent_id) VALUES
    (NEW.id, 'Aidat',    'gider', 'building-2', '#6366F1', v_faturalar_id),
    (NEW.id, 'Elektrik', 'gider', 'zap',        '#6366F1', v_faturalar_id),
    (NEW.id, 'İnternet', 'gider', 'wifi',       '#6366F1', v_faturalar_id),
    (NEW.id, 'Doğalgaz', 'gider', 'flame',      '#6366F1', v_faturalar_id),
    (NEW.id, 'Su',       'gider', 'droplet',    '#6366F1', v_faturalar_id),
    (NEW.id, 'Telefon',  'gider', 'phone',      '#6366F1', v_faturalar_id);

  -- Personel (üst kategori + alt kategoriler: maaş, mesai, prim, tazminat, SGK, diğer)
  INSERT INTO kategoriler (isletme_id, name, type, icon, color)
  VALUES (NEW.id, 'Personel', 'gider', 'users', '#F59E0B')
  RETURNING id INTO v_personel_id;

  INSERT INTO kategoriler (isletme_id, name, type, icon, color, parent_id) VALUES
    (NEW.id, 'Maaş',     'gider', 'hand-coins',     '#F59E0B', v_personel_id),
    (NEW.id, 'Mesai',    'gider', 'clock',          '#F59E0B', v_personel_id),
    (NEW.id, 'Prim',     'gider', 'award',          '#F59E0B', v_personel_id),
    (NEW.id, 'Tazminat', 'gider', 'file-signature', '#F59E0B', v_personel_id),
    (NEW.id, 'SGK',      'gider', 'badge',          '#F59E0B', v_personel_id),
    (NEW.id, 'Diğer',    'gider', 'users',          '#F59E0B', v_personel_id);

  -- Otomatik Kasa (onboarding v15 — KORUNDU): kullanıcı "hesap ekleme" duvarına
  -- takılmadan ilk işlemini girebilsin. is_auto_created=true → aktivasyonda sayılmaz.
  INSERT INTO hesaplar (isletme_id, name, type, currency, is_auto_created)
  VALUES (NEW.id, 'Kasa', 'nakit', 'TRY', true);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger (on_isletme_created) zaten mevcut ve bu fonksiyonu çağırıyor —
-- CREATE OR REPLACE FUNCTION ile trigger'a dokunmaya gerek yok.
