/**
 * Supabase Error Handling Utilities
 *
 * Merkezi error handling ve standardization.
 * Tüm Supabase hatalarını tutarlı bir şekilde işlemek için kullanılır.
 */

import i18n from '@/i18n';

/**
 * Supabase error kodları
 * https://postgrest.org/en/stable/errors.html
 */
export const SUPABASE_ERROR_CODES = {
  // PostgREST errors
  NO_ROWS: 'PGRST116', // No rows returned
  PERMISSION_DENIED: 'PGRST301', // Permission denied
  INVALID_RANGE: 'PGRST103', // Invalid range
  FOREIGN_KEY_VIOLATION: '23503', // Foreign key constraint violation
  UNIQUE_VIOLATION: '23505', // Unique constraint violation
  CHECK_VIOLATION: '23514', // Check constraint violation
  NOT_NULL_VIOLATION: '23502', // Not null constraint violation

  // Auth errors
  INVALID_CREDENTIALS: 'invalid_credentials',
  EMAIL_NOT_CONFIRMED: 'email_not_confirmed',
  USER_NOT_FOUND: 'user_not_found',
  SESSION_EXPIRED: 'session_expired',
} as const;

export type SupabaseErrorCode = (typeof SUPABASE_ERROR_CODES)[keyof typeof SUPABASE_ERROR_CODES];

/**
 * Custom Supabase Error class
 */
export class SupabaseError extends Error {
  code: string;
  originalError?: unknown;

  constructor(code: string, message: string, originalError?: unknown) {
    super(message);
    this.name = 'SupabaseError';
    this.code = code;
    this.originalError = originalError;

    // Prototype chain fix for extending built-in classes
    Object.setPrototypeOf(this, SupabaseError.prototype);
  }
}

/**
 * Supabase error objesinden standart error oluşturur
 */
export function createSupabaseError(error: unknown): SupabaseError {
  if (!error) {
    return new SupabaseError('UNKNOWN', i18n.t('common:errors.unknownError'));
  }

  // Zaten SupabaseError ise direkt döndür
  if (error instanceof SupabaseError) {
    return error;
  }

  // Error objesini parse et
  const errorObj = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };

  const code = errorObj.code || 'UNKNOWN';
  const message = errorObj.message || i18n.t('common:errors.genericError');

  return new SupabaseError(code, message, error);
}

/**
 * Supabase hatasının belirli bir tür olup olmadığını kontrol eder
 */
export function isSupabaseError(error: unknown, code: SupabaseErrorCode): boolean {
  if (!error) return false;

  const errorObj = error as { code?: string };
  return errorObj.code === code;
}

/**
 * No rows (PGRST116) hatasını kontrol eder
 * Bu hata genellikle .single() kullanıldığında kayıt bulunamadığında oluşur
 */
export function isNoRowsError(error: unknown): boolean {
  return isSupabaseError(error, SUPABASE_ERROR_CODES.NO_ROWS);
}

/**
 * Permission denied hatasını kontrol eder
 */
export function isPermissionError(error: unknown): boolean {
  return isSupabaseError(error, SUPABASE_ERROR_CODES.PERMISSION_DENIED);
}

/**
 * Foreign key violation hatasını kontrol eder
 */
export function isForeignKeyError(error: unknown): boolean {
  return isSupabaseError(error, SUPABASE_ERROR_CODES.FOREIGN_KEY_VIOLATION);
}

/**
 * Unique constraint violation hatasını kontrol eder
 */
export function isUniqueViolationError(error: unknown): boolean {
  return isSupabaseError(error, SUPABASE_ERROR_CODES.UNIQUE_VIOLATION);
}

/**
 * Kullanıcı dostu hata mesajı döndürür
 */
export function getErrorMessage(error: unknown): string {
  if (!error) return i18n.t('common:errors.unknownError');

  const errorObj = error as { code?: string; message?: string };
  const code = errorObj.code;

  // Özel mesajlar
  switch (code) {
    case SUPABASE_ERROR_CODES.NO_ROWS:
      return i18n.t('common:errors.recordNotFound');

    case SUPABASE_ERROR_CODES.PERMISSION_DENIED:
      return i18n.t('common:errors.permissionDenied');

    case SUPABASE_ERROR_CODES.FOREIGN_KEY_VIOLATION:
      return i18n.t('common:errors.foreignKeyViolation');

    case SUPABASE_ERROR_CODES.UNIQUE_VIOLATION:
      return i18n.t('common:errors.uniqueViolation');

    case SUPABASE_ERROR_CODES.NOT_NULL_VIOLATION:
      return i18n.t('common:errors.notNullViolation');

    case SUPABASE_ERROR_CODES.CHECK_VIOLATION:
      return i18n.t('common:errors.checkViolation');

    case SUPABASE_ERROR_CODES.INVALID_CREDENTIALS:
      return i18n.t('common:errors.invalidCredentials');

    case SUPABASE_ERROR_CODES.EMAIL_NOT_CONFIRMED:
      return i18n.t('common:errors.emailNotConfirmed');

    case SUPABASE_ERROR_CODES.USER_NOT_FOUND:
      return i18n.t('common:errors.userNotFound');

    case SUPABASE_ERROR_CODES.SESSION_EXPIRED:
      return i18n.t('common:errors.sessionExpired');

    default:
      return errorObj.message || i18n.t('common:errors.genericError');
  }
}

/**
 * Supabase hatasını handle eder ve throw eder (null döndürmek yerine)
 * @throws SupabaseError - Her zaman hata fırlatır
 */
export function handleSupabaseError(error: unknown): never {
  throw createSupabaseError(error);
}

/**
 * Güvenli bir şekilde single() sonucunu handle eder
 * No rows hatası için null döndürür, diğer hatalar için throw eder
 */
export function handleSingleResult<T>(
  data: T | null,
  error: unknown
): T | null {
  if (error) {
    // No rows hatası için null döndür (bu normal bir durum)
    if (isNoRowsError(error)) {
      return null;
    }
    // Diğer hatalar için throw et
    handleSupabaseError(error);
  }
  return data;
}
