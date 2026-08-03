import { isPermanentAuthSessionError } from '../authSessionRecovery';

describe('auth session recovery classification', () => {
  it.each([
    { code: 'refresh_token_not_found', message: 'Refresh Token Not Found' },
    { code: 'refresh_token_already_used', message: 'Refresh token already used' },
    { code: 'session_not_found', message: 'Auth session missing' },
    { name: 'AuthSessionMissingError', message: 'Auth session missing!' },
    { message: 'Invalid Refresh Token: token is expired' },
  ])('treats unrecoverable local credentials as permanent', (error) => {
    expect(isPermanentAuthSessionError(error)).toBe(true);
  });

  it.each([
    { code: 'ETIMEDOUT', message: 'request timed out' },
    { status: 503, message: 'service unavailable' },
    new TypeError('Network request failed'),
    { message: 'Invalid response from gateway' },
  ])('keeps transient failures recoverable', (error) => {
    expect(isPermanentAuthSessionError(error)).toBe(false);
  });
});
