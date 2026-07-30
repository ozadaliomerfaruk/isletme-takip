import {
  buildMutationFingerprint,
  isSameRegularCreate,
  isSameScheduledCreate,
} from '@/lib/mutationIdentity';
import type { IleriTarihliIslem, Islem } from '@/types/database';

const isletmeId = '11111111-1111-4111-8111-111111111111';
const regularId = '22222222-2222-4222-8222-222222222222';
const scheduledId = '33333333-3333-4333-8333-333333333333';

const regular = {
  id: regularId,
  isletme_id: isletmeId,
  type: 'gelir',
  amount: 125.25,
  description: 'Test',
  date: '2026-07-29T12:00:00.000Z',
  hesap_id: '44444444-4444-4444-8444-444444444444',
  hedef_hesap_id: null,
  kategori_id: null,
  cari_id: null,
  personel_id: null,
  source_currency: null,
  target_currency: null,
  exchange_rate: null,
  photo_path: null,
  date_end: null,
  source_ileri_id: null,
  vade_tarihi: null,
  created_by: null,
  updated_by: null,
  created_at: '2026-07-29T12:00:00.000Z',
  updated_at: '2026-07-29T12:00:00.000Z',
} as Islem;

const scheduled = {
  id: scheduledId,
  isletme_id: isletmeId,
  type: 'gider',
  amount: 40.01,
  description: null,
  scheduled_date: '2026-08-01',
  hesap_id: '55555555-5555-4555-8555-555555555555',
  hedef_hesap_id: null,
  kategori_id: null,
  cari_id: null,
  personel_id: null,
  status: 'pending',
  notified_at: null,
  created_by: null,
  updated_by: null,
  created_at: '2026-07-29T12:00:00.000Z',
  updated_at: '2026-07-29T12:00:00.000Z',
} as IleriTarihliIslem;

describe('mutation identity guards', () => {
  it('accepts only the same regular financial payload for a reused UUID', () => {
    const input = {
      id: regularId,
      type: regular.type,
      amount: regular.amount,
      description: regular.description,
      date: regular.date,
      hesap_id: regular.hesap_id,
      hedef_hesap_id: null,
      kategori_id: null,
      cari_id: null,
      personel_id: null,
      source_currency: null,
      target_currency: null,
      exchange_rate: null,
      photo_path: null,
      date_end: null,
      source_ileri_id: null,
      vade_tarihi: null,
    };

    expect(isSameRegularCreate(regular, input, isletmeId)).toBe(true);
    expect(
      isSameRegularCreate(regular, { ...input, amount: 125.26 }, isletmeId),
    ).toBe(false);
    expect(
      isSameRegularCreate(regular, { ...input, description: 'Changed' }, isletmeId),
    ).toBe(false);
  });

  it('recovers a scheduled 23505 only for the exact pending/notified row', () => {
    const input = {
      id: scheduledId,
      type: scheduled.type,
      amount: scheduled.amount,
      description: null,
      scheduled_date: scheduled.scheduled_date,
      hesap_id: scheduled.hesap_id,
      hedef_hesap_id: null,
      kategori_id: null,
      cari_id: null,
      personel_id: null,
    };

    expect(isSameScheduledCreate(scheduled, input, isletmeId)).toBe(true);
    expect(
      isSameScheduledCreate(
        { ...scheduled, status: 'notified' },
        input,
        isletmeId,
      ),
    ).toBe(true);
    expect(
      isSameScheduledCreate(
        { ...scheduled, status: 'completed' },
        input,
        isletmeId,
      ),
    ).toBe(false);
    expect(
      isSameScheduledCreate(scheduled, { ...input, amount: 40.02 }, isletmeId),
    ).toBe(false);
  });

  it('builds stable fingerprints and detects product-plan changes', () => {
    expect(buildMutationFingerprint({ b: 2, a: 1 })).toBe(
      buildMutationFingerprint({ a: 1, b: 2 }),
    );
    expect(
      buildMutationFingerprint({ items: [{ id: 'a', quantity: 1 }] }),
    ).not.toBe(
      buildMutationFingerprint({ items: [{ id: 'a', quantity: 2 }] }),
    );
  });
});
