import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('account deletion UI contract', () => {
  it('shows a cancellation confirmation after a successful cancellation', () => {
    const home = read('src/app/(tabs)/index.tsx');
    const tr = JSON.parse(read('src/i18n/locales/tr/settings.json'));
    const en = JSON.parse(read('src/i18n/locales/en/settings.json'));

    expect(home).toContain("t('settings:account.deleteRequestCancelledMessage')");
    expect(tr.account.deleteRequestCancelledMessage).toContain('iptal edildi');
    expect(en.account.deleteRequestCancelledMessage).toContain('canceled');
    expect(tr.account.deleteRequestCancelledMessage).not.toContain('7 gün');
    expect(en.account.deleteRequestCancelledMessage).not.toContain('7 days');
    expect(tr.messages.cancelDeletionFailed).toContain(
      'başlamış olabilir',
    );
    expect(en.messages.cancelDeletionFailed).toContain(
      'may have started',
    );
    expect(tr.messages.cancelDeletionFailed).not.toContain(
      'Hesabınız silinmedi',
    );
  });

  it('uses account-scoped RPCs and lets shared-only users confirm with email', () => {
    const auth = read('src/hooks/useAuth.ts');
    const page = read('src/app/ayarlar/hesap-sil.tsx');
    const layout = read('src/app/_layout.tsx');

    expect(auth).toContain("'schedule_own_account_deletion_v1'");
    expect(auth).toContain("'cancel_own_account_deletion_v1'");
    expect(auth).toContain("'get_own_account_deletion_status_v1'");
    expect(auth).toContain(
      'await waitForNotificationCleanupBeforeSignOut(state.user.id)'
    );
    const deleteAccountSource = auth.slice(
      auth.indexOf('const deleteAccount = async'),
      auth.indexOf('// Hesap silme isteğini iptal et')
    );
    expect(
      deleteAccountSource.indexOf(
        'accountDeletionScheduledAt: scheduledDeletionAt'
      )
    ).toBeLessThan(
      deleteAccountSource.indexOf('await supabase.auth.signOut()')
    );
    expect(
      deleteAccountSource.indexOf('await supabase.auth.signOut()')
    ).toBeLessThan(
      deleteAccountSource.indexOf(
        'await finalizeNotificationsAfterSignOut()'
      )
    );
    expect(deleteAccountSource).not.toContain('throw signOutError');
    expect(deleteAccountSource).toContain(
      'Deletion was scheduled but sign-out did not complete:'
    );
    expect(deleteAccountSource).toContain(
      'Deletion was scheduled; post-commit cleanup failed:'
    );
    expect(deleteAccountSource).toContain('await Promise.allSettled([');
    expect(auth).not.toMatch(
      /const deleteAccount[\s\S]{0,1200}\.update\(\{ scheduled_deletion_at/
    );
    expect(page).not.toContain('useRequireOwner');
    expect(page).toContain("ownIsletme?.name || user?.email");
    expect(page).toContain('settings:account.confirmAccountLabel');
    expect(layout).toContain('accountDeletionScheduledAt');
    expect(layout).toContain("router.replace('/ayarlar/hesap-sil')");
  });
});
