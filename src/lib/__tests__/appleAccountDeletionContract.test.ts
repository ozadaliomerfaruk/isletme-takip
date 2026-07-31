import fs from 'fs';
import path from 'path';
import type { User } from '@supabase/supabase-js';

import { isAppleAuthenticatedUser } from '@/lib/appleAccountDeletion';

const ROOT = path.resolve(__dirname, '../../..');
const read = (relativePath: string) =>
  fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('Apple account deletion contract', () => {
  it('recognizes Apple in provider metadata or linked identities', () => {
    expect(
      isAppleAuthenticatedUser({
        app_metadata: { provider: 'apple', providers: ['apple'] },
        identities: [],
      } as unknown as User)
    ).toBe(true);

    expect(
      isAppleAuthenticatedUser({
        app_metadata: { provider: 'email', providers: ['email'] },
        identities: [{ provider: 'apple' }],
      } as unknown as User)
    ).toBe(true);

    expect(
      isAppleAuthenticatedUser({
        app_metadata: { provider: 'email', providers: ['email'] },
        identities: [],
      } as unknown as User)
    ).toBe(false);
  });

  it('captures the short-lived authorization code server-side and never ships Apple secrets in the client', () => {
    const auth = read('src/hooks/useAuth.ts');
    const client = read('src/lib/appleAccountDeletion.ts');
    const captureEdge = read(
      'supabase/functions/apple-revocation-credential/index.ts'
    );
    const shared = read(
      'supabase/functions/_shared/appleRevocation.ts'
    );

    expect(auth).toContain('credential.authorizationCode');
    expect(auth).toContain('captureAppleRevocationCredential');
    expect(client).toContain("'apple-revocation-credential'");
    expect(captureEdge).toContain('exchangeAppleAuthorizationCode');
    expect(captureEdge).toContain('APPLE_IDENTITY_MISMATCH');
    expect(shared).toContain('AES-GCM');
    expect(shared).toContain('AbortSignal.timeout(APPLE_HTTP_TIMEOUT_MS)');
    expect(shared).toContain('signature.length !== 64');
    expect(shared).toContain('Drain/re-encrypt pending rows first');
    expect(shared).toContain('https://appleid.apple.com/auth/token');
    expect(client).not.toContain('APPLE_PRIVATE_KEY_P8');
    expect(auth).not.toContain('APPLE_PRIVATE_KEY_P8');
  });

  it('revokes a stored refresh token before Auth deletion and retains the documented manual fallback', () => {
    const worker = read(
      'supabase/functions/delete-scheduled-accounts/index.ts'
    );
    const stateMachine = read(
      'supabase/functions/delete-scheduled-accounts/accountDeletionWorker.ts'
    );
    const page = read('src/app/ayarlar/hesap-sil.tsx');
    const tr = JSON.parse(read('src/i18n/locales/tr/settings.json'));
    const en = JSON.parse(read('src/i18n/locales/en/settings.json'));

    expect(worker).toContain('revokeAppleRefreshToken');
    expect(stateMachine.indexOf('revokeAppleCredential')).toBeLessThan(
      stateMachine.indexOf('deleteAuthUser(job.user_id)')
    );
    expect(page).toContain('isAppleManualRevocationRequired');
    expect(page).toContain('allowManualAppleRevocation');
    expect(tr.account.appleManualRevokeDescription).toContain(
      'Apple ile Giriş'
    );
    expect(en.account.appleManualRevokeDescription).toContain(
      'Sign in with Apple'
    );
  });
});
