/**
 * Archived entity detail pages keep their history visible, but transaction and
 * movement mutations stay disabled until the entity is unarchived.
 *
 * Older cached rows may not carry `is_archived`; only an explicit `true` is
 * treated as archived so existing unarchived records keep their current flow.
 */
export function canMutateEntityHistory(
  isArchived: boolean | null | undefined,
): boolean {
  return isArchived !== true;
}
