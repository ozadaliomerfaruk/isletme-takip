 -- Cekler tablosu RLS Policies

  -- SELECT: Kullanıcı kendi işletmesinin çeklerini görebilir
  CREATE POLICY "Users can view own isletme cekler"
  ON public.cekler
  FOR SELECT
  USING (
    isletme_id IN (
      SELECT id FROM public.isletmeler
      WHERE user_id = auth.uid()
    )
  );

  -- INSERT: Kullanıcı kendi işletmesi için çek oluşturabilir
  CREATE POLICY "Users can insert own isletme cekler"
  ON public.cekler
  FOR INSERT
  WITH CHECK (
    isletme_id IN (
      SELECT id FROM public.isletmeler
      WHERE user_id = auth.uid()
    )
  );

  -- UPDATE: Kullanıcı kendi işletmesinin çeklerini güncelleyebilir
  CREATE POLICY "Users can update own isletme cekler"
  ON public.cekler
  FOR UPDATE
  USING (
    isletme_id IN (
      SELECT id FROM public.isletmeler
      WHERE user_id = auth.uid()
    )
  );

  -- DELETE: Kullanıcı kendi işletmesinin çeklerini silebilir
  CREATE POLICY "Users can delete own isletme cekler"
  ON public.cekler
  FOR DELETE
  USING (
    isletme_id IN (
      SELECT id FROM public.isletmeler
      WHERE user_id = auth.uid()
    )
  );
