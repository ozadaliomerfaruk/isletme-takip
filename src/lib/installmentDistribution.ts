/**
 * Taksit tutarlarını yalnız integer kuruşlarla dağıtan saf motor.
 *
 * Para değerini bu katmana gelmeden önce kuruşa çevirmek çağıranın
 * sorumluluğundadır. Böylece IEEE-754 ondalık sapmaları taksit toplamına
 * taşınmaz ve üretilen planın toplamı her zaman ana tutara eşit kalır.
 */

import { addMonths, formatDateForDB } from './date';

export const MIN_INSTALLMENT_COUNT = 2;
export const MAX_INSTALLMENT_COUNT = 120;

export interface LockedInstallmentRow {
  /** Sıfır tabanlı taksit satırı. */
  index: number;
  /** Kullanıcının sabitlediği pozitif integer kuruş tutarı. */
  amountCents: number;
}

export interface InstallmentDateOverride {
  /** Sıfır tabanlı taksit satırı. */
  index: number;
  /** Kullanıcının elle seçtiği vade, YYYY-MM-DD (DB formatı). */
  dueDate: string;
}

export interface InstallmentDistributionInput {
  /** Dağıtılacak toplam tutar, integer kuruş. */
  totalCents: number;
  /** Taksit sayısı (2..120). */
  count: number;
  /**
   * Kullanıcının elle düzenleyip sabitlediği satırlar.
   *
   * Sabitlenmeyen tutar, kalan satırlara taban bölme + soldan birer kuruş
   * yöntemiyle deterministik olarak dağıtılır.
   */
  lockedRows?: ReadonlyArray<LockedInstallmentRow>;
}

export type InstallmentDistributionErrorCode =
  | 'INVALID_INSTALLMENT_COUNT'
  | 'INVALID_TOTAL_CENTS'
  | 'TOTAL_TOO_SMALL'
  | 'INVALID_LOCKED_ROW_INDEX'
  | 'DUPLICATE_LOCKED_ROW'
  | 'INVALID_LOCKED_AMOUNT'
  | 'LOCKED_TOTAL_TOO_HIGH'
  | 'INSUFFICIENT_REMAINDER'
  | 'LOCKED_PLAN_TOTAL_MISMATCH'
  | 'DISTRIBUTION_INVARIANT_FAILED';

export interface InstallmentDistributionError {
  code: InstallmentDistributionErrorCode;
  /** Kullanıcıya gösterilebilecek Türkçe açıklama. */
  message: string;
  rowIndex?: number;
}

export type InstallmentDistributionResult =
  | {
      ok: true;
      amountsCents: number[];
    }
  | {
      ok: false;
      error: InstallmentDistributionError;
    };

/**
 * `taksit_plani_olustur` RPC'sine gönderilen satırın ortak tipi.
 *
 * Önizleme de bu şekli kullanır; kaydetme anında ikinci kez tutar/tarih
 * hesaplanmaz.
 */
export interface InstallmentRpcRow {
  sira: number;
  vade_tarihi: string;
  /** Ana para biriminde iki ondalıklı tutar (ör. 6452.49). */
  tutar: number;
}

/**
 * Kullanıcının ekranda görüp onayladığı committed taksit planı.
 *
 * `totalCents`, ana form tutarı sonradan değişti mi kontrolü içindir.
 * `rows`, önizleme ile RPC payload'ı arasındaki tek gerçek kaynaktır.
 */
export interface InstallmentPlan {
  totalCents: number;
  adet: number;
  ilkVade: Date;
  rows: InstallmentRpcRow[];
  lockedRows: LockedInstallmentRow[];
  /** Satır bazında elle seçilmiş vadeler; kalan satırlar ilkVade + n ay kalır. */
  dateOverrides: InstallmentDateOverride[];
}

export type InstallmentPlanErrorCode =
  | InstallmentDistributionErrorCode
  | 'INVALID_DATE_OVERRIDE'
  | 'INVALID_FIRST_DUE_DATE'
  | 'FIRST_DUE_BEFORE_TRANSACTION_DATE'
  | 'STALE_TOTAL_CENTS'
  | 'PLAN_ROW_COUNT_MISMATCH'
  | 'PLAN_ROW_SEQUENCE_MISMATCH'
  | 'PLAN_ROW_DATE_MISMATCH'
  | 'PLAN_ROW_AMOUNT_MISMATCH'
  | 'PLAN_TOTAL_MISMATCH';

export interface InstallmentPlanError {
  code: InstallmentPlanErrorCode;
  /** Kullanıcıya gösterilebilecek Türkçe açıklama. */
  message: string;
  rowIndex?: number;
}

export type InstallmentPlanBuildResult =
  | {
      ok: true;
      plan: InstallmentPlan;
    }
  | {
      ok: false;
      error: InstallmentPlanError;
    };

export type InstallmentPlanSerializationResult =
  | {
      ok: true;
      rows: InstallmentRpcRow[];
    }
  | {
      ok: false;
      error: InstallmentPlanError;
    };

/** Pozitif para tutarını güvenli biçimde integer kuruşa çevirir. */
export function amountToCents(amount: number): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;

  // 1.005 gibi ikili kayan nokta sınırlarında doğru kuruşa yuvarla.
  const cents = Math.round((amount + Number.EPSILON) * 100);
  return Number.isSafeInteger(cents) && cents >= 1 ? cents : null;
}

function error(
  code: InstallmentDistributionErrorCode,
  message: string,
  rowIndex?: number
): InstallmentDistributionResult {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(rowIndex === undefined ? {} : { rowIndex }),
    },
  };
}

function distributeFloorWithLeftRemainder(
  amountsCents: number[],
  rowIndexes: readonly number[],
  remainingCents: number
): void {
  const baseCents = Math.floor(remainingCents / rowIndexes.length);
  const extraCentCount = remainingCents % rowIndexes.length;

  rowIndexes.forEach((rowIndex, order) => {
    amountsCents[rowIndex] = baseCents + (order < extraCentCount ? 1 : 0);
  });
}

/**
 * Toplam tutarı 2..120 pozitif taksite deterministik biçimde dağıtır.
 *
 * Sabit satır yokken mevcut uygulama davranışı korunur: ilk `count - 1`
 * satır `Math.round(toplam / adet)`, son satır tam kalan olur. Bu yöntem son
 * satırı sıfır/negatif yaparsa güvenli olarak taban bölme + soldan kalan
 * dağıtımına geçilir.
 *
 * Bir veya daha fazla satır sabitlendiğinde, sabit toplam düşülür ve kalan
 * tutar sabit olmayan satırlara taban bölme + soldan birer kuruş yöntemiyle
 * dağıtılır.
 */
export function distributeInstallmentCents({
  totalCents,
  count,
  lockedRows = [],
}: InstallmentDistributionInput): InstallmentDistributionResult {
  if (
    !Number.isSafeInteger(count) ||
    count < MIN_INSTALLMENT_COUNT ||
    count > MAX_INSTALLMENT_COUNT
  ) {
    return error(
      'INVALID_INSTALLMENT_COUNT',
      `Taksit sayısı ${MIN_INSTALLMENT_COUNT} ile ${MAX_INSTALLMENT_COUNT} arasında bir tam sayı olmalıdır.`
    );
  }

  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    return error('INVALID_TOTAL_CENTS', 'Toplam tutar pozitif bir tam kuruş değeri olmalıdır.');
  }

  if (totalCents < count) {
    return error(
      'TOTAL_TOO_SMALL',
      'Her taksit en az 1 kuruş olmalıdır. Toplam tutar taksit sayısından küçük olamaz.'
    );
  }

  const amountsCents = new Array<number>(count);
  const lockedIndexes = new Set<number>();
  let lockedTotalCents = 0;

  for (const row of lockedRows) {
    if (!Number.isSafeInteger(row.index) || row.index < 0 || row.index >= count) {
      return error(
        'INVALID_LOCKED_ROW_INDEX',
        'Düzenlenen taksit satırı planın dışında.',
        row.index
      );
    }

    if (lockedIndexes.has(row.index)) {
      return error(
        'DUPLICATE_LOCKED_ROW',
        'Aynı taksit satırı birden fazla kez sabitlenemez.',
        row.index
      );
    }

    if (!Number.isSafeInteger(row.amountCents) || row.amountCents < 1) {
      return error(
        'INVALID_LOCKED_AMOUNT',
        'Sabitlenen taksit tutarı en az 1 kuruş olan bir tam sayı olmalıdır.',
        row.index
      );
    }

    if (lockedTotalCents > totalCents - row.amountCents) {
      return error(
        'LOCKED_TOTAL_TOO_HIGH',
        'Sabitlenen taksitlerin toplamı ana tutarı aşamaz.',
        row.index
      );
    }

    lockedIndexes.add(row.index);
    lockedTotalCents += row.amountCents;
    amountsCents[row.index] = row.amountCents;
  }

  const unlockedIndexes: number[] = [];
  for (let index = 0; index < count; index += 1) {
    if (!lockedIndexes.has(index)) unlockedIndexes.push(index);
  }

  if (unlockedIndexes.length === 0) {
    if (lockedTotalCents !== totalCents) {
      return error(
        'LOCKED_PLAN_TOTAL_MISMATCH',
        'Tüm taksitler sabitlendiğinde satır toplamı ana tutara eşit olmalıdır.'
      );
    }

    return { ok: true, amountsCents };
  }

  const remainingCents = totalCents - lockedTotalCents;
  if (remainingCents < unlockedIndexes.length) {
    return error(
      'INSUFFICIENT_REMAINDER',
      'Sabitlenen tutarlardan sonra diğer taksitlere en az 1 kuruş kalmalıdır.'
    );
  }

  if (lockedRows.length === 0) {
    const roundedCents = Math.round(totalCents / count);
    const lastRowCents = totalCents - roundedCents * (count - 1);

    if (lastRowCents >= 1) {
      amountsCents.fill(roundedCents, 0, count - 1);
      amountsCents[count - 1] = lastRowCents;
    } else {
      distributeFloorWithLeftRemainder(amountsCents, unlockedIndexes, totalCents);
    }
  } else {
    distributeFloorWithLeftRemainder(amountsCents, unlockedIndexes, remainingCents);
  }

  const distributedTotalCents = amountsCents.reduce((sum, amount) => sum + amount, 0);
  const isValidPlan =
    distributedTotalCents === totalCents &&
    amountsCents.every((amount) => Number.isSafeInteger(amount) && amount >= 1);

  if (!isValidPlan) {
    return error(
      'DISTRIBUTION_INVARIANT_FAILED',
      'Taksit dağıtımı doğrulanamadı. Lütfen tutarı ve taksit sayısını kontrol edin.'
    );
  }

  return { ok: true, amountsCents };
}

function planError(
  code: InstallmentPlanErrorCode,
  message: string,
  rowIndex?: number
): { ok: false; error: InstallmentPlanError } {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(rowIndex === undefined ? {} : { rowIndex }),
    },
  };
}

function isSupportedDueDate(value: unknown): value is Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()) || value.getTime() === 0) {
    return false;
  }

  const year = value.getFullYear();
  return year >= 1900 && year <= 2100;
}

const DB_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD biçiminde, gerçekten var olan (round-trip eden) bir günü doğrular. */
function isSupportedDbDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !DB_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  if (!isSupportedDueDate(parsed)) return false;
  return formatDateForDB(parsed) === value;
}

function normalizeDateOverrides(
  dateOverrides: ReadonlyArray<InstallmentDateOverride>,
  count: number
):
  | { ok: true; overrideByIndex: Map<number, string> }
  | { ok: false; rowIndex: number } {
  const overrideByIndex = new Map<number, string>();
  for (const override of dateOverrides) {
    if (
      !Number.isSafeInteger(override.index) ||
      override.index < 0 ||
      override.index >= count ||
      overrideByIndex.has(override.index) ||
      !isSupportedDbDateString(override.dueDate)
    ) {
      return { ok: false, rowIndex: override.index };
    }
    overrideByIndex.set(override.index, override.dueDate);
  }
  return { ok: true, overrideByIndex };
}

function rpcAmountToCents(amount: number): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents) || cents < 1) return null;

  // RPC satırı en fazla iki ondalık taşımalıdır; sessiz yuvarlama yapma.
  const normalizedAmount = cents / 100;
  const tolerance = Math.max(1, Math.abs(amount)) * Number.EPSILON * 8;
  return Math.abs(amount - normalizedAmount) <= tolerance ? cents : null;
}

/**
 * Integer-kuruş dağıtımından önizleme/RPC için tek bir committed plan üretir.
 *
 * Tarihler her satır için ilk vadeye göre hesaplanır. Bu nedenle 31 Ocak
 * başlangıcında mevcut `addMonths` sözleşmesi korunur:
 * 31 Ocak → Şubat'ın son günü → 31 Mart.
 */
export function buildInstallmentPlan(
  totalCents: number,
  count: number,
  firstDueDate: Date,
  lockedRows: ReadonlyArray<LockedInstallmentRow> = [],
  dateOverrides: ReadonlyArray<InstallmentDateOverride> = []
): InstallmentPlanBuildResult {
  if (!isSupportedDueDate(firstDueDate)) {
    return planError(
      'INVALID_FIRST_DUE_DATE',
      'İlk taksit vadesi geçerli bir tarih olmalıdır.'
    );
  }

  const normalizedOverrides = normalizeDateOverrides(dateOverrides, count);
  if (!normalizedOverrides.ok) {
    return planError(
      'INVALID_DATE_OVERRIDE',
      'Elle seçilen taksit vadesi geçersiz.',
      normalizedOverrides.rowIndex
    );
  }

  const distribution = distributeInstallmentCents({
    totalCents,
    count,
    lockedRows,
  });
  if (!distribution.ok) {
    return planError(
      distribution.error.code,
      distribution.error.message,
      distribution.error.rowIndex
    );
  }

  const firstDueDateSnapshot = new Date(firstDueDate);
  const rows: InstallmentRpcRow[] = [];

  for (let index = 0; index < count; index += 1) {
    const overrideDate = normalizedOverrides.overrideByIndex.get(index);
    let dueDateString: string;
    if (overrideDate !== undefined) {
      dueDateString = overrideDate;
    } else {
      const dueDate = addMonths(firstDueDateSnapshot, index);
      if (!isSupportedDueDate(dueDate)) {
        return planError(
          'INVALID_FIRST_DUE_DATE',
          'Taksit vadelerinden biri desteklenen tarih aralığının dışında.',
          index
        );
      }
      dueDateString = formatDateForDB(dueDate);
    }

    rows.push({
      sira: index + 1,
      vade_tarihi: dueDateString,
      tutar: distribution.amountsCents[index] / 100,
    });
  }

  return {
    ok: true,
    plan: {
      totalCents,
      adet: count,
      ilkVade: firstDueDateSnapshot,
      rows,
      lockedRows: lockedRows.map((row) => ({ ...row })),
      dateOverrides: Array.from(
        normalizedOverrides.overrideByIndex,
        ([index, dueDate]) => ({ index, dueDate })
      ).sort((a, b) => a.index - b.index),
    },
  };
}

function validatePlanAndGetRows(
  plan: InstallmentPlan,
  currentTotalCents: number,
  minimumDueDate?: Date
): InstallmentPlanSerializationResult {
  if (!Number.isSafeInteger(currentTotalCents) || currentTotalCents <= 0) {
    return planError(
      'INVALID_TOTAL_CENTS',
      'Güncel toplam tutar pozitif bir tam kuruş değeri olmalıdır.'
    );
  }

  if (plan.totalCents !== currentTotalCents) {
    return planError(
      'STALE_TOTAL_CENTS',
      'Toplam tutar taksit önizlemesinden sonra değişti. Planı yeniden oluşturun.'
    );
  }

  if (!isSupportedDueDate(plan.ilkVade)) {
    return planError(
      'INVALID_FIRST_DUE_DATE',
      'Taksit planındaki ilk vade geçerli değil.'
    );
  }

  if (
    minimumDueDate !== undefined &&
    (!isSupportedDueDate(minimumDueDate) ||
      formatDateForDB(plan.ilkVade) < formatDateForDB(minimumDueDate))
  ) {
    return planError(
      'FIRST_DUE_BEFORE_TRANSACTION_DATE',
      'İlk taksit vadesi işlem tarihinden önce olamaz.'
    );
  }

  const expectedDistribution = distributeInstallmentCents({
    totalCents: plan.totalCents,
    count: plan.adet,
    lockedRows: plan.lockedRows,
  });
  if (!expectedDistribution.ok) {
    return planError(
      expectedDistribution.error.code,
      expectedDistribution.error.message,
      expectedDistribution.error.rowIndex
    );
  }

  if (!Array.isArray(plan.rows) || plan.rows.length !== plan.adet) {
    return planError(
      'PLAN_ROW_COUNT_MISMATCH',
      'Taksit satırı sayısı seçilen taksit adediyle uyuşmuyor.'
    );
  }

  const normalizedOverrides = normalizeDateOverrides(
    plan.dateOverrides ?? [],
    plan.adet
  );
  if (!normalizedOverrides.ok) {
    return planError(
      'INVALID_DATE_OVERRIDE',
      'Elle seçilen taksit vadesi geçersiz.',
      normalizedOverrides.rowIndex
    );
  }
  const minimumDueDateString =
    minimumDueDate === undefined ? null : formatDateForDB(minimumDueDate);

  let rowTotalCents = 0;
  for (let index = 0; index < plan.rows.length; index += 1) {
    const row = plan.rows[index];

    if (!row || row.sira !== index + 1) {
      return planError(
        'PLAN_ROW_SEQUENCE_MISMATCH',
        'Taksit satırlarının sırası değişmiş. Planı yeniden oluşturun.',
        index
      );
    }

    const overrideDate = normalizedOverrides.overrideByIndex.get(index);
    let expectedDueDateString: string;
    if (overrideDate !== undefined) {
      expectedDueDateString = overrideDate;
    } else {
      const expectedDueDate = addMonths(plan.ilkVade, index);
      if (!isSupportedDueDate(expectedDueDate)) {
        return planError(
          'PLAN_ROW_DATE_MISMATCH',
          'Taksit vadesi önizlenen planla uyuşmuyor.',
          index
        );
      }
      expectedDueDateString = formatDateForDB(expectedDueDate);
    }

    if (row.vade_tarihi !== expectedDueDateString) {
      return planError(
        'PLAN_ROW_DATE_MISMATCH',
        'Taksit vadesi önizlenen planla uyuşmuyor.',
        index
      );
    }

    // Elle seçilmiş vadeler de işlem tarihinin gerisine düşemez.
    if (
      minimumDueDateString !== null &&
      row.vade_tarihi < minimumDueDateString
    ) {
      return planError(
        'FIRST_DUE_BEFORE_TRANSACTION_DATE',
        'Taksit vadesi işlem tarihinden önce olamaz.',
        index
      );
    }

    const rowCents = rpcAmountToCents(row.tutar);
    if (
      rowCents === null ||
      rowCents !== expectedDistribution.amountsCents[index]
    ) {
      return planError(
        'PLAN_ROW_AMOUNT_MISMATCH',
        'Taksit tutarı önizlenen dağıtımla uyuşmuyor.',
        index
      );
    }

    rowTotalCents += rowCents;
  }

  if (rowTotalCents !== plan.totalCents) {
    return planError(
      'PLAN_TOTAL_MISMATCH',
      'Taksit satırlarının toplamı ana tutarla uyuşmuyor.'
    );
  }

  return {
    ok: true,
    // Preview → fingerprint → RPC aynı array referansını kullanır; yeniden hesaplama/kopya yoktur.
    rows: plan.rows,
  };
}

/** Committed planın güncel form tutarıyla hâlâ geçerli olduğunu doğrular. */
export function validateInstallmentPlan(
  plan: InstallmentPlan,
  currentTotalCents: number,
  minimumDueDate?: Date
): InstallmentPlanSerializationResult {
  return validatePlanAndGetRows(plan, currentTotalCents, minimumDueDate);
}

/**
 * Planı stale/invariant kontrollerinden geçirip RPC'ye gönderilecek exact
 * önizleme satırlarını döndürür.
 */
export function serializeInstallmentPlan(
  plan: InstallmentPlan,
  currentTotalCents: number
): InstallmentPlanSerializationResult {
  return validatePlanAndGetRows(plan, currentTotalCents);
}
