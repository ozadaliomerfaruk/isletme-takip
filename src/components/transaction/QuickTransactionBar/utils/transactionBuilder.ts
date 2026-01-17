import { Currency } from '@/types/database';
import {
  TransactionType,
  OdemeHedefType,
  PendingExchangeData,
} from '../types';
import { mapTransactionTypeToApi, NO_HESAP_TYPES } from './transactionTypeMapper';

/**
 * Parameters for building transaction data.
 */
export interface BuildTransactionParams {
  type: TransactionType;
  amount: number;
  description: string;
  hesapId: string | null | undefined;
  kategoriId: string | null;
  // Type-specific IDs
  hedefHesapId?: string | null;
  cariId?: string | null;
  personelId?: string | null;
  odemeHedefType?: OdemeHedefType;
  // Exchange rate data (optional)
  exchangeData?: {
    sourceCurrency: Currency;
    targetCurrency: Currency;
    exchangeRate: number;
  };
}

/**
 * Built transaction data ready for API submission.
 */
export interface TransactionData {
  type: string;
  amount: number;
  description: string | null;
  hesap_id: string | null;
  kategori_id: string | null;
  // Optional fields
  hedef_hesap_id?: string | null;
  cari_id?: string | null;
  personel_id?: string | null;
  // Exchange rate fields
  source_currency?: Currency;
  target_currency?: Currency;
  exchange_rate?: number;
}

/**
 * Builds transaction data object for API submission.
 * Eliminates duplicate code between handleSave and handleExchangeRateConfirm.
 */
export function buildTransactionData(params: BuildTransactionParams): TransactionData {
  const {
    type,
    amount,
    description,
    hesapId,
    kategoriId,
    hedefHesapId,
    cariId,
    personelId,
    odemeHedefType,
    exchangeData,
  } = params;

  // Map UI type to API type
  const apiType = mapTransactionTypeToApi(type, odemeHedefType);

  // Check if hesap_id is needed for this transaction type
  // Alis/Satis/Iade and Personel Gider/Satis don't require hesap_id
  const needsHesap = !NO_HESAP_TYPES.includes(type);

  // Build base transaction data
  const data: TransactionData = {
    type: apiType,
    amount,
    description: description?.trim() || null,
    hesap_id: needsHesap ? (hesapId || null) : null,
    kategori_id: kategoriId,
  };

  // Add type-specific fields
  if (type === 'transfer') {
    data.hedef_hesap_id = hedefHesapId || null;
  }

  if (type === 'odeme') {
    if (odemeHedefType === 'tedarikci') {
      data.cari_id = cariId || null;
    } else if (odemeHedefType === 'kredi_karti') {
      // Credit card payment is saved as transfer
      data.hedef_hesap_id = hedefHesapId || null;
    } else {
      // staff
      data.personel_id = personelId || null;
    }
  }

  if (type === 'tahsilat') {
    data.cari_id = cariId || null;
  }

  // Cari mode transaction types
  if (['alis', 'satis', 'alis_iade', 'satis_iade'].includes(type)) {
    data.cari_id = cariId || null;
  }

  // Personel mode transaction types
  if ([
    'personel_odeme_tab',
    'personel_gider_tab',
    'personel_tahsilat_tab',
    'personel_satis_tab',
  ].includes(type)) {
    data.personel_id = personelId || null;
  }

  // Add exchange rate data if present (cross-currency transactions)
  if (exchangeData) {
    data.source_currency = exchangeData.sourceCurrency;
    data.target_currency = exchangeData.targetCurrency;
    data.exchange_rate = exchangeData.exchangeRate;
  }

  return data;
}

/**
 * Adds date field to transaction data for normal transactions.
 */
export function addDateToTransaction(
  data: TransactionData,
  formattedDate: string
): TransactionData & { date: string } {
  return {
    ...data,
    date: formattedDate,
  };
}

/**
 * Adds scheduled_date field to transaction data for scheduled transactions.
 */
export function addScheduledDateToTransaction(
  data: TransactionData,
  formattedDate: string
): TransactionData & { scheduled_date: string } {
  return {
    ...data,
    scheduled_date: formattedDate,
  };
}
