import type {
  Cari,
  Hesap,
  IslemType,
  IslemWithRelations,
  Kategori,
  Personel,
} from '@/types/database';
import { getTransactionSourceModules } from '@/lib/transactionSourceModules';

type UnknownRecord = Record<string, unknown>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COUNTERPARTY_KIND_SET: ReadonlySet<string> = new Set([
  'hesap',
  'cari',
  'personel',
]);

function projectionError(field?: string): Error {
  return new Error(
    field
      ? `Invalid authorized transaction projection field: ${field}`
      : 'Invalid authorized transaction projection row',
  );
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw projectionError(field);
  }
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw projectionError(field);
  return value;
}

function optionalNullableString(value: unknown, field: string): string | null {
  if (value === undefined) return null;
  return nullableString(value, field);
}

function parseCounterpartyKind(
  value: unknown,
): IslemWithRelations['counterparty_kind'] {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== 'string'
    || !COUNTERPARTY_KIND_SET.has(value)
  ) {
    throw projectionError('counterparty_kind');
  }
  return value as NonNullable<IslemWithRelations['counterparty_kind']>;
}

function requiredUuid(value: unknown, field: string): string {
  const parsed = requiredString(value, field);
  if (!UUID_PATTERN.test(parsed)) throw projectionError(field);
  return parsed;
}

function nullableUuid(value: unknown, field: string): string | null {
  if (value === null) return null;
  return requiredUuid(value, field);
}

function finiteNumber(value: unknown, field: string): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) throw projectionError(field);
  return parsed;
}

function nullableFiniteNumber(value: unknown, field: string): number | null {
  if (value === null) return null;
  return finiteNumber(value, field);
}

function relation(
  value: unknown,
  field: string,
  parser: (record: UnknownRecord) => unknown,
): unknown | null {
  if (value === null) return null;
  if (!isRecord(value)) throw projectionError(field);
  return parser(value);
}

function parseHesap(value: unknown, field: string): Hesap | null {
  return relation(value, field, (record) => ({
    id: requiredUuid(record.id, `${field}.id`),
    name: requiredString(record.name, `${field}.name`),
    currency: requiredString(record.currency, `${field}.currency`),
    type: requiredString(record.type, `${field}.type`),
  })) as Hesap | null;
}

function parseKategori(value: unknown): Kategori | null {
  return relation(value, 'kategori', (record) => ({
    id: requiredUuid(record.id, 'kategori.id'),
    name: requiredString(record.name, 'kategori.name'),
    type: requiredString(record.type, 'kategori.type'),
    color: nullableString(record.color, 'kategori.color'),
  })) as Kategori | null;
}

function parseCari(value: unknown): Cari | null {
  return relation(value, 'cari', (record) => ({
    id: requiredUuid(record.id, 'cari.id'),
    name: requiredString(record.name, 'cari.name'),
    type: requiredString(record.type, 'cari.type'),
  })) as Cari | null;
}

function parsePersonel(value: unknown): Personel | null {
  return relation(value, 'personel', (record) => ({
    id: requiredUuid(record.id, 'personel.id'),
    first_name: requiredString(record.first_name, 'personel.first_name'),
    last_name: nullableString(record.last_name, 'personel.last_name'),
  })) as Personel | null;
}

function parseCreator(
  value: unknown,
): IslemWithRelations['creator'] {
  return relation(value, 'creator', (record) => ({
    display_name: nullableString(record.display_name, 'creator.display_name'),
  })) as IslemWithRelations['creator'];
}

function parseAuthorizedTransactionRow(
  value: unknown,
  trustedIsletmeId: string,
): IslemWithRelations {
  if (!isRecord(value)) throw projectionError();

  const type = requiredString(value.type, 'type');
  if (!getTransactionSourceModules(type)) throw projectionError('type');

  const isletmeId = requiredUuid(value.isletme_id, 'isletme_id');
  if (isletmeId !== trustedIsletmeId) throw projectionError('isletme_id');

  const date = requiredString(value.date, 'date');
  const createdAt = nullableString(value.created_at, 'created_at') ?? date;

  return {
    id: requiredUuid(value.id, 'id'),
    isletme_id: isletmeId,
    type: type as IslemType,
    amount: finiteNumber(value.amount, 'amount'),
    description: nullableString(value.description, 'description'),
    date,
    hesap_id: nullableUuid(value.hesap_id, 'hesap_id'),
    hedef_hesap_id: nullableUuid(value.hedef_hesap_id, 'hedef_hesap_id'),
    kategori_id: nullableUuid(value.kategori_id, 'kategori_id'),
    cari_id: nullableUuid(value.cari_id, 'cari_id'),
    personel_id: nullableUuid(value.personel_id, 'personel_id'),
    source_currency: nullableString(value.source_currency, 'source_currency'),
    target_currency: nullableString(value.target_currency, 'target_currency'),
    exchange_rate: nullableFiniteNumber(value.exchange_rate, 'exchange_rate'),
    photo_path: nullableString(value.photo_path, 'photo_path'),
    date_end: nullableString(value.date_end, 'date_end'),
    source_ileri_id: nullableUuid(value.source_ileri_id, 'source_ileri_id'),
    vade_tarihi: nullableString(value.vade_tarihi, 'vade_tarihi'),
    created_by: nullableUuid(value.created_by, 'created_by'),
    updated_by: nullableUuid(value.updated_by, 'updated_by'),
    created_at: createdAt,
    updated_at: nullableString(value.updated_at, 'updated_at') ?? createdAt,
    hesap: parseHesap(value.hesap, 'hesap'),
    hedef_hesap: parseHesap(value.hedef_hesap, 'hedef_hesap'),
    kategori: parseKategori(value.kategori),
    cari: parseCari(value.cari),
    personel: parsePersonel(value.personel),
    creator: parseCreator(value.creator),
    // Kolonlar mevcut RPC imzasının sonuna eklendi. Sunucu/istemci dağıtım
    // penceresinde eski yanıtta undefined gelebilir; relation veya ID üretmeden
    // null'a indirerek geriye uyumlu ve fail-closed kalırız.
    counterparty_kind: parseCounterpartyKind(value.counterparty_kind),
    counterparty_name: optionalNullableString(
      value.counterparty_name,
      'counterparty_name',
    ),
  };
}

export function parseAuthorizedTransactionRows(
  value: unknown,
  trustedIsletmeId: string,
): IslemWithRelations[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid authorized transaction projection response');
  }
  return value.map((row) =>
    parseAuthorizedTransactionRow(row, trustedIsletmeId));
}

export function dedupeAuthorizedTransactionRowsById<
  T extends { id: string },
>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}
