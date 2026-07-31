jest.mock('@/hooks/useSettings', () => ({
  getCurrentCurrency: () => ({ code: 'TRY', symbol: '₺', locale: 'tr-TR' }),
  getCurrentDateFormat: () => ({ code: 'DMY', example: '31/12/2024', separator: '/' }),
}));

jest.mock('i18next', () => ({
  t: (key: string) => key,
  language: 'tr',
}));

import {
  amountToCents,
  buildInstallmentPlan,
  distributeInstallmentCents,
  InstallmentDistributionResult,
  InstallmentPlanBuildResult,
  serializeInstallmentPlan,
  validateInstallmentPlan,
} from '../installmentDistribution';

function expectSuccess(result: InstallmentDistributionResult): number[] {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`Beklenmeyen dağıtım hatası: ${result.error.code}`);
  }
  return result.amountsCents;
}

function expectError(
  result: InstallmentDistributionResult,
  code: Extract<InstallmentDistributionResult, { ok: false }>['error']['code']
): void {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error(`Dağıtımın ${code} hatasıyla reddedilmesi bekleniyordu.`);
  }
  expect(result.error.code).toBe(code);
  expect(result.error.message.length).toBeGreaterThan(0);
}

function expectPlanSuccess(result: InstallmentPlanBuildResult) {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`Beklenmeyen plan hatası: ${result.error.code}`);
  }
  return result.plan;
}

describe('distributeInstallmentCents', () => {
  describe('amountToCents', () => {
    it('para tutarını IEEE-754 sınırında doğru integer kuruşa yuvarlar', () => {
      expect(amountToCents(64_524.88)).toBe(6_452_488);
      expect(amountToCents(1.005)).toBe(101);
      expect(amountToCents(0)).toBeNull();
      expect(amountToCents(Number.NaN)).toBeNull();
    });
  });

  describe('varsayılan dağıtım', () => {
    it('64.524,88 TL / 10 için mevcut 9 eşit + son kuruş farkı davranışını korur', () => {
      const amounts = expectSuccess(
        distributeInstallmentCents({ totalCents: 6_452_488, count: 10 })
      );

      expect(amounts).toEqual([
        645_249,
        645_249,
        645_249,
        645_249,
        645_249,
        645_249,
        645_249,
        645_249,
        645_249,
        645_247,
      ]);
    });

    it('10.000 kuruşu üç taksite tam ve deterministik dağıtır', () => {
      expect(
        expectSuccess(distributeInstallmentCents({ totalCents: 10_000, count: 3 }))
      ).toEqual([3_333, 3_333, 3_334]);
    });

    it('tam bölünen 30 kuruşu eşit dağıtır', () => {
      expect(expectSuccess(distributeInstallmentCents({ totalCents: 30, count: 3 }))).toEqual([
        10, 10, 10,
      ]);
    });

    it('yuvarlama son satırı geçersiz yapacaksa taban + soldan kalan yöntemine geçer', () => {
      const amounts = expectSuccess(
        distributeInstallmentCents({ totalCents: 120, count: 48 })
      );

      expect(amounts.slice(0, 24)).toEqual(new Array(24).fill(3));
      expect(amounts.slice(24)).toEqual(new Array(24).fill(2));
      expect(amounts.reduce((sum, value) => sum + value, 0)).toBe(120);
    });
  });

  describe('satır düzenleme ve kilitleme', () => {
    it('ilk satır 645.247 kuruşa sabitlenince kalan dokuz satırı eşitler', () => {
      const amounts = expectSuccess(
        distributeInstallmentCents({
          totalCents: 6_452_488,
          count: 10,
          lockedRows: [{ index: 0, amountCents: 645_247 }],
        })
      );

      expect(amounts).toEqual([645_247, ...new Array(9).fill(645_249)]);
    });

    it('birden fazla sabit satırdan sonra kalanı soldan deterministik dağıtır', () => {
      const amounts = expectSuccess(
        distributeInstallmentCents({
          totalCents: 100,
          count: 5,
          lockedRows: [
            { index: 1, amountCents: 10 },
            { index: 3, amountCents: 25 },
          ],
        })
      );

      expect(amounts).toEqual([22, 10, 22, 25, 21]);
    });

    it('tüm satırlar sabit ve toplam eşitse planı kabul eder', () => {
      expect(
        expectSuccess(
          distributeInstallmentCents({
            totalCents: 30,
            count: 3,
            lockedRows: [
              { index: 0, amountCents: 9 },
              { index: 1, amountCents: 10 },
              { index: 2, amountCents: 11 },
            ],
          })
        )
      ).toEqual([9, 10, 11]);
    });

    it('sabit toplam ana tutarı aşarsa reddeder', () => {
      expectError(
        distributeInstallmentCents({
          totalCents: 100,
          count: 3,
          lockedRows: [{ index: 0, amountCents: 101 }],
        }),
        'LOCKED_TOTAL_TOO_HIGH'
      );
    });

    it('sabit tutardan sonra açık satırlara birer kuruş kalmıyorsa reddeder', () => {
      expectError(
        distributeInstallmentCents({
          totalCents: 100,
          count: 3,
          lockedRows: [{ index: 0, amountCents: 99 }],
        }),
        'INSUFFICIENT_REMAINDER'
      );
    });

    it('sıfır veya negatif sabit satırı reddeder', () => {
      expectError(
        distributeInstallmentCents({
          totalCents: 30,
          count: 3,
          lockedRows: [{ index: 0, amountCents: 0 }],
        }),
        'INVALID_LOCKED_AMOUNT'
      );
      expectError(
        distributeInstallmentCents({
          totalCents: 30,
          count: 3,
          lockedRows: [{ index: 0, amountCents: -1 }],
        }),
        'INVALID_LOCKED_AMOUNT'
      );
    });

    it('tüm satırlar sabitken toplam uyuşmazlığını reddeder', () => {
      expectError(
        distributeInstallmentCents({
          totalCents: 30,
          count: 3,
          lockedRows: [
            { index: 0, amountCents: 10 },
            { index: 1, amountCents: 10 },
            { index: 2, amountCents: 9 },
          ],
        }),
        'LOCKED_PLAN_TOTAL_MISMATCH'
      );
    });

    it('aynı satırın iki kez sabitlenmesini reddeder', () => {
      expectError(
        distributeInstallmentCents({
          totalCents: 30,
          count: 3,
          lockedRows: [
            { index: 1, amountCents: 10 },
            { index: 1, amountCents: 10 },
          ],
        }),
        'DUPLICATE_LOCKED_ROW'
      );
    });
  });

  describe('sınırlar ve invariantlar', () => {
    it('5 kuruş / 12 taksiti her satır pozitif olamayacağı için reddeder', () => {
      expectError(
        distributeInstallmentCents({ totalCents: 5, count: 12 }),
        'TOTAL_TOO_SMALL'
      );
    });

    it('12 kuruş / 12 taksiti kabul edip her satıra 1 kuruş verir', () => {
      expect(
        expectSuccess(distributeInstallmentCents({ totalCents: 12, count: 12 }))
      ).toEqual(new Array(12).fill(1));
    });

    it('1 ve 121 taksit sayılarını reddeder (üst sınır 120)', () => {
      expectError(
        distributeInstallmentCents({ totalCents: 100, count: 1 }),
        'INVALID_INSTALLMENT_COUNT'
      );
      expectError(
        distributeInstallmentCents({ totalCents: 200, count: 121 }),
        'INVALID_INSTALLMENT_COUNT'
      );
      // 49..120 artık geçerli: eski üst sınırın hemen üstü ve yeni tavan.
      expectSuccess(distributeInstallmentCents({ totalCents: 10_000, count: 49 }));
      expectSuccess(distributeInstallmentCents({ totalCents: 10_000, count: 120 }));
    });

    it('2..120 aralığında toplam >= adet olan örneklerin hepsini pozitif ve tam toplam üretir', () => {
      for (let count = 2; count <= 120; count += 1) {
        const totals = [count, count + 1, count * 2 - 1, count * 3 + 2, 10_000 + count];

        for (const totalCents of totals) {
          const first = expectSuccess(
            distributeInstallmentCents({ totalCents, count })
          );
          const second = expectSuccess(
            distributeInstallmentCents({ totalCents, count })
          );

          expect(first).toEqual(second);
          expect(first).toHaveLength(count);
          expect(first.every((amount) => Number.isSafeInteger(amount) && amount >= 1)).toBe(
            true
          );
          expect(first.reduce((sum, amount) => sum + amount, 0)).toBe(totalCents);
        }
      }
    });
  });

  describe('committed önizleme ve RPC satırları', () => {
    it('31 Ocak başlangıcını Şubat sonu ve 31 Mart olarak üretir', () => {
      const plan = expectPlanSuccess(
        buildInstallmentPlan(30_000, 3, new Date(2026, 0, 31))
      );

      expect(plan.rows).toEqual([
        { sira: 1, vade_tarihi: '2026-01-31', tutar: 100 },
        { sira: 2, vade_tarihi: '2026-02-28', tutar: 100 },
        { sira: 3, vade_tarihi: '2026-03-31', tutar: 100 },
      ]);
    });

    it('önizleme satırlarını RPC için yeniden hesaplamadan deep-equal döndürür', () => {
      const plan = expectPlanSuccess(
        buildInstallmentPlan(
          6_452_488,
          10,
          new Date(2026, 6, 6),
          [{ index: 0, amountCents: 645_247 }]
        )
      );
      const serialized = serializeInstallmentPlan(plan, 6_452_488);

      expect(serialized.ok).toBe(true);
      if (!serialized.ok) throw new Error(serialized.error.code);
      expect(serialized.rows).toEqual(plan.rows);
      expect(serialized.rows).toBe(plan.rows);
      expect(serialized.rows[0]).toBe(plan.rows[0]);
      expect(serialized.rows.map((row) => row.tutar)).toEqual([
        6_452.47,
        ...new Array(9).fill(6_452.49),
      ]);
    });

    it('form toplamı önizlemeden sonra değiştiyse stale planı reddeder', () => {
      const plan = expectPlanSuccess(
        buildInstallmentPlan(10_000, 3, new Date(2026, 0, 15))
      );
      const result = serializeInstallmentPlan(plan, 10_001);

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Stale planın reddedilmesi bekleniyordu.');
      expect(result.error.code).toBe('STALE_TOTAL_CENTS');
    });

    it('işlem tarihi ilk vadeyi geçerse committed planı reddeder', () => {
      const plan = expectPlanSuccess(
        buildInstallmentPlan(10_000, 3, new Date(2026, 0, 15))
      );

      const sameDay = validateInstallmentPlan(
        plan,
        10_000,
        new Date(2026, 0, 15, 23, 59)
      );
      expect(sameDay.ok).toBe(true);

      const staleDate = validateInstallmentPlan(
        plan,
        10_000,
        new Date(2026, 0, 16)
      );
      expect(staleDate.ok).toBe(false);
      if (staleDate.ok) {
        throw new Error('İşlem tarihinden önce kalan vadenin reddedilmesi bekleniyordu.');
      }
      expect(staleDate.error.code).toBe('FIRST_DUE_BEFORE_TRANSACTION_DATE');
    });

    it('önizleme satırındaki tutar, tarih veya sıra sonradan değişirse reddeder', () => {
      const amountPlan = expectPlanSuccess(
        buildInstallmentPlan(10_000, 3, new Date(2026, 0, 15))
      );
      amountPlan.rows[0].tutar = 99;
      const amountResult = validateInstallmentPlan(amountPlan, 10_000);
      expect(amountResult.ok).toBe(false);
      if (amountResult.ok) throw new Error('Bozuk tutarın reddedilmesi bekleniyordu.');
      expect(amountResult.error.code).toBe('PLAN_ROW_AMOUNT_MISMATCH');

      const datePlan = expectPlanSuccess(
        buildInstallmentPlan(10_000, 3, new Date(2026, 0, 15))
      );
      datePlan.rows[1].vade_tarihi = '2026-02-16';
      const dateResult = validateInstallmentPlan(datePlan, 10_000);
      expect(dateResult.ok).toBe(false);
      if (dateResult.ok) throw new Error('Bozuk tarihin reddedilmesi bekleniyordu.');
      expect(dateResult.error.code).toBe('PLAN_ROW_DATE_MISMATCH');

      const sequencePlan = expectPlanSuccess(
        buildInstallmentPlan(10_000, 3, new Date(2026, 0, 15))
      );
      sequencePlan.rows[0].sira = 2;
      const sequenceResult = validateInstallmentPlan(sequencePlan, 10_000);
      expect(sequenceResult.ok).toBe(false);
      if (sequenceResult.ok) throw new Error('Bozuk sıranın reddedilmesi bekleniyordu.');
      expect(sequenceResult.error.code).toBe('PLAN_ROW_SEQUENCE_MISMATCH');
    });

    it('geçersiz ilk vade ile plan kurmaz', () => {
      const result = buildInstallmentPlan(10_000, 3, new Date('invalid'));

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Geçersiz tarihin reddedilmesi bekleniyordu.');
      expect(result.error.code).toBe('INVALID_FIRST_DUE_DATE');
    });
  });
});
