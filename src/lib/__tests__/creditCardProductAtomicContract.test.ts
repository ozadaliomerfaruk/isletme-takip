import fs from 'node:fs';
import path from 'node:path';
import { isSameRegularCreate } from '@/lib/mutationIdentity';
import type { Islem, IslemInsert } from '@/types/database';

const source = fs.readFileSync(
  path.resolve(
    process.cwd(),
    'src/components/transaction/CreditCardTransactionBar/index.tsx',
  ),
  'utf8',
);

describe('credit-card product expense atomic contract', () => {
  it('creates the financial row, balance and every stock movement in one RPC', () => {
    expect(source).toContain('useCreateIslemWithUrun');
    expect(source).toContain('createIslemWithUrun.mutateAsync({');
    expect(source).toContain("hareket_tipi: 'giris' as const");
    expect(source).not.toContain('useCreateUrunHareket');
    expect(source).not.toContain('createUrunHareketlerKK');
    expect(source).not.toContain('transactions:messages.urunMovementFailed');
  });

  it('uses one stable UUID for every create and probes an unknown regular outcome', () => {
    expect(source).toContain('createMutationIdRef');
    expect(source).toContain('createMutationFingerprintRef');
    expect(source).toContain('buildMutationFingerprint({');
    expect(source).toContain('Crypto.randomUUID()');
    expect(source).toContain('id: clientMutationId');
    expect(source).toContain(
      "classifyMutationError(rpcError) !== 'network_unknown'",
    );
    expect(source).toContain('probeCreatedCreditCardTransaction(');
    expect(source).toContain('isSameRegularCreate(');
    expect(source).toContain('new MutationRetryPayloadChangedError()');
    expect(source).toContain("kind: 'scheduled'");
    expect(source).toContain("kind: 'regular'");
  });

  it('accepts the account currencies derived by the server in its product probe', () => {
    const isletmeId = '11111111-1111-4111-8111-111111111111';
    const id = '22222222-2222-4222-8222-222222222222';
    const expected = {
      id,
      type: 'gider',
      amount: 100,
      description: null,
      hesap_id: '33333333-3333-4333-8333-333333333333',
      hedef_hesap_id: null,
      kategori_id: null,
      cari_id: null,
      personel_id: null,
      date: '2026-07-30T12:00:00.000Z',
    } as Omit<IslemInsert, 'isletme_id'>;
    const landed = {
      ...expected,
      isletme_id: isletmeId,
      source_currency: 'TRY',
      target_currency: 'TRY',
      exchange_rate: null,
    } as Islem;

    expect(isSameRegularCreate(landed, expected, isletmeId)).toBe(true);
  });

  it('never silently drops products from a scheduled transaction', () => {
    expect(source).toContain('isScheduled && hasProductExpense');
    expect(source).toContain(
      "t('transactions:validation.scheduledNoProductsMessage')",
    );
    expect(source).toContain('&& !isScheduled;');
    expect(source).toContain(
      'visible={showUrunPicker && canUseProducts && !isScheduled}',
    );
  });

  it('keeps non-product credit-card transactions on the existing path', () => {
    expect(source).toContain(
      'newIslem = await createIslem.mutateAsync(islemData);',
    );
    expect(source).toContain(
      'kategori_id: hasProductExpense ? null : kategoriId',
    );
  });

  it('uses the credit-card account currency for product display and inline create', () => {
    expect(source).toContain('currency={creditCard.currency}');
    expect(source).toContain('currency: creditCard.currency');
    expect(source).not.toContain('currency={userCurrency}');
    expect(source).not.toContain('currency: userCurrency');
  });

  it('locks both direct save and exchange confirmation synchronously', () => {
    expect(source).toContain('const submitInFlightRef = useRef(false);');
    expect(source.match(/if \(submitInFlightRef\.current\) return;/g)).toHaveLength(3);
    expect(source.match(/submitInFlightRef\.current = true;/g)).toHaveLength(2);
    expect(source.match(/submitInFlightRef\.current = false;/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source).toContain('await persistIslem(sourceAmount, {');
    expect(source).toContain('await persistIslem(parsedAmount);');
  });

  it('never starts a photo upload for a shared user', () => {
    expect(source).toContain(
      'if (isOwner && photoUri && isletme?.id && newIslem?.id)',
    );
    expect(source).toMatch(
      /\{isOwner && \(\s*<PhotoButton/,
    );
  });
});
