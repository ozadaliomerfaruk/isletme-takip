import { supabase } from '@/lib/supabase';
import {
  dedupeHesapIslemRowsById,
  isHesapProjectionTargetLeg,
  parseHesapIslemListRows,
  type HesapIslemListRow,
} from '@/lib/hesapTransactionProjection';
import type {
  Currency,
  IslemWithRelations,
} from '@/types/database';

const HESAP_STATEMENT_PAGE_SIZE = 100;

interface FetchHesapStatementOptions {
  isletmeId: string;
  hesapId: string;
  hesapName: string;
  hesapCurrency?: Currency | string;
}

function accountRelation(
  id: string,
  name: string | null,
  currency: Currency,
) {
  if (!name) return null;
  return {
    id,
    name,
    currency,
    type: 'diger',
    is_active: true,
  };
}

/**
 * Dar hesap hareketi projeksiyonunu mevcut PDF/Excel salt-okunur modeline
 * dönüştürür. Karşı tarafın gizli entity ID'si üretilmez; ekstre üreticilerinin
 * kullandığı ad, kategori, tutar ve seçili-hesap perspektifi korunur.
 */
export function toHesapStatementTransaction(
  row: HesapIslemListRow,
  options: FetchHesapStatementOptions,
): IslemWithRelations {
  const selectedIsTarget = isHesapProjectionTargetLeg(row);
  const fallbackCurrency = (options.hesapCurrency || 'TRY') as Currency;
  const sourceCurrency = row.source_currency ?? fallbackCurrency;
  const targetCurrency = row.target_currency ?? fallbackCurrency;
  const sourceName = row.source_account_name
    ?? (selectedIsTarget ? row.counterparty_name : options.hesapName);
  const targetName = row.target_account_name
    ?? (selectedIsTarget ? options.hesapName : row.counterparty_name);

  return {
    id: row.id,
    isletme_id: options.isletmeId,
    type: row.type,
    amount: row.amount,
    description: row.description,
    date: row.date,
    source_currency: row.source_currency,
    target_currency: row.target_currency,
    exchange_rate: row.exchange_rate,
    vade_tarihi: row.vade_tarihi,
    photo_path: row.photo_path,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    hesap_id: selectedIsTarget ? null : options.hesapId,
    hedef_hesap_id: selectedIsTarget ? options.hesapId : null,
    hesap: accountRelation(
      selectedIsTarget ? '' : options.hesapId,
      sourceName,
      sourceCurrency,
    ),
    hedef_hesap: accountRelation(
      selectedIsTarget ? options.hesapId : '',
      targetName,
      targetCurrency,
    ),
    kategori: row.kategori,
    cari:
      row.counterparty_kind === 'cari' && row.counterparty_name
        ? {
          id: '',
          name: row.counterparty_name,
          type: 'musteri',
        }
        : null,
    personel:
      row.counterparty_kind === 'personel' && row.counterparty_name
        ? {
          id: '',
          first_name: row.counterparty_name,
          last_name: null,
        }
        : null,
  } as unknown as IslemWithRelations;
}

/**
 * `get_hesap_islem_satirlari_v1` keyset sayfalarını sonuna kadar okur.
 * Projection zaten aktif işletme + hesap yetkisini sunucuda doğrular.
 */
export async function fetchHesapStatementTransactions(
  options: FetchHesapStatementOptions,
): Promise<IslemWithRelations[]> {
  const rows: HesapIslemListRow[] = [];
  const seenCursors = new Set<string>();
  let beforeDate: string | null = null;
  let beforeCreatedAt: string | null = null;
  let beforeId: string | null = null;

  while (true) {
    const { data, error } = await supabase.rpc(
      'get_hesap_islem_satirlari_v1',
      {
        p_isletme_id: options.isletmeId,
        p_hesap_id: options.hesapId,
        p_limit: HESAP_STATEMENT_PAGE_SIZE,
        p_before_date: beforeDate,
        p_before_created_at: beforeCreatedAt,
        p_before_id: beforeId,
      },
    );

    if (error) throw error;

    const page = parseHesapIslemListRows(data);
    rows.push(...page);

    if (page.length < HESAP_STATEMENT_PAGE_SIZE) break;

    const last = page[page.length - 1];
    const nextCursor = `${last.date}:${last.created_at}:${last.id}`;
    if (seenCursors.has(nextCursor)) {
      throw new Error('Account statement cursor did not advance');
    }
    seenCursors.add(nextCursor);
    beforeDate = last.date;
    beforeCreatedAt = last.created_at;
    beforeId = last.id;
  }

  return dedupeHesapIslemRowsById(rows).map((row) =>
    toHesapStatementTransaction(row, options));
}

export function filterHesapStatementPeriod(
  rows: readonly IslemWithRelations[],
  startDate: string,
  endDate: string,
): IslemWithRelations[] {
  return rows.filter((row) => {
    const day = row.date.slice(0, 10);
    return day >= startDate && day <= endDate;
  });
}
