import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export const APPLE_MANUAL_REVOCATION_REQUIRED =
  'APPLE_MANUAL_REVOCATION_REQUIRED';

export class AppleManualRevocationRequiredError extends Error {
  readonly code = APPLE_MANUAL_REVOCATION_REQUIRED;

  constructor() {
    super(APPLE_MANUAL_REVOCATION_REQUIRED);
    this.name = 'AppleManualRevocationRequiredError';
  }
}

export function isAppleAuthenticatedUser(user: User | null): boolean {
  if (!user) return false;

  const providers = user.app_metadata?.providers;
  return (
    user.app_metadata?.provider === 'apple'
    || (Array.isArray(providers) && providers.includes('apple'))
    || user.identities?.some((identity) => identity.provider === 'apple')
    || false
  );
}

export async function captureAppleRevocationCredential(
  authorizationCode: string
): Promise<void> {
  const { data, error } = await supabase.functions.invoke(
    'apple-revocation-credential',
    {
      body: {
        authorization_code: authorizationCode,
      },
    }
  );

  if (error || data?.status !== 'stored') {
    throw new AppleManualRevocationRequiredError();
  }
}

export function isAppleManualRevocationRequired(
  error: unknown
): error is AppleManualRevocationRequiredError {
  return (
    error instanceof AppleManualRevocationRequiredError
    || (
      typeof error === 'object'
      && error !== null
      && 'code' in error
      && error.code === APPLE_MANUAL_REVOCATION_REQUIRED
    )
  );
}
