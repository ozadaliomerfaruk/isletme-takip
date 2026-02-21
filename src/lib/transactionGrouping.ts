import { IslemWithRelations } from '@/types/database';

export type TransactionListItem =
  | { type: 'header'; key: string; title: string }
  | { type: 'transaction'; key: string; data: IslemWithRelations };

/**
 * Groups transactions by date and inserts header items.
 * Uses relative labels for today/yesterday, full dates for older.
 */
export function preprocessTransactionsByDate(
  transactions: IslemWithRelations[],
  todayLabel: string,
  yesterdayLabel: string,
  formatDate: (date: string) => string,
): TransactionListItem[] {
  if (!transactions.length) return [];

  const now = new Date();
  const todayStr = toLocalDateString(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toLocalDateString(yesterday);

  const result: TransactionListItem[] = [];
  let currentDateStr = '';

  for (const txn of transactions) {
    const txnDateStr = toLocalDateString(new Date(txn.date));

    if (txnDateStr !== currentDateStr) {
      currentDateStr = txnDateStr;
      let title: string;
      if (txnDateStr === todayStr) {
        title = todayLabel;
      } else if (txnDateStr === yesterdayStr) {
        title = yesterdayLabel;
      } else {
        title = formatDate(txn.date);
      }
      result.push({ type: 'header', key: 'header-' + txnDateStr, title });
    }

    result.push({ type: 'transaction', key: 'txn-' + txn.id, data: txn });
  }

  return result;
}

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}
