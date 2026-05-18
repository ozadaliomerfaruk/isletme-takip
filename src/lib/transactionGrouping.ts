import { IslemWithRelations } from '@/types/database';

export type MilestoneItem = {
  type: 'milestone';
  key: string;
  title: string;
  date: string;
  color: 'success' | 'error';
};

export type NoteListItem = {
  type: 'note';
  key: string;
  data: { id: string; content: string; created_at: string; updated_at: string; entity_type: string; entity_id: string | null };
};

export type TransactionListItem =
  | { type: 'header'; key: string; title: string }
  | { type: 'transaction'; key: string; data: IslemWithRelations }
  | MilestoneItem
  | NoteListItem;

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

/**
 * Merges notes into an already-grouped transaction list by date (descending).
 * All items within a date group are sorted chronologically (newest first).
 */
export function mergeNotesIntoGroupedData(
  groupedData: TransactionListItem[],
  notes: { id: string; content: string; created_at: string; updated_at: string; entity_type: string; entity_id: string | null }[],
  todayLabel: string,
  yesterdayLabel: string,
  formatDate: (date: string) => string,
): TransactionListItem[] {
  if (!notes.length) return groupedData;

  const now = new Date();
  const todayStr = toLocalDateString(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toLocalDateString(yesterday);

  type Sortable = { dateKey: string; timestamp: number; item: TransactionListItem };
  const items: Sortable[] = [];

  for (const entry of groupedData) {
    if (entry.type === 'header') continue;
    if (entry.type === 'transaction') {
      items.push({
        dateKey: toLocalDateString(new Date(entry.data.date)),
        timestamp: new Date(entry.data.created_at).getTime(),
        item: entry,
      });
    } else if (entry.type === 'note') {
      items.push({
        dateKey: toLocalDateString(new Date(entry.data.created_at)),
        timestamp: new Date(entry.data.created_at).getTime(),
        item: entry,
      });
    } else if (entry.type === 'milestone') {
      items.push({
        dateKey: toLocalDateString(new Date(entry.date)),
        timestamp: new Date(entry.date).getTime(),
        item: entry,
      });
    }
  }

  for (const note of notes) {
    items.push({
      dateKey: toLocalDateString(new Date(note.created_at)),
      timestamp: new Date(note.created_at).getTime(),
      item: { type: 'note', key: `note-${note.id}`, data: note },
    });
  }

  items.sort((a, b) => {
    if (a.dateKey !== b.dateKey) return a.dateKey > b.dateKey ? -1 : 1;
    return b.timestamp - a.timestamp;
  });

  const result: TransactionListItem[] = [];
  let currentDateKey = '';

  for (const { dateKey, item } of items) {
    if (dateKey !== currentDateKey) {
      currentDateKey = dateKey;
      let title: string;
      if (dateKey === todayStr) {
        title = todayLabel;
      } else if (dateKey === yesterdayStr) {
        title = yesterdayLabel;
      } else {
        const ts = item.type === 'transaction' ? item.data.date
          : item.type === 'note' ? item.data.created_at
          : (item as MilestoneItem).date;
        title = formatDate(ts);
      }
      result.push({ type: 'header', key: 'header-' + dateKey, title });
    }
    result.push(item);
  }

  return result;
}

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}
