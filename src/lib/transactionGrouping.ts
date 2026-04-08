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
 * Notes are inserted at the end of the matching date group.
 * If no matching date group exists, a new header is created.
 */
export function mergeNotesIntoGroupedData(
  groupedData: TransactionListItem[],
  notes: { id: string; content: string; created_at: string; updated_at: string; entity_type: string; entity_id: string | null }[],
  todayLabel: string,
  yesterdayLabel: string,
  formatDate: (date: string) => string,
): TransactionListItem[] {
  if (!notes.length) return groupedData;

  const result = [...groupedData];
  const now = new Date();
  const todayStr = toLocalDateString(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toLocalDateString(yesterday);

  for (const note of notes) {
    const noteDateStr = toLocalDateString(new Date(note.created_at));
    const noteItem: NoteListItem = { type: 'note', key: `note-${note.id}`, data: note };

    // Find the date group header for this note
    let headerIdx = -1;
    for (let i = 0; i < result.length; i++) {
      if (result[i].type === 'header' && result[i].key === 'header-' + noteDateStr) {
        headerIdx = i;
        break;
      }
    }

    if (headerIdx >= 0) {
      // Find correct chronological position within the date group (descending order)
      let insertIdx = headerIdx + 1;
      while (insertIdx < result.length && result[insertIdx].type !== 'header') {
        const curr = result[insertIdx];
        if (curr.type === 'transaction') {
          if (curr.data.date < note.created_at) break; // note is newer, insert before this item
        }
        insertIdx++;
      }
      result.splice(insertIdx, 0, noteItem);
    } else {
      // Need to create a new date group - find correct position (descending date order)
      let title: string;
      if (noteDateStr === todayStr) {
        title = todayLabel;
      } else if (noteDateStr === yesterdayStr) {
        title = yesterdayLabel;
      } else {
        title = formatDate(note.created_at);
      }

      let inserted = false;
      for (let i = 0; i < result.length; i++) {
        if (result[i].type === 'header') {
          const existingDateStr = result[i].key.replace('header-', '');
          if (noteDateStr > existingDateStr) {
            result.splice(i, 0,
              { type: 'header', key: 'header-' + noteDateStr, title },
              noteItem,
            );
            inserted = true;
            break;
          }
        }
      }
      if (!inserted) {
        result.push(
          { type: 'header', key: 'header-' + noteDateStr, title },
          noteItem,
        );
      }
    }
  }

  return result;
}

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}
