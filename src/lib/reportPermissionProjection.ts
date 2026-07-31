import type {
  Cari,
  CariType,
  Currency,
  Hesap,
  HesapType,
  IslemType,
  IslemWithRelations,
  Kategori,
  KategoriType,
  Personel,
} from '@/types/database';

export type ReportEntityKind = 'hesap' | 'cari' | 'personel';

export interface ReportEntityReferenceRow {
  entity_kind: ReportEntityKind;
  entity_id: string;
  primary_name: string;
  secondary_name: string | null;
  entity_type: string;
  currency: Currency;
  balance: number;
}

export interface CashFlowReportProjectionRow {
  flow_kind: 'inflow' | 'outflow' | 'credit_card';
  kategori_id: string | null;
  kategori_adi: string | null;
  kategori_renk: string | null;
  currency: Currency;
  islem_count: number;
  total_amount: number;
}

export interface ReportCategoryReferenceRow {
  id: string;
  name: string;
  type: Extract<KategoriType, 'gelir' | 'gider'>;
  icon: string | null;
  color: string | null;
  parent_id: string | null;
}

export interface CategoryReportTransactionProjection
  extends IslemWithRelations {
  _categoryAmount?: number;
  _reportAmountCurrency: Currency;
}

export interface ReportTrendProjectionRow {
  report_date: string;
  type: IslemType;
  currency: Currency;
  total_amount: number;
}

type UnknownRecord = Record<string, unknown>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const REPORT_ENTITY_KINDS = new Set<ReportEntityKind>([
  'hesap',
  'cari',
  'personel',
]);
const CURRENCIES = new Set<Currency>([
  'TRY',
  'USD',
  'EUR',
  'GBP',
  'XAU',
  'XAG',
]);
const ACCOUNT_TYPES = new Set<HesapType>([
  'nakit',
  'banka',
  'kredi_karti',
  'birikim',
  'diger',
]);
const CARI_TYPES = new Set<CariType>(['musteri', 'tedarikci']);
const CATEGORY_TYPES = new Set<Extract<KategoriType, 'gelir' | 'gider'>>([
  'gelir',
  'gider',
]);
const FLOW_KINDS = new Set<CashFlowReportProjectionRow['flow_kind']>([
  'inflow',
  'outflow',
  'credit_card',
]);
const ISLEM_TYPES = new Set<IslemType>([
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
]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function projectionError(projection: string, field?: string): Error {
  return new Error(
    field
      ? `Invalid ${projection} projection field: ${field}`
      : `Invalid ${projection} projection response`,
  );
}

function requiredString(
  value: unknown,
  projection: string,
  field: string,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw projectionError(projection, field);
  }
  return value;
}

function nullableString(
  value: unknown,
  projection: string,
  field: string,
): string | null {
  if (value === null) return null;
  if (typeof value === 'string') return value;
  throw projectionError(projection, field);
}

function requiredUuid(
  value: unknown,
  projection: string,
  field: string,
): string {
  const parsed = requiredString(value, projection, field);
  if (!UUID_PATTERN.test(parsed)) {
    throw projectionError(projection, field);
  }
  return parsed;
}

function nullableUuid(
  value: unknown,
  projection: string,
  field: string,
): string | null {
  if (value === null) return null;
  return requiredUuid(value, projection, field);
}

function finiteNumber(
  value: unknown,
  projection: string,
  field: string,
): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) {
    throw projectionError(projection, field);
  }
  return parsed;
}

function nonNegativeInteger(
  value: unknown,
  projection: string,
  field: string,
): number {
  const parsed = finiteNumber(value, projection, field);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw projectionError(projection, field);
  }
  return parsed;
}

function currency(
  value: unknown,
  projection: string,
  field: string,
): Currency {
  if (typeof value !== 'string' || !CURRENCIES.has(value as Currency)) {
    throw projectionError(projection, field);
  }
  return value as Currency;
}

function islemType(
  value: unknown,
  projection: string,
  field: string,
): IslemType {
  if (
    typeof value !== 'string'
    || !ISLEM_TYPES.has(value as IslemType)
  ) {
    throw projectionError(projection, field);
  }
  return value as IslemType;
}

function rows(value: unknown, projection: string): UnknownRecord[] {
  if (!Array.isArray(value)) {
    throw projectionError(projection);
  }
  return value.map((row) => {
    if (!isRecord(row)) throw projectionError(projection);
    return row;
  });
}

export function parseReportEntityReferenceRows(
  value: unknown,
  expectedKind?: ReportEntityKind,
): ReportEntityReferenceRow[] {
  const projection = 'report entity reference';
  return rows(value, projection).map((row) => {
    if (
      typeof row.entity_kind !== 'string'
      || !REPORT_ENTITY_KINDS.has(row.entity_kind as ReportEntityKind)
    ) {
      throw projectionError(projection, 'entity_kind');
    }
    const entityKind = row.entity_kind as ReportEntityKind;
    if (expectedKind && entityKind !== expectedKind) {
      throw projectionError(projection, 'entity_kind');
    }

    return {
      entity_kind: entityKind,
      entity_id: requiredUuid(row.entity_id, projection, 'entity_id'),
      primary_name: requiredString(
        row.primary_name,
        projection,
        'primary_name',
      ),
      secondary_name: nullableString(
        row.secondary_name,
        projection,
        'secondary_name',
      ),
      entity_type: requiredString(
        row.entity_type,
        projection,
        'entity_type',
      ),
      currency: currency(row.currency, projection, 'currency'),
      balance: finiteNumber(row.balance, projection, 'balance'),
    };
  });
}

export function reportEntityRowsToHesaplar(
  value: unknown,
  trustedIsletmeId: string,
): Hesap[] {
  return parseReportEntityReferenceRows(value, 'hesap').map((row) => {
    if (!ACCOUNT_TYPES.has(row.entity_type as HesapType)) {
      throw projectionError('report entity reference', 'entity_type');
    }
    return {
      id: row.entity_id,
      isletme_id: trustedIsletmeId,
      name: row.primary_name,
      type: row.entity_type as HesapType,
      currency: row.currency,
      balance: row.balance,
      initial_balance: 0,
      description: null,
      credit_limit: null,
      is_active: true,
      is_archived: false,
      card_last_four: null,
      card_network: null,
      payment_due_day: null,
      is_auto_created: false,
      created_by: null,
      updated_by: null,
      created_at: '',
      updated_at: '',
    };
  });
}

export function reportEntityRowsToCariler(
  value: unknown,
  trustedIsletmeId: string,
): Cari[] {
  return parseReportEntityReferenceRows(value, 'cari').map((row) => {
    if (!CARI_TYPES.has(row.entity_type as CariType)) {
      throw projectionError('report entity reference', 'entity_type');
    }
    return {
      id: row.entity_id,
      isletme_id: trustedIsletmeId,
      name: row.primary_name,
      type: row.entity_type as CariType,
      phone: null,
      email: null,
      address: null,
      tax_number: null,
      balance: row.balance,
      currency: row.currency,
      notes: null,
      is_active: true,
      is_archived: false,
      created_by: null,
      updated_by: null,
      created_at: '',
      updated_at: '',
    };
  });
}

export function reportEntityRowsToPersonel(
  value: unknown,
  trustedIsletmeId: string,
): Personel[] {
  return parseReportEntityReferenceRows(value, 'personel').map((row) => ({
    id: row.entity_id,
    isletme_id: trustedIsletmeId,
    first_name: row.primary_name,
    last_name: row.secondary_name,
    phone: null,
    position: null,
    salary: null,
    balance: row.balance,
    currency: row.currency,
    start_date: null,
    end_date: null,
    notes: null,
    is_active: true,
    is_archived: false,
    created_by: null,
    updated_by: null,
    created_at: '',
    updated_at: '',
  }));
}

export function parseCashFlowReportProjectionRows(
  value: unknown,
): CashFlowReportProjectionRow[] {
  const projection = 'cash flow report';
  return rows(value, projection).map((row) => {
    if (
      typeof row.flow_kind !== 'string'
      || !FLOW_KINDS.has(
        row.flow_kind as CashFlowReportProjectionRow['flow_kind'],
      )
    ) {
      throw projectionError(projection, 'flow_kind');
    }
    return {
      flow_kind:
        row.flow_kind as CashFlowReportProjectionRow['flow_kind'],
      kategori_id: nullableUuid(row.kategori_id, projection, 'kategori_id'),
      kategori_adi: nullableString(
        row.kategori_adi,
        projection,
        'kategori_adi',
      ),
      kategori_renk: nullableString(
        row.kategori_renk,
        projection,
        'kategori_renk',
      ),
      currency: currency(row.currency, projection, 'currency'),
      islem_count: nonNegativeInteger(
        row.islem_count,
        projection,
        'islem_count',
      ),
      total_amount: finiteNumber(
        row.total_amount,
        projection,
        'total_amount',
      ),
    };
  });
}

export function parseReportCategoryReferenceRows(
  value: unknown,
): ReportCategoryReferenceRow[] {
  const projection = 'report category reference';
  return rows(value, projection).map((row) => {
    if (
      typeof row.type !== 'string'
      || !CATEGORY_TYPES.has(
        row.type as Extract<KategoriType, 'gelir' | 'gider'>,
      )
    ) {
      throw projectionError(projection, 'type');
    }
    return {
      id: requiredUuid(row.id, projection, 'id'),
      name: requiredString(row.name, projection, 'name'),
      type: row.type as Extract<KategoriType, 'gelir' | 'gider'>,
      icon: nullableString(row.icon, projection, 'icon'),
      color: nullableString(row.color, projection, 'color'),
      parent_id: nullableUuid(row.parent_id, projection, 'parent_id'),
    };
  });
}

export function reportCategoryRowsToKategoriler(
  value: unknown,
  trustedIsletmeId: string,
): Kategori[] {
  return parseReportCategoryReferenceRows(value).map((row) => ({
    ...row,
    isletme_id: trustedIsletmeId,
    mapped_gelir_kategori_id: null,
    mapped_gider_kategori_id: null,
    is_active: true,
    created_by: null,
    updated_by: null,
    created_at: '',
  }));
}

export function parseCategoryReportTransactionRows(
  value: unknown,
  trustedIsletmeId: string,
): CategoryReportTransactionProjection[] {
  const projection = 'category report transaction';
  return rows(value, projection).map((row) => {
    const amountCurrency = currency(
      row.amount_currency,
      projection,
      'amount_currency',
    );
    const type = islemType(row.type, projection, 'type');
    const date = requiredString(row.date, projection, 'date');
    const createdAt =
      row.created_at === null
        ? date
        : requiredString(row.created_at, projection, 'created_at');
    const kategoriName = nullableString(
      row.kategori_name,
      projection,
      'kategori_name',
    );
    const sourceCurrency =
      row.source_currency === null
        ? amountCurrency
        : currency(row.source_currency, projection, 'source_currency');
    const targetCurrency =
      row.target_currency === null
        ? null
        : currency(row.target_currency, projection, 'target_currency');
    const categoryAmount =
      row.category_amount === null
        ? undefined
        : finiteNumber(
            row.category_amount,
            projection,
            'category_amount',
          );

    return {
      id: requiredUuid(row.id, projection, 'id'),
      isletme_id: trustedIsletmeId,
      type,
      amount: finiteNumber(row.amount, projection, 'amount'),
      description: nullableString(
        row.description,
        projection,
        'description',
      ),
      date,
      hesap_id: null,
      hedef_hesap_id: null,
      kategori_id: null,
      cari_id: null,
      personel_id: null,
      source_currency: sourceCurrency,
      target_currency: targetCurrency,
      exchange_rate:
        row.exchange_rate === null
          ? null
          : finiteNumber(row.exchange_rate, projection, 'exchange_rate'),
      photo_path: null,
      date_end: null,
      source_ileri_id: null,
      vade_tarihi: null,
      created_by: nullableUuid(
        row.created_by,
        projection,
        'created_by',
      ),
      updated_by: null,
      created_at: createdAt,
      updated_at:
        row.updated_at === null
          ? createdAt
          : requiredString(row.updated_at, projection, 'updated_at'),
      kategori:
        kategoriName === null
          ? null
          : ({
              id: '',
              isletme_id: trustedIsletmeId,
              name: kategoriName,
              type: 'gelir',
              icon: null,
              color: null,
              parent_id: null,
              mapped_gelir_kategori_id: null,
              mapped_gider_kategori_id: null,
              is_active: true,
              created_by: null,
              updated_by: null,
              created_at: '',
            } satisfies Kategori),
      _categoryAmount: categoryAmount,
      _reportAmountCurrency: amountCurrency,
    };
  });
}

export function parseReportTrendProjectionRows(
  value: unknown,
): ReportTrendProjectionRow[] {
  const projection = 'report trend';
  return rows(value, projection).map((row) => {
    const reportDate = requiredString(
      row.report_date,
      projection,
      'report_date',
    );
    if (!DATE_PATTERN.test(reportDate)) {
      throw projectionError(projection, 'report_date');
    }
    return {
      report_date: reportDate,
      type: islemType(row.type, projection, 'type'),
      currency: currency(row.currency, projection, 'currency'),
      total_amount: finiteNumber(
        row.total_amount,
        projection,
        'total_amount',
      ),
    };
  });
}
