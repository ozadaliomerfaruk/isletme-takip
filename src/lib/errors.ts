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
