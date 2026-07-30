import { roundCurrency } from '@/lib/currency';
import type {
  IleriTarihliIslem,
  IleriTarihliIslemInsert,
  Islem,
  IslemInsert,
} from '@/types/database';

type RegularCreateInput = Omit<IslemInsert, 'isletme_id'>;
type ScheduledCreateInput = Omit<IleriTarihliIslemInsert, 'isletme_id'>;

const nullable = (value: unknown) => value ?? null;
const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

function sameDateTime(actual: unknown, expected: unknown): boolean {
  const actualMs = new Date(String(actual)).getTime();
  const expectedMs = new Date(String(expected)).getTime();
  return Number.isFinite(actualMs)
    && Number.isFinite(expectedMs)
    && actualMs === expectedMs;
}

function sameDate(actual: unknown, expected: unknown): boolean {
  return String(actual).slice(0, 10) === String(expected).slice(0, 10);
}

/**
 * An idempotent create RPC may return the row written by an earlier request with the
 * same client UUID. Treat that as success only when its financial payload is identical.
 */
export function isSameRegularCreate(
  existing: Islem,
  input: RegularCreateInput,
  isletmeId: string,
): boolean {
  if (existing.isletme_id !== isletmeId) return false;
  if (input.id && existing.id !== input.id) return false;
  if (existing.type !== input.type) return false;
  if (roundCurrency(Number(existing.amount)) !== roundCurrency(Number(input.amount))) {
    return false;
  }
  if (nullable(existing.description) !== nullable(input.description)) return false;
  if (input.date !== undefined && !sameDateTime(existing.date, input.date)) return false;
  if (nullable(existing.hesap_id) !== nullable(input.hesap_id)) return false;
  if (nullable(existing.hedef_hesap_id) !== nullable(input.hedef_hesap_id)) return false;
  if (nullable(existing.kategori_id) !== nullable(input.kategori_id)) return false;
  if (nullable(existing.cari_id) !== nullable(input.cari_id)) return false;
  if (nullable(existing.personel_id) !== nullable(input.personel_id)) return false;
  // V2 create motoru kurları kilitli entity satırlarından türetir. Legacy/client
  // payload alanı hiç göndermediyse DB'nin canonical değerini assertion sayma;
  // alan açıkça gönderildiyse null dahil birebir eşleşme zorunlu kalır.
  if (
    hasOwn(input, 'source_currency')
    && nullable(existing.source_currency) !== nullable(input.source_currency)
  ) return false;
  if (
    hasOwn(input, 'target_currency')
    && nullable(existing.target_currency) !== nullable(input.target_currency)
  ) return false;
  if (nullable(existing.photo_path) !== nullable(input.photo_path)) return false;
  if (nullable(existing.source_ileri_id) !== nullable(input.source_ileri_id)) return false;

  const actualRate = existing.exchange_rate;
  const expectedRate = input.exchange_rate;
  if (actualRate == null || expectedRate == null) {
    if (nullable(actualRate) !== nullable(expectedRate)) return false;
  } else if (Math.abs(Number(actualRate) - Number(expectedRate)) > 1e-9) {
    return false;
  }

  if (
    input.date_end !== undefined
    && nullable(existing.date_end) !== null
    && !sameDate(existing.date_end, input.date_end)
  ) {
    return false;
  }
  if (
    input.date_end !== undefined
    && nullable(existing.date_end) === null
    && nullable(input.date_end) !== null
  ) {
    return false;
  }
  if (
    input.vade_tarihi !== undefined
    && nullable(existing.vade_tarihi) !== null
    && !sameDate(existing.vade_tarihi, input.vade_tarihi)
  ) {
    return false;
  }
  if (
    input.vade_tarihi !== undefined
    && nullable(existing.vade_tarihi) === null
    && nullable(input.vade_tarihi) !== null
  ) {
    return false;
  }

  return true;
}

/**
 * A 23505 retry for a scheduled row is idempotent only if the existing row is the
 * exact pending/notified transaction that this client attempted to create.
 */
export function isSameScheduledCreate(
  existing: IleriTarihliIslem,
  input: ScheduledCreateInput,
  isletmeId: string,
): boolean {
  return existing.isletme_id === isletmeId
    && (!input.id || existing.id === input.id)
    && (existing.status === 'pending' || existing.status === 'notified')
    && existing.type === input.type
    && roundCurrency(Number(existing.amount)) === roundCurrency(Number(input.amount))
    && nullable(existing.description) === nullable(input.description)
    && sameDate(existing.scheduled_date, input.scheduled_date)
    && nullable(existing.hesap_id) === nullable(input.hesap_id)
    && nullable(existing.hedef_hesap_id) === nullable(input.hedef_hesap_id)
    && nullable(existing.kategori_id) === nullable(input.kategori_id)
    && nullable(existing.cari_id) === nullable(input.cari_id)
    && nullable(existing.personel_id) === nullable(input.personel_id);
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, canonicalize(entryValue)]),
    );
  }
  return value;
}

export function buildMutationFingerprint(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
