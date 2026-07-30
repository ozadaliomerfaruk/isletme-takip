import {
  buildCreateIslemV2Payload,
  parseCreateIslemV2Response,
  shouldUseCreateIslemV2,
  type CreateIslemV2Input,
} from '@/lib/createIslemV2Client';

const input: CreateIslemV2Input = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'gelir',
  amount: 125.5,
  description: 'Test',
  date: '2026-07-29T12:00:00+03:00',
  hesap_id: '22222222-2222-4222-8222-222222222222',
};

describe('createIslemV2 client boundary', () => {
  it.each([
    ['gelir', false, false, true],
    ['gider', false, false, true],
    ['transfer', false, false, true],
    ['cari_alis', false, true, true],
    ['personel_odeme', false, true, true],
    ['cari_alis', false, false, false],
    ['cari_alis', true, true, false],
    ['future_type', false, true, false],
  ] as const)(
    'routes type=%s viewer=%s scoped=%s to V2=%s',
    (type, isViewer, scopedSameTenant, expected) => {
      expect(
        shouldUseCreateIslemV2({
          type,
          isViewer,
          scopedSameTenant,
        }),
      ).toBe(expected);
    },
  );

  it('projects a stable normal-create input to the server allowlist', () => {
    expect(
      buildCreateIslemV2Payload(
        {
          ...input,
          // A runtime caller may carry an accidental extra key; it must not cross
          // the SECURITY DEFINER JSON boundary.
          unexpected: 'secret',
        } as CreateIslemV2Input,
        'not_applicable',
      ),
    ).toEqual(input);
  });

  it.each([
    [{ ...input, id: undefined }, 'not_applicable'],
    [{ ...input, date: undefined }, 'not_applicable'],
    [{ ...input, photo_path: 'business/transaction_1.webp' }, 'not_applicable'],
    [{ ...input, source_ileri_id: '33333333-3333-4333-8333-333333333333' }, 'not_applicable'],
    [{ ...input, type: 'kredi_karti_gider' }, 'not_applicable'],
    [
      {
        ...input,
        type: 'cari_satis',
        hesap_id: null,
        cari_id: '44444444-4444-4444-8444-444444444444',
      },
      'linked',
    ],
  ] as const)('keeps unsupported/legacy candidate %j on the existing endpoint', (candidate, scope) => {
    expect(
      buildCreateIslemV2Payload(
        candidate as CreateIslemV2Input,
        scope,
      ),
    ).toBeNull();
  });

  it('allows a same-tenant cari create and keeps the target-invoice pointer', () => {
    const payload = buildCreateIslemV2Payload(
      {
        ...input,
        type: 'cari_tahsilat',
        hesap_id: '22222222-2222-4222-8222-222222222222',
        cari_id: '44444444-4444-4444-8444-444444444444',
        hedef_islem_id: '55555555-5555-4555-8555-555555555555',
      },
      'same_tenant',
    );

    expect(payload).toMatchObject({
      type: 'cari_tahsilat',
      hedef_islem_id: '55555555-5555-4555-8555-555555555555',
    });
  });

  it('normalizes money to cents and exchange rates to the server precision', () => {
    expect(
      buildCreateIslemV2Payload(
        {
          ...input,
          amount: 125.555,
          source_currency: 'TRY',
          target_currency: 'USD',
          exchange_rate: 0.1234567894,
        },
        'not_applicable',
      ),
    ).toMatchObject({
      amount: 125.56,
      exchange_rate: 0.12345679,
    });
  });

  it.each([
    { amount: Number.NaN },
    { amount: Number.POSITIVE_INFINITY },
    { amount: 0.004 },
    { exchange_rate: Number.NaN },
    { exchange_rate: Number.POSITIVE_INFINITY },
    { exchange_rate: -1 },
    { exchange_rate: 0.000000001 },
  ])('rejects a non-canonical numeric payload before the RPC: %j', (patch) => {
    expect(
      buildCreateIslemV2Payload(
        { ...input, ...patch },
        'not_applicable',
      ),
    ).toBeNull();
  });

  it('unwraps the fixed RETURNS TABLE projection without inventing balances', () => {
    const parsed = parseCreateIslemV2Response(
      [
        {
          id: input.id,
          type: input.type,
          amount: input.amount,
          description: input.description,
          date: input.date,
          hesap_id: input.hesap_id,
          hedef_hesap_id: null,
          kategori_id: null,
          cari_id: null,
          personel_id: null,
          source_currency: 'TRY',
          target_currency: 'TRY',
          exchange_rate: null,
          date_end: null,
          vade_tarihi: null,
          hedef_islem_id: null,
          created_at: '2026-07-29T09:00:00Z',
          created_by: '66666666-6666-4666-8666-666666666666',
        },
      ],
      '77777777-7777-4777-8777-777777777777',
      input.id!,
    );

    expect(parsed).toMatchObject({
      id: input.id,
      isletme_id: '77777777-7777-4777-8777-777777777777',
      source_currency: 'TRY',
      photo_path: null,
      source_ileri_id: null,
    });
    expect(parsed).not.toHaveProperty('balance');
  });

  it.each([null, [], [{ id: 'only-id' }], [{ ...input }, { ...input }]])(
    'rejects malformed response %j',
    (response) => {
      expect(() =>
        parseCreateIslemV2Response(
          response,
          '77777777-7777-4777-8777-777777777777',
          input.id!,
        ),
      ).toThrow('ISLEM_V2_INVALID_RESPONSE');
    },
  );

  it('rejects a response carrying a different idempotency key', () => {
    expect(() =>
      parseCreateIslemV2Response(
        [
          {
            id: '88888888-8888-4888-8888-888888888888',
            type: 'gelir',
            amount: 10,
            date: input.date,
            created_at: '2026-07-29T09:00:00Z',
          },
        ],
        '77777777-7777-4777-8777-777777777777',
        input.id!,
      ),
    ).toThrow('ISLEM_V2_INVALID_RESPONSE');
  });
});
