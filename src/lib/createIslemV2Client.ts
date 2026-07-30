import type { Islem, IslemInsert, IslemType } from '@/types/database';
import { roundCurrency } from '@/lib/currency';

export type CreateIslemV2Input = Omit<
  IslemInsert,
  'isletme_id' | 'id' | 'date'
> & {
  id: string;
  date: string;
  hedef_islem_id?: string | null;
};

export type CreateIslemV2CariScope =
  | 'not_applicable'
  | 'same_tenant'
  | 'linked'
  | 'unknown';

export type CreateIslemV2Result = Islem & {
  hedef_islem_id: string | null;
};

const SUPPORTED_TYPES = new Set<string>([
  'gelir',
  'gider',
  'transfer',
  'cari_alis',
  'cari_satis',
  'cari_alis_iade',
  'cari_satis_iade',
  'cari_odeme',
  'cari_tahsilat',
  'personel_gider',
  'personel_satis',
  'personel_izin_hakki',
  'personel_izin_kullanimi',
  'personel_odeme',
  'personel_tahsilat',
]);

const BASE_V2_CREATE_TYPES = new Set<string>([
  'gelir',
  'gider',
  'transfer',
]);

const SCOPED_ENTITY_V2_CREATE_TYPES = new Set<string>([
  'cari_alis',
  'cari_satis',
  'cari_alis_iade',
  'cari_satis_iade',
  'cari_odeme',
  'cari_tahsilat',
  'personel_gider',
  'personel_satis',
  'personel_izin_hakki',
  'personel_izin_kullanimi',
  'personel_odeme',
  'personel_tahsilat',
]);

/**
 * Keeps the V2 rollout explicit. Existing base flows stay opted in; Cari and
 * Personel types use V2 only from a known same-tenant scoped create surface.
 * Linked-cari writes remain on their inversion-aware legacy endpoint.
 */
export function shouldUseCreateIslemV2({
  type,
  isViewer,
  scopedSameTenant,
}: {
  type: unknown;
  isViewer: boolean;
  scopedSameTenant: boolean;
}): boolean {
  if (isViewer || typeof type !== 'string') return false;
  if (BASE_V2_CREATE_TYPES.has(type)) return true;
  return scopedSameTenant && SCOPED_ENTITY_V2_CREATE_TYPES.has(type);
}

const ALLOWED_PAYLOAD_KEYS = [
  'id',
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
  'photo_path',
  'date_end',
  'source_ileri_id',
  'vade_tarihi',
  'hedef_islem_id',
] as const;

/**
 * V2 is an opt-in first slice. Callers without a stable client UUID, linked-cari
 * writes and server-excluded subwrites stay on their existing atomic endpoint.
 */
export function buildCreateIslemV2Payload(
  input: CreateIslemV2Input,
  cariScope: CreateIslemV2CariScope,
): Record<string, unknown> | null {
  const normalizedAmount =
    typeof input.amount === 'number' && Number.isFinite(input.amount)
      ? roundCurrency(input.amount)
      : Number.NaN;
  const normalizedExchangeRate =
    input.exchange_rate == null
      ? input.exchange_rate
      : typeof input.exchange_rate === 'number'
          && Number.isFinite(input.exchange_rate)
        ? Number(input.exchange_rate.toFixed(8))
        : Number.NaN;

  if (
    typeof input.id !== 'string'
    || input.id.length === 0
    || typeof input.date !== 'string'
    || input.date.length === 0
    || !SUPPORTED_TYPES.has(String(input.type))
    || !Number.isFinite(normalizedAmount)
    || normalizedAmount <= 0
    || (
      normalizedExchangeRate != null
      && (
        !Number.isFinite(normalizedExchangeRate)
        || normalizedExchangeRate <= 0
      )
    )
    || input.photo_path != null
    || input.source_ileri_id != null
  ) {
    return null;
  }

  if (
    input.cari_id != null
    && String(input.type).startsWith('cari_')
    && cariScope !== 'same_tenant'
  ) {
    return null;
  }

  const source = input as Record<string, unknown>;
  const payload: Record<string, unknown> = {};
  for (const key of ALLOWED_PAYLOAD_KEYS) {
    const value = source[key];
    if (value !== undefined) {
      payload[key] =
        key === 'amount'
          ? normalizedAmount
          : key === 'exchange_rate'
            ? normalizedExchangeRate
            : value;
    }
  }
  return payload;
}

function invalidResponse(): Error & { code: string } {
  const error = new Error('ISLEM_V2_INVALID_RESPONSE') as Error & {
    code: string;
  };
  error.code = 'ISLEM_V2_INVALID_RESPONSE';
  return error;
}

function nullableString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') throw invalidResponse();
  return value;
}

/**
 * PostgREST returns a RETURNS TABLE RPC as an array. Normalize its deliberately
 * narrow projection to the transient Islem shape expected by existing callers.
 */
export function parseCreateIslemV2Response(
  data: unknown,
  isletmeId: string,
  expectedId: string,
): CreateIslemV2Result {
  const row = Array.isArray(data)
    ? data.length === 1
      ? data[0]
      : null
    : data;

  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw invalidResponse();
  }

  const value = row as Record<string, unknown>;
  const amount = Number(value.amount);
  const exchangeRate =
    value.exchange_rate == null ? null : Number(value.exchange_rate);

  if (
    typeof value.id !== 'string'
    || value.id !== expectedId
    || typeof value.type !== 'string'
    || !SUPPORTED_TYPES.has(value.type)
    || !Number.isFinite(amount)
    || amount <= 0
    || typeof value.date !== 'string'
    || typeof value.created_at !== 'string'
    || (exchangeRate !== null && !Number.isFinite(exchangeRate))
  ) {
    throw invalidResponse();
  }

  return {
    id: value.id,
    isletme_id: isletmeId,
    type: value.type as IslemType,
    amount,
    description: nullableString(value.description),
    date: value.date,
    hesap_id: nullableString(value.hesap_id),
    hedef_hesap_id: nullableString(value.hedef_hesap_id),
    kategori_id: nullableString(value.kategori_id),
    cari_id: nullableString(value.cari_id),
    personel_id: nullableString(value.personel_id),
    source_currency: nullableString(value.source_currency),
    target_currency: nullableString(value.target_currency),
    exchange_rate: exchangeRate,
    photo_path: null,
    date_end: nullableString(value.date_end),
    source_ileri_id: null,
    vade_tarihi: nullableString(value.vade_tarihi),
    hedef_islem_id: nullableString(value.hedef_islem_id),
    created_by: nullableString(value.created_by),
    updated_by: null,
    created_at: value.created_at,
    // The RPC intentionally omits updated_at. A freshly inserted/no-op idempotent
    // create is only consumed transiently; persisted reads fetch the real value.
    updated_at: value.created_at,
  };
}
