import type { IslemType } from '@/types/database';

export const CARI_ISLEM_TYPES = [
  'cari_alis',
  'cari_satis',
  'cari_odeme',
  'cari_tahsilat',
  'cari_alis_iade',
  'cari_satis_iade',
] as const satisfies readonly IslemType[];

export type CariIslemType = (typeof CARI_ISLEM_TYPES)[number];

/**
 * Cari detay listesi icin bilerek dar tutulan istemci modeli.
 *
 * RPC yalniz kategori/hesap adlarini verir. Olusturan kisi etiketi bu satira
 * join edilmez; `useTransactionCreatorLabelResolver` tarafindan created_by ile
 * ayri, tenant-scoped projeksiyondan cozulur.
 */
export interface CariIslemListRow {
  id: string;
  isletme_id: string;
  type: CariIslemType;
  amount: number;
  description: string | null;
  date: string;
  source_currency: string | null;
  target_currency: string | null;
  exchange_rate: number | null;
  vade_tarihi: string | null;
  photo_path: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
  kategori?: { name: string } | null;
  hesap?: { name: string } | null;
}

export interface CariIslemCursor {
  date: string;
  created_at: string;
  id: string;
}

type UnknownRecord = Record<string, unknown>;

const CARI_ISLEM_TYPE_SET: ReadonlySet<string> = new Set(CARI_ISLEM_TYPES);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid cari transaction projection field: ${field}`);
  }
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value === 'string') return value;
  throw new Error(`Invalid cari transaction projection field: ${field}`);
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  throw new Error(`Invalid cari transaction projection field: ${field}`);
}

function nullableFiniteNumber(value: unknown, field: string): number | null {
  if (value === null) return null;
  return finiteNumber(value, field);
}

function relationName(value: unknown, field: string): { name: string } | null {
  const name = nullableString(value, field);
  return name === null ? null : { name };
}

function relationFromRow(
  row: UnknownRecord,
  flatField: 'kategori_name' | 'hesap_name',
  nestedField: 'kategori' | 'hesap',
): { name: string } | null {
  if (Object.prototype.hasOwnProperty.call(row, flatField)) {
    return relationName(row[flatField], flatField);
  }

  if (Object.prototype.hasOwnProperty.call(row, nestedField)) {
    const relation = row[nestedField];
    if (relation === null) return null;
    if (!isRecord(relation)) {
      throw new Error(
        `Invalid cari transaction projection field: ${nestedField}`,
      );
    }
    return {
      name: requiredString(relation.name, `${nestedField}.name`),
    };
  }

  throw new Error(`Invalid cari transaction projection field: ${flatField}`);
}

export function isCariIslemType(value: unknown): value is CariIslemType {
  return typeof value === 'string' && CARI_ISLEM_TYPE_SET.has(value);
}

/**
 * Owner satırlarında `hesap_id` her zaman tablo kolonudur; dar projection bu
 * kimliği bilerek taşımaz. Bu ayrım ekstra bir response alanı eklemeden rapor
 * bileşenlerinin dar currency modelini seçmesini sağlar.
 */
export function isCariIslemListRow(
  value: unknown,
): value is CariIslemListRow {
  return isRecord(value)
    && !Object.prototype.hasOwnProperty.call(value, 'hesap_id')
    && typeof value.isletme_id === 'string'
    && isCariIslemType(value.type);
}

function parseCariIslemListRow(value: unknown): CariIslemListRow {
  if (!isRecord(value)) {
    throw new Error('Invalid cari transaction projection row');
  }

  if (!isCariIslemType(value.type)) {
    throw new Error('Invalid cari transaction projection field: type');
  }

  const date = requiredString(value.date, 'date');
  const rawCreatedAt = nullableString(value.created_at, 'created_at');

  return {
    id: requiredString(value.id, 'id'),
    isletme_id: requiredString(value.isletme_id, 'isletme_id'),
    type: value.type,
    amount: finiteNumber(value.amount, 'amount'),
    description: nullableString(value.description, 'description'),
    date,
    source_currency: nullableString(
      value.source_currency,
      'source_currency',
    ),
    target_currency: nullableString(
      value.target_currency,
      'target_currency',
    ),
    exchange_rate: nullableFiniteNumber(
      value.exchange_rate,
      'exchange_rate',
    ),
    vade_tarihi: nullableString(value.vade_tarihi, 'vade_tarihi'),
    photo_path: nullableString(value.photo_path, 'photo_path'),
    created_by: nullableString(value.created_by, 'created_by'),
    // Canli tabloda iki alan da DEFAULT now() ile dolu olsa da sema nullable.
    // Siralama/gruplama icin created_at yoksa islem tarihini guvenli vekil yap;
    // updated_at yalniz memo karsilastirmasinda kullanildigi icin null kalabilir.
    created_at: rawCreatedAt ?? date,
    updated_at: nullableString(value.updated_at, 'updated_at'),
    kategori: relationFromRow(value, 'kategori_name', 'kategori'),
    hesap: relationFromRow(value, 'hesap_name', 'hesap'),
  };
}

/**
 * PostgREST `numeric` alanlari istemci/ayar farkina gore number veya string
 * gelebilir. Parser iki sekli de sonlu sayiya cevirir; beklenmeyen satiri
 * genis bir cast ile listeye sokmak yerine tum sorguyu fail-closed reddeder.
 */
export function parseCariIslemListRows(value: unknown): CariIslemListRow[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid cari transaction projection response');
  }
  return value.map(parseCariIslemListRow);
}
