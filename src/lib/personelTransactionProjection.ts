import type { Currency, IslemType } from '@/types/database';
import type { TransactionCreatorSource } from '@/lib/transactionCreatorLabel';

export const PERSONEL_ISLEM_TYPES = [
  'personel_gider',
  'personel_odeme',
  'personel_tahsilat',
  'personel_satis',
  'personel_izin_hakki',
  'personel_izin_kullanimi',
] as const satisfies readonly IslemType[];

export type PersonelIslemType = (typeof PERSONEL_ISLEM_TYPES)[number];

/**
 * Shared personel detayinda kullanilan bilerek dar, salt-okunur DTO.
 *
 * Tenant ve entity kimlikleri RPC cevabindan istemci modeline alinmaz.
 * `projection_source` parser'in ekledigi yerel bir discriminant'tir.
 */
export interface PersonelIslemListRow {
  projection_source: 'personel-v1';
  id: string;
  type: PersonelIslemType;
  amount: number;
  description: string | null;
  date: string;
  date_end: string | null;
  source_currency: Currency | null;
  target_currency: Currency | null;
  exchange_rate: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
  kategori?: { name: string } | null;
  hesap?: { name: string } | null;
}

export interface PersonelIslemCursor {
  date: string;
  created_at: string;
  id: string;
}

type UnknownRecord = Record<string, unknown>;

const PERSONEL_ISLEM_TYPE_SET: ReadonlySet<string> =
  new Set(PERSONEL_ISLEM_TYPES);
const CURRENCY_SET: ReadonlySet<string> = new Set([
  'TRY',
  'USD',
  'EUR',
  'GBP',
  'XAU',
  'XAG',
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-](\d{2}):?(\d{2}))?$/;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function projectionError(field?: string): Error {
  return new Error(
    field
      ? `Invalid personnel transaction projection field: ${field}`
      : 'Invalid personnel transaction projection row',
  );
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw projectionError(field);
  }
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value === 'string') return value;
  throw projectionError(field);
}

function requiredUuid(value: unknown, field: string): string {
  const parsed = requiredString(value, field);
  if (!UUID_PATTERN.test(parsed)) {
    throw projectionError(field);
  }
  return parsed;
}

function nullableUuid(value: unknown, field: string): string | null {
  if (value === null) return null;
  return requiredUuid(value, field);
}

function isValidCalendarDate(
  yearText: string,
  monthText: string,
  dayText: string,
): boolean {
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const normalized = new Date(Date.UTC(year, month - 1, day));
  return normalized.getUTCFullYear() === year
    && normalized.getUTCMonth() === month - 1
    && normalized.getUTCDate() === day;
}

function requiredTimestamp(value: unknown, field: string): string {
  const parsed = requiredString(value, field);
  const match = TIMESTAMP_PATTERN.exec(parsed);
  if (
    !match
    || !isValidCalendarDate(match[1], match[2], match[3])
    || Number(match[4]) > 23
    || Number(match[5]) > 59
    || Number(match[6]) > 59
    || (match[7] !== undefined && Number(match[7]) > 14)
    || (match[8] !== undefined && Number(match[8]) > 59)
  ) {
    throw projectionError(field);
  }
  return parsed;
}

function nullableTimestamp(value: unknown, field: string): string | null {
  if (value === null) return null;
  return requiredTimestamp(value, field);
}

function nullableDate(value: unknown, field: string): string | null {
  if (value === null) return null;
  const parsed = requiredString(value, field);
  const match = DATE_PATTERN.exec(parsed);
  if (!match || !isValidCalendarDate(match[1], match[2], match[3])) {
    throw projectionError(field);
  }
  return parsed;
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  throw projectionError(field);
}

function positiveFiniteNumber(value: unknown, field: string): number {
  const parsed = finiteNumber(value, field);
  if (parsed <= 0) {
    throw projectionError(field);
  }
  return parsed;
}

function nullablePositiveFiniteNumber(
  value: unknown,
  field: string,
): number | null {
  if (value === null) return null;
  return positiveFiniteNumber(value, field);
}

function nullableCurrency(value: unknown, field: string): Currency | null {
  if (value === null) return null;
  if (typeof value === 'string' && CURRENCY_SET.has(value)) {
    return value as Currency;
  }
  throw projectionError(field);
}

function relationName(value: unknown, field: string): { name: string } | null {
  const name = nullableString(value, field);
  return name === null ? null : { name };
}

export function isPersonelIslemType(
  value: unknown,
): value is PersonelIslemType {
  return typeof value === 'string' && PERSONEL_ISLEM_TYPE_SET.has(value);
}

function parsePersonelIslemListRow(value: unknown): PersonelIslemListRow {
  if (!isRecord(value)) {
    throw projectionError();
  }
  if (!isPersonelIslemType(value.type)) {
    throw projectionError('type');
  }

  const date = requiredTimestamp(value.date, 'date');
  const rawCreatedAt = nullableTimestamp(value.created_at, 'created_at');

  return {
    projection_source: 'personel-v1',
    id: requiredUuid(value.id, 'id'),
    type: value.type,
    amount: positiveFiniteNumber(value.amount, 'amount'),
    description: nullableString(value.description, 'description'),
    date,
    date_end: nullableDate(value.date_end, 'date_end'),
    source_currency: nullableCurrency(
      value.source_currency,
      'source_currency',
    ),
    target_currency: nullableCurrency(
      value.target_currency,
      'target_currency',
    ),
    exchange_rate: nullablePositiveFiniteNumber(
      value.exchange_rate,
      'exchange_rate',
    ),
    created_by: nullableUuid(value.created_by, 'created_by'),
    created_at: rawCreatedAt ?? date,
    updated_at: nullableTimestamp(value.updated_at, 'updated_at'),
    kategori: relationName(value.kategori_name, 'kategori_name'),
    hesap: relationName(value.hesap_name, 'hesap_name'),
  };
}

/**
 * PostgREST `numeric` alanlari number veya string olarak dondurebilir. Parser
 * iki sekli de sonlu ve pozitif sayiya cevirir; beklenmeyen tek satirda tum
 * cevabi fail-closed reddeder.
 */
export function parsePersonelIslemListRows(
  value: unknown,
): PersonelIslemListRow[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid personnel transaction projection response');
  }
  return value.map(parsePersonelIslemListRow);
}

export function isPersonelIslemListRow(
  value: unknown,
): value is PersonelIslemListRow {
  return isRecord(value) && value.projection_source === 'personel-v1';
}

/**
 * Projection DTO tenant kimligi tasimaz. Creator nickname cozumleyicisine
 * gereken tenant baglami yalniz oturumdaki guvenilir yerel isletme kimliginden
 * eklenir; sunucu satirindaki fazladan `isletme_id` alani asla kullanilmaz.
 */
export function toPersonelTransactionCreatorSource(
  row: PersonelIslemListRow,
  trustedIsletmeId: string | null | undefined,
): TransactionCreatorSource {
  return {
    created_by: row.created_by,
    isletme_id:
      trustedIsletmeId == null
        ? null
        : requiredUuid(trustedIsletmeId, 'trusted_isletme_id'),
  };
}

/**
 * Keyset sayfalari retry/refetch yarisi nedeniyle ayni satiri tasirsa ilk
 * gorulen sirayi koruyarak tekillestirir.
 */
export function dedupePersonelIslemRowsById<T extends { id: string }>(
  rows: readonly T[],
): T[] {
  const seenIds = new Set<string>();
  return rows.filter((row) => {
    if (seenIds.has(row.id)) return false;
    seenIds.add(row.id);
    return true;
  });
}
