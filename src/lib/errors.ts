/**
 * General-purpose error message extraction.
 *
 * Replaces `catch (error: any) { ... error.message }` with
 * `catch (error) { ... toErrorMessage(error) }` across the codebase.
 */

export function toErrorMessage(error: unknown, fallback?: string): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (
    error !== null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return fallback ?? 'An unexpected error occurred';
}

/**
 * Error thrown when trying to delete an entity that has linked records
 * (transactions, scheduled transactions, cheques, etc.).
 * UI components can check `instanceof LinkedRecordsError` to show
 * a "Cannot Delete" title instead of a generic "Error" title.
 */
export class LinkedRecordsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LinkedRecordsError';
  }
}

/**
 * Type guard to check if an error is a LinkedRecordsError.
 */
export function isLinkedRecordsError(error: unknown): error is LinkedRecordsError {
  return error instanceof LinkedRecordsError;
}
