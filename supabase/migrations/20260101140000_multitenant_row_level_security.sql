-- RLS'i etkinleştir
ALTER TABLE isletmeler ENABLE ROW LEVEL SECURITY;
ALTER TABLE hesaplar ENABLE ROW LEVEL SECURITY;
ALTER TABLE kategoriler ENABLE ROW LEVEL SECURITY;
ALTER TABLE cariler ENABLE ROW LEVEL SECURITY;
ALTER TABLE personel ENABLE ROW LEVEL SECURITY;
ALTER TABLE islemler ENABLE ROW LEVEL SECURITY;

-- İşletmeler için policy (kullanıcı sadece kendi işletmesini görür)
CREATE POLICY "Users can view own isletme" ON isletmeler
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own isletme" ON isletmeler
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own isletme" ON isletmeler
  FOR UPDATE USING (auth.uid() = user_id);

-- Diğer tablolar için policy (işletme üzerinden kontrol)
CREATE POLICY "Users can manage hesaplar" ON hesaplar
  FOR ALL USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can manage kategoriler" ON kategoriler
  FOR ALL USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can manage cariler" ON cariler
  FOR ALL USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can manage personel" ON personel
  FOR ALL USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can manage islemler" ON islemler
  FOR ALL USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
  );
