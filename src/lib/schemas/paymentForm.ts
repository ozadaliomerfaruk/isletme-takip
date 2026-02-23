/**
 * Payment Form Schema (Zod)
 *
 * Shared validation schema for personelOdeme and cariOdeme forms.
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
  { message: 'invalidAmount' } // key resolved via t() in the component
);

/**
 * Reminder config sub-schema
 */
const reminderConfigSchema = z.object({
  enabled: z.boolean(),
  daysBefore: z.number().min(0),
  time: z.string(),
});

/**
 * Base payment form schema — shared fields between personelOdeme and cariOdeme.
 */
const basePaymentSchema = z.object({
  amount: currencyAmount,
  description: z.string().optional().default(''),
  selectedDate: z.date(),
  hesapId: z.string().nullable(),
  kategoriId: z.string().nullable(),
  isIleriTarihli: z.boolean().default(false),
  reminderConfig: reminderConfigSchema.default({
    enabled: false,
    daysBefore: 0,
    time: '09:00',
  }),
});

/**
 * PersonelOdeme form schema
 */
export const personelOdemeSchema = basePaymentSchema.extend({
  personelId: z.string().nullable(),
}).superRefine((data, ctx) => {
  if (!data.personelId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'selectPersonel',
      path: ['personelId'],
    });
  }
  if (!data.hesapId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'selectPaymentAccount',
      path: ['hesapId'],
    });
  }
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
});

/**
 * CariOdeme form schema
 */
export const cariOdemeSchema = basePaymentSchema.extend({
  cariId: z.string().nullable(),
}).superRefine((data, ctx) => {
  if (!data.cariId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'selectSupplier',
      path: ['cariId'],
    });
  }
  if (!data.hesapId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'selectPaymentAccount',
      path: ['hesapId'],
    });
  }
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
});

export type PersonelOdemeFormData = z.infer<typeof personelOdemeSchema>;
export type CariOdemeFormData = z.infer<typeof cariOdemeSchema>;
