export const DEFAULT_TRANSACTION_CREATOR_LABEL = 'Ortak kullanıcı';

export type TransactionCreatorLabelMap = Readonly<
  Record<string, string | null | undefined>
>;

export interface TransactionCreatorSource {
  created_by?: string | null;
  isletme_id?: string | null;
  creator?: {
    display_name?: string | null;
  } | null;
}

interface TransactionCreatorLabelContext {
  activeIsletmeId?: string | null;
  viewerUserId?: string | null;
  memberLabels?: TransactionCreatorLabelMap;
  fallbackLabel?: string | null;
}

function trimmedLabel(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * İşlem satırında gösterilecek tenant-bazlı oluşturucu etiketini çözer.
 *
 * `member_label` yalnız aktif işletmeyle aynı tenant'a ait işlemlerde kullanılır.
 * Böylece linked-cari üzerinden görülen başka işletme işlemlerine aktif işletmenin
 * etiketi yanlışlıkla uygulanmaz. E-posta bilinçli olarak fallback değildir.
 */
export function getTransactionCreatorLabel(
  transaction: TransactionCreatorSource,
  {
    activeIsletmeId,
    viewerUserId,
    memberLabels = {},
    fallbackLabel,
  }: TransactionCreatorLabelContext,
): string | null {
  const creatorId = transaction.created_by;
  if (!creatorId || creatorId === viewerUserId) return null;

  const memberLabel =
    transaction.isletme_id === activeIsletmeId
      ? trimmedLabel(memberLabels[creatorId])
      : null;

  return (
    memberLabel
    ?? trimmedLabel(transaction.creator?.display_name)
    ?? trimmedLabel(fallbackLabel)
    ?? DEFAULT_TRANSACTION_CREATOR_LABEL
  );
}
