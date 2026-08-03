import { toErrorMessage } from '@/lib/errors';

const PERMANENT_SESSION_ERROR_CODES = new Set([
  'refresh_token_not_found',
  'refresh_token_already_used',
  'session_not_found',
]);

/**
 * Yalniz geri dondurulemeyecek yerel oturum hatalari kullaniciyi cikis yapmis
 * saydirir. Ag, timeout ve 5xx hatalari soguk acilista login ekranina dusurulmez.
 */
export function isPermanentAuthSessionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const candidate = error as { code?: unknown; name?: unknown };
  const code = typeof candidate.code === 'string'
    ? candidate.code.toLowerCase()
    : '';

  if (PERMANENT_SESSION_ERROR_CODES.has(code)) return true;

  const name = typeof candidate.name === 'string'
    ? candidate.name.toLowerCase()
    : '';
  if (name === 'authsessionmissingerror') return true;

  const message = toErrorMessage(error).toLowerCase();
  return (
    /invalid refresh token/.test(message)
    || /refresh token.+(?:not found|already used|expired)/.test(message)
    || /auth session missing/.test(message)
  );
}
