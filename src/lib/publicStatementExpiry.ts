export const SHARED_PUBLIC_STATEMENT_DURATIONS = [1, 7, 30] as const;
export const OWNER_PUBLIC_STATEMENT_DURATIONS = [1, 7, 30, 365] as const;

export type PublicStatementDuration =
  (typeof OWNER_PUBLIC_STATEMENT_DURATIONS)[number];

/**
 * Public ekstreler kalıcı olamaz. Owner en fazla 365 gün, ortak kullanıcı en
 * fazla 30 gün seçebilir. `null`, eski istemcilerdeki süresiz seçenektir ve yeni
 * istemcide fail-closed reddedilir.
 */
export function isAllowedPublicStatementDuration(
  value: unknown,
  isOwner: boolean,
): value is PublicStatementDuration {
  const allowed: readonly number[] = isOwner
    ? OWNER_PUBLIC_STATEMENT_DURATIONS
    : SHARED_PUBLIC_STATEMENT_DURATIONS;

  return typeof value === 'number' && allowed.includes(value);
}
