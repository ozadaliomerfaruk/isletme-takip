-- Fix: Allow owner to cancel invites (change status from 'pending' to 'cancelled')
-- Previous WITH CHECK had "status = 'pending'" which blocked setting status to 'cancelled'
-- because WITH CHECK validates the NEW row values after update.

DROP POLICY IF EXISTS "Update invites" ON isletme_invites;
CREATE POLICY "Update invites" ON isletme_invites
  FOR UPDATE TO authenticated
  USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    AND status = 'pending'
  )
  WITH CHECK (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
  );
