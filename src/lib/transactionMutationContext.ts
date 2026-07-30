import type { Currency, IslemInsert, IslemType } from '@/types/database';
import { getTransactionSourceModules } from '@/lib/transactionSourceModules';
import { SharedTransactionMutationUnsupportedError } from '@/lib/errors';

export interface TransactionMutationContext {
  id: string;
  type: IslemType;
  amount: number;
  description: string | null;
  date: string;
  hesap_id: string | null;
  hedef_hesap_id: string | null;
  kategori_id: string | null;
  cari_id: string | null;
  personel_id: string | null;
  source_currency: Currency | null;
  target_currency: Currency | null;
  exchange_rate: number | null;
  date_end: string | null;
  vade_tarihi: string | null;
  created_by: string | null;
}

type UnknownRecord = Record<string, unknown>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-](\d{2}):?(\d{2}))?$/;
const CURRENCIES: ReadonlySet<string> = new Set([
  'TRY',
  'USD',
  'EUR',
  'GBP',
  'XAU',
  'XAG',
]);

function parseError(field?: string): Error {
  return new Error(
    field
      ? `Invalid transaction mutation context field: ${field}`
      : 'Invalid transaction mutation context response',
  );
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw parseError(field);
  }
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value === 'string') return value;
  throw parseError(field);
}

function requiredUuid(value: unknown, field: string): string {
  const parsed = requiredString(value, field);
  if (!UUID_PATTERN.test(parsed)) throw parseError(field);
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
    throw parseError(field);
  }
  return parsed;
}

function nullableDate(value: unknown, field: string): string | null {
  if (value === null) return null;
  const parsed = requiredString(value, field);
  const match = DATE_PATTERN.exec(parsed);
  if (!match || !isValidCalendarDate(match[1], match[2], match[3])) {
    throw parseError(field);
  }
  return parsed;
}

function positiveFiniteNumber(value: unknown, field: string): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) throw parseError(field);
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
  if (typeof value === 'string' && CURRENCIES.has(value)) {
    return value as Currency;
  }
  throw parseError(field);
}

function parseRow(value: unknown): TransactionMutationContext {
  if (!isRecord(value)) throw parseError();

  const type = requiredString(value.type, 'type');
  if (!getTransactionSourceModules(type)) throw parseError('type');

  return {
    id: requiredUuid(value.id, 'id'),
    type: type as IslemType,
    amount: positiveFiniteNumber(value.amount, 'amount'),
    description: nullableString(value.description, 'description'),
    date: requiredTimestamp(value.date, 'date'),
    hesap_id: nullableUuid(value.hesap_id, 'hesap_id'),
    hedef_hesap_id: nullableUuid(
      value.hedef_hesap_id,
      'hedef_hesap_id',
    ),
    kategori_id: nullableUuid(value.kategori_id, 'kategori_id'),
    cari_id: nullableUuid(value.cari_id, 'cari_id'),
    personel_id: nullableUuid(value.personel_id, 'personel_id'),
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
    date_end: nullableDate(value.date_end, 'date_end'),
    vade_tarihi: nullableDate(value.vade_tarihi, 'vade_tarihi'),
    created_by: nullableUuid(value.created_by, 'created_by'),
  };
}

/**
 * PostgREST returns a `RETURNS TABLE` RPC as an array. Mutation context must be
 * exactly one row; empty/multiple/malformed results stay fail-closed.
 */
export function parseTransactionMutationContext(
  value: unknown,
): TransactionMutationContext {
  if (!Array.isArray(value) || value.length !== 1) throw parseError();
  return parseRow(value[0]);
}

const SHARED_PATCH_FIELDS = [
  'type',
  'amount',
  'description',
  'date',
  'hesap_id',
  'hedef_hesap_id',
  'kategori_id',
  'cari_id',
  'personel_id',
  'source_currency',
  'target_currency',
  'exchange_rate',
  'date_end',
  'vade_tarihi',
] as const;

const SHARED_IMMUTABLE_CONTEXT_FIELDS = [
  'id',
] as const;

const SHARED_UNSUPPORTED_FIELDS = [
  'photo_path',
  'source_ileri_id',
] as const;

type SharedPatchField = (typeof SHARED_PATCH_FIELDS)[number];
export type SharedTransactionMutationPatch =
  Partial<Pick<IslemInsert, SharedPatchField>>;

function hasOwn(record: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/**
 * Scoped QTB edits may change the tab and its account/entity context. The
 * server revalidates both the original and requested source modules, fixed
 * Cari/Personel scope and referenced rows. Client keeps only row identity and
 * owner-only photo/source metadata immutable.
 */
export function buildSharedTransactionMutationPatch(
  context: TransactionMutationContext,
  updates: Partial<Omit<IslemInsert, 'isletme_id'>>,
): SharedTransactionMutationPatch {
  const raw = updates as UnknownRecord;
  const knownFields = new Set<string>([
    ...SHARED_PATCH_FIELDS,
    ...SHARED_IMMUTABLE_CONTEXT_FIELDS,
    ...SHARED_UNSUPPORTED_FIELDS,
  ]);

  for (const key of Object.keys(raw)) {
    if (raw[key] !== undefined && !knownFields.has(key)) {
      throw new SharedTransactionMutationUnsupportedError();
    }
  }

  for (const key of SHARED_IMMUTABLE_CONTEXT_FIELDS) {
    if (
      hasOwn(raw, key)
      && raw[key] !== undefined
      && raw[key] !== context[key]
    ) {
      throw new SharedTransactionMutationUnsupportedError();
    }
  }

  for (const key of SHARED_UNSUPPORTED_FIELDS) {
    if (hasOwn(raw, key) && raw[key] !== undefined) {
      throw new SharedTransactionMutationUnsupportedError();
    }
  }

  const patch: SharedTransactionMutationPatch = {};
  for (const key of SHARED_PATCH_FIELDS) {
    if (hasOwn(raw, key) && raw[key] !== undefined) {
      Object.assign(patch, { [key]: raw[key] });
    }
  }

  return patch;
}
