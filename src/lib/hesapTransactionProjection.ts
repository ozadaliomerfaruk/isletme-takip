import type { Currency, IslemType } from '@/types/database';

export const HESAP_ISLEM_TYPES = [
  'gelir',
  'gider',
  'transfer',
  'cari_alis',
  'cari_satis',
  'cari_odeme',
  'cari_tahsilat',
  'cari_alis_iade',
  'cari_satis_iade',
  'personel_gider',
  'personel_odeme',
  'personel_tahsilat',
  'personel_satis',
  'personel_izin_hakki',
  'personel_izin_kullanimi',
] as const satisfies readonly IslemType[];

export type HesapIslemType = (typeof HESAP_ISLEM_TYPES)[number];

/**
 * `counterparty_kind` transferlerde secili hesabin karsi bacagini anlatir:
 * - source_account: secili hesap hedef bacaktir (hesaba giris)
 * - target_account: secili hesap kaynak bacaktir (hesaptan cikis)
 *
 * Cari/personel degerleri yalniz ilgili kaynak modulu aciksa RPC'den gelebilir.
 */
export type HesapCounterpartyKind =
  | 'source_account'
  | 'target_account'
  | 'cari'
  | 'personel';

/**
 * Shared hesap detayinda kullanilan bilerek dar, salt-okunur DTO.
 *
 * Ham tenant/entity kimlikleri istemci modeline de alinmaz. `projection_source`
 * yalniz parser'in ekledigi yerel bir discriminant'tir; RPC kolonlarindan biri
 * degildir.
 */
export interface HesapIslemListRow {
  projection_source: 'hesap-v1';
  id: string;
  type: HesapIslemType;
  amount: number;
  description: string | null;
  date: string;
  source_currency: Currency | null;
  target_currency: Currency | null;
  exchange_rate: number | null;
  vade_tarihi: string | null;
  photo_path: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
  kategori?: { name: string } | null;
  source_account_name: string | null;
  target_account_name: string | null;
  counterparty_kind: HesapCounterpartyKind | null;
  counterparty_name: string | null;
}

export interface HesapIslemCursor {
  date: string;
  created_at: string;
  id: string;
}

type UnknownRecord = Record<string, unknown>;

const HESAP_ISLEM_TYPE_SET: ReadonlySet<string> =
  new Set(HESAP_ISLEM_TYPES);
const COUNTERPARTY_KIND_SET: ReadonlySet<string> = new Set([
  'source_account',
  'target_account',
  'cari',
  'personel',
]);
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

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid account transaction projection field: ${field}`);
  }
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value === 'string') return value;
  throw new Error(`Invalid account transaction projection field: ${field}`);
}

function requiredUuid(value: unknown, field: string): string {
  const parsed = requiredString(value, field);
  if (!UUID_PATTERN.test(parsed)) {
    throw new Error(`Invalid account transaction projection field: ${field}`);
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
    throw new Error(`Invalid account transaction projection field: ${field}`);
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
    throw new Error(`Invalid account transaction projection field: ${field}`);
  }
  return parsed;
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  throw new Error(`Invalid account transaction projection field: ${field}`);
}

function positiveFiniteNumber(value: unknown, field: string): number {
  const parsed = finiteNumber(value, field);
  if (parsed <= 0) {
    throw new Error(`Invalid account transaction projection field: ${field}`);
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
  throw new Error(`Invalid account transaction projection field: ${field}`);
}

function parseCounterpartyKind(
  value: unknown,
): HesapCounterpartyKind | null {
  if (value === null) return null;
  if (typeof value === 'string' && COUNTERPARTY_KIND_SET.has(value)) {
    return value as HesapCounterpartyKind;
  }
  throw new Error(
    'Invalid account transaction projection field: counterparty_kind',
  );
}

function parseHesapIslemListRow(value: unknown): HesapIslemListRow {
  if (!isRecord(value)) {
    throw new Error('Invalid account transaction projection row');
  }
  if (
    typeof value.type !== 'string'
    || !HESAP_ISLEM_TYPE_SET.has(value.type)
  ) {
    throw new Error('Invalid account transaction projection field: type');
  }

  const date = requiredTimestamp(value.date, 'date');
  const rawCreatedAt = nullableTimestamp(value.created_at, 'created_at');
  const kategoriName = nullableString(value.kategori_name, 'kategori_name');

  return {
    projection_source: 'hesap-v1',
    id: requiredUuid(value.id, 'id'),
    type: value.type as HesapIslemType,
    amount: positiveFiniteNumber(value.amount, 'amount'),
    description: nullableString(value.description, 'description'),
    date,
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
    vade_tarihi: nullableDate(value.vade_tarihi, 'vade_tarihi'),
    photo_path: nullableString(value.photo_path, 'photo_path'),
    created_by: nullableUuid(value.created_by, 'created_by'),
    created_at: rawCreatedAt ?? date,
    updated_at: nullableTimestamp(value.updated_at, 'updated_at'),
    kategori: kategoriName === null ? null : { name: kategoriName },
    source_account_name: nullableString(
      value.source_account_name,
      'source_account_name',
    ),
    target_account_name: nullableString(
      value.target_account_name,
      'target_account_name',
    ),
    counterparty_kind: parseCounterpartyKind(value.counterparty_kind),
    counterparty_name: nullableString(
      value.counterparty_name,
      'counterparty_name',
    ),
  };
}

export function parseHesapIslemListRows(
  value: unknown,
): HesapIslemListRow[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid account transaction projection response');
  }
  return value.map(parseHesapIslemListRow);
}

/**
 * Keyset sayfalari refetch/retry yarisi nedeniyle ayni satiri tekrar tasirsa
 * ilk gorulen sirayi koruyarak tekilleştirir.
 */
export function dedupeHesapIslemRowsById<T extends { id: string }>(
  rows: readonly T[],
): T[] {
  const seenIds = new Set<string>();
  return rows.filter((row) => {
    if (seenIds.has(row.id)) return false;
    seenIds.add(row.id);
    return true;
  });
}

export function isHesapIslemListRow(
  value: unknown,
): value is HesapIslemListRow {
  return isRecord(value) && value.projection_source === 'hesap-v1';
}

export function isHesapProjectionTargetLeg(
  value: HesapIslemListRow,
): boolean {
  return value.counterparty_kind === 'source_account';
}
