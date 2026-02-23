/**
 * Payment Form Schemas (Zod)
 *
 * Shared validation schemas for all transaction forms.
 * Used with react-hook-form via @hookform/resolvers/zod.
 */

import { z } from 'zod';
import { parseCurrency } from '@/lib/currency';

/**
 * Custom zod refinement: parses Turkish-style currency string and
 * ensures the resulting number is positive.
 */
const currencyAmount = z.string().refine(
  (val) => {
    const parsed = parseCurrency(val);
    return !isNaN(parsed) && parsed > 0;
  },
  { message: 'invalidAmount' }
);

const reminderConfigSchema = z.object({
  enabled: z.boolean(),
  daysBefore: z.number().min(0),
  time: z.string(),
});

/**
 * Base form schema — shared fields across all transaction forms.
 */
const baseSchema = z.object({
  amount: currencyAmount,
  description: z.string().optional().default(''),
  selectedDate: z.date(),
  isIleriTarihli: z.boolean().default(false),
  reminderConfig: reminderConfigSchema.default({
    enabled: false,
    daysBefore: 0,
    time: '09:00',
  }),
});

/** Reusable superRefine: validates future date when isIleriTarihli is true */
function validateFutureDate(data: { isIleriTarihli: boolean; selectedDate: Date }, ctx: z.RefinementCtx) {
  if (data.isIleriTarihli) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(data.selectedDate);
    selected.setHours(0, 0, 0, 0);
    if (selected <= today) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'futureDateRequired',
        path: ['selectedDate'],
      });
    }
  }
}

// ── Existing schemas (personelOdeme, cariOdeme) ──

export const personelOdemeSchema = baseSchema.extend({
  personelId: z.string().nullable(),
  hesapId: z.string().nullable(),
  kategoriId: z.string().nullable(),
}).superRefine((data, ctx) => {
  if (!data.personelId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'selectPersonel', path: ['personelId'] });
  }
  if (!data.hesapId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'selectPaymentAccount', path: ['hesapId'] });
  }
  validateFutureDate(data, ctx);
});

export const cariOdemeSchema = baseSchema.extend({
  cariId: z.string().nullable(),
  hesapId: z.string().nullable(),
  kategoriId: z.string().nullable(),
}).superRefine((data, ctx) => {
  if (!data.cariId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'selectSupplier', path: ['cariId'] });
  }
  if (!data.hesapId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'selectPaymentAccount', path: ['hesapId'] });
  }
  validateFutureDate(data, ctx);
});

// ── Transfer schema ──

export const transferSchema = baseSchema.extend({
  kaynakHesapId: z.string().nullable(),
  hedefHesapId: z.string().nullable(),
}).superRefine((data, ctx) => {
  if (!data.kaynakHesapId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'selectSourceAccount', path: ['kaynakHesapId'] });
  }
  if (!data.hedefHesapId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'selectTargetAccount', path: ['hedefHesapId'] });
  }
  if (data.kaynakHesapId && data.hedefHesapId && data.kaynakHesapId === data.hedefHesapId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'sameAccountError', path: ['hedefHesapId'] });
  }
  validateFutureDate(data, ctx);
});

// ── Cari Tahsilat schema (cari + hesap, no kategori) ──

export const cariTahsilatSchema = baseSchema.extend({
  cariId: z.string().nullable(),
  hesapId: z.string().nullable(),
}).superRefine((data, ctx) => {
  if (!data.cariId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'selectCustomer', path: ['cariId'] });
  }
  if (!data.hesapId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'selectCollectionAccount', path: ['hesapId'] });
  }
  validateFutureDate(data, ctx);
});

// ── Cari Alis schema (cari tedarikci + kategori, no hesap) ──

export const cariAlisSchema = baseSchema.extend({
  cariId: z.string().nullable(),
  kategoriId: z.string().nullable(),
}).superRefine((data, ctx) => {
  if (!data.cariId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'selectSupplier', path: ['cariId'] });
  }
  validateFutureDate(data, ctx);
});

// ── Cari Satis schema (cari musteri + kategori, no hesap) ──

export const cariSatisSchema = baseSchema.extend({
  cariId: z.string().nullable(),
  kategoriId: z.string().nullable(),
}).superRefine((data, ctx) => {
  if (!data.cariId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'selectCustomer', path: ['cariId'] });
  }
  validateFutureDate(data, ctx);
});

// ── Personel Gider schema (personel + kategori, no hesap) ──

export const personelGiderSchema = baseSchema.extend({
  personelId: z.string().nullable(),
  kategoriId: z.string().nullable(),
}).superRefine((data, ctx) => {
  if (!data.personelId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'selectPersonel', path: ['personelId'] });
  }
  validateFutureDate(data, ctx);
});

// ── Gelir schema (hesap + kategori, no cari/personel) ──

export const gelirSchema = baseSchema.extend({
  hesapId: z.string().nullable(),
  kategoriId: z.string().nullable(),
}).superRefine((data, ctx) => {
  if (!data.hesapId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'selectAccount', path: ['hesapId'] });
  }
  validateFutureDate(data, ctx);
});

// ── Gider schema (hesap + kategori, no cari/personel) ──

export const giderSchema = baseSchema.extend({
  hesapId: z.string().nullable(),
  kategoriId: z.string().nullable(),
}).superRefine((data, ctx) => {
  if (!data.hesapId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'selectAccount', path: ['hesapId'] });
  }
  validateFutureDate(data, ctx);
});

// ── Type exports ──

export type PersonelOdemeFormData = z.infer<typeof personelOdemeSchema>;
export type CariOdemeFormData = z.infer<typeof cariOdemeSchema>;
export type TransferFormData = z.infer<typeof transferSchema>;
export type CariTahsilatFormData = z.infer<typeof cariTahsilatSchema>;
export type CariAlisFormData = z.infer<typeof cariAlisSchema>;
export type CariSatisFormData = z.infer<typeof cariSatisSchema>;
export type PersonelGiderFormData = z.infer<typeof personelGiderSchema>;
export type GelirFormData = z.infer<typeof gelirSchema>;
export type GiderFormData = z.infer<typeof giderSchema>;
