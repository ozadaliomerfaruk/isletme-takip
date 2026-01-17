import { TransactionType, OdemeHedefType, TahsilatHedefType } from '../types';
import { requiresHesap } from './transactionTypeMapper';

/**
 * Validation result with error details.
 */
export interface ValidationResult {
  isValid: boolean;
  error?: {
    type: 'amount' | 'hesap' | 'hedef_hesap' | 'cari' | 'personel' | 'odeme_type' | 'kredi_karti';
    messageKey: string;
  };
  /** If validation passed but a modal needs to be opened, this indicates which one */
  requiresModal?: 'hesap' | 'hedef_hesap' | 'cari' | 'personel' | 'odeme_type' | 'tahsilat_type' | 'kredi_karti' | 'category';
}

/**
 * Validation parameters.
 */
export interface ValidationParams {
  amount: string;
  type: TransactionType;
  hesapId: string | null | undefined;
  hedefHesapId: string | null;
  sourceHesapId: string | null;
  cariId: string | null;
  personelId: string | null;
  odemeHedefType: OdemeHedefType;
  tahsilatHedefType: TahsilatHedefType;
  kategoriId: string | null;
  categorySkipped: boolean;
  isCariMode: boolean;
  isPersonelMode: boolean;
}

/**
 * Transaction types that require category selection.
 */
const CATEGORY_REQUIRED_NORMAL_TYPES: TransactionType[] = ['gelir', 'gider'];
const CATEGORY_REQUIRED_CARI_TYPES: TransactionType[] = ['alis', 'satis', 'alis_iade', 'satis_iade'];
const CATEGORY_REQUIRED_PERSONEL_TYPES: TransactionType[] = ['personel_gider_tab', 'personel_satis_tab'];

/**
 * Checks if a modal needs to be opened before validation can complete.
 * Returns the modal type that should be opened, or null if no modal needed.
 */
export function checkRequiredModals(params: ValidationParams): ValidationResult['requiresModal'] | null {
  const {
    type,
    hedefHesapId,
    sourceHesapId,
    cariId,
    personelId,
    odemeHedefType,
    tahsilatHedefType,
    kategoriId,
    categorySkipped,
    isCariMode,
    isPersonelMode,
  } = params;

  // Normal Mode
  if (!isCariMode && !isPersonelMode) {
    // Transfer needs hedef hesap
    if (type === 'transfer' && !hedefHesapId) {
      return 'hedef_hesap';
    }

    // Odeme flow
    if (type === 'odeme') {
      if (!odemeHedefType) {
        return 'odeme_type';
      }
      if (odemeHedefType === 'tedarikci' && !cariId) {
        return 'cari';
      }
      if (odemeHedefType === 'staff' && !personelId) {
        return 'personel';
      }
      if (odemeHedefType === 'kredi_karti') {
        if (!sourceHesapId) {
          return 'hesap';
        }
        if (!hedefHesapId) {
          return 'kredi_karti';
        }
      }
      // Kredi karti doesn't need category
      if (odemeHedefType !== 'kredi_karti' && !kategoriId && !categorySkipped) {
        return 'category';
      }
    }

    // Tahsilat flow
    if (type === 'tahsilat') {
      if (!tahsilatHedefType) {
        return 'tahsilat_type';
      }
      if (!cariId && (tahsilatHedefType === 'musteri' || tahsilatHedefType === 'tedarikci')) {
        return 'cari';
      }
      if (!personelId && tahsilatHedefType === 'personel') {
        return 'personel';
      }
      if (!kategoriId && !categorySkipped) {
        return 'category';
      }
    }

    // Gelir/Gider category
    if (CATEGORY_REQUIRED_NORMAL_TYPES.includes(type) && !kategoriId && !categorySkipped) {
      return 'category';
    }
  }

  // Cari Mode
  if (isCariMode) {
    // Odeme/Tahsilat needs hesap + category
    if (type === 'odeme' || type === 'tahsilat') {
      if (!sourceHesapId) {
        return 'hesap';
      }
      if (!kategoriId && !categorySkipped) {
        return 'category';
      }
    }
    // Alis, Satis, Iadeler need category
    if (CATEGORY_REQUIRED_CARI_TYPES.includes(type) && !kategoriId && !categorySkipped) {
      return 'category';
    }
  }

  // Personel Mode
  if (isPersonelMode) {
    // Odeme/Tahsilat needs hesap + category
    if (['personel_odeme_tab', 'personel_tahsilat_tab'].includes(type)) {
      if (!sourceHesapId) {
        return 'hesap';
      }
      if (!kategoriId && !categorySkipped) {
        return 'category';
      }
    }
    // Gider/Satis need category
    if (CATEGORY_REQUIRED_PERSONEL_TYPES.includes(type) && !kategoriId && !categorySkipped) {
      return 'category';
    }
  }

  return null;
}

/**
 * Validates all required fields after modals have been handled.
 * Returns validation result with error details.
 */
export function validateTransaction(params: ValidationParams): ValidationResult {
  const {
    type,
    hesapId,
    hedefHesapId,
    sourceHesapId,
    cariId,
    personelId,
    odemeHedefType,
    isCariMode,
    isPersonelMode,
  } = params;

  // Hesap check (after modal logic)
  const needsHesap = requiresHesap(type) && type !== 'odeme';
  if (needsHesap && !hesapId) {
    return {
      isValid: false,
      error: {
        type: 'hesap',
        messageKey: 'accounts:messages.noAccounts',
      },
    };
  }

  // Transfer hedef hesap
  if (type === 'transfer' && !hedefHesapId) {
    return {
      isValid: false,
      error: {
        type: 'hedef_hesap',
        messageKey: 'transactions:validation.selectTargetAccount',
      },
    };
  }

  // Odeme validations
  if (type === 'odeme') {
    if (odemeHedefType === 'tedarikci' && !cariId) {
      return {
        isValid: false,
        error: {
          type: 'cari',
          messageKey: 'clients:transactionForm.selectSupplier',
        },
      };
    }
    if (odemeHedefType === 'staff' && !personelId) {
      return {
        isValid: false,
        error: {
          type: 'personel',
          messageKey: 'staff:transactionForm.selectPersonel',
        },
      };
    }
    if (odemeHedefType === 'kredi_karti') {
      if (!sourceHesapId) {
        return {
          isValid: false,
          error: {
            type: 'hesap',
            messageKey: 'accounts:titles.selectAccount',
          },
        };
      }
      if (!hedefHesapId) {
        return {
          isValid: false,
          error: {
            type: 'kredi_karti',
            messageKey: 'accounts:titles.selectCreditCard',
          },
        };
      }
    }
  }

  // Tahsilat needs cari
  if (type === 'tahsilat' && !cariId) {
    return {
      isValid: false,
      error: {
        type: 'cari',
        messageKey: 'clients:transactionForm.selectCustomer',
      },
    };
  }

  // Cari mode validations
  if ((type === 'alis' || type === 'alis_iade') && !cariId) {
    return {
      isValid: false,
      error: {
        type: 'cari',
        messageKey: 'clients:transactionForm.selectSupplier',
      },
    };
  }

  if ((type === 'satis' || type === 'satis_iade') && !cariId) {
    return {
      isValid: false,
      error: {
        type: 'cari',
        messageKey: 'clients:transactionForm.selectCustomer',
      },
    };
  }

  // Personel mode validations
  if ([
    'personel_odeme_tab',
    'personel_gider_tab',
    'personel_tahsilat_tab',
    'personel_satis_tab',
  ].includes(type) && !personelId) {
    return {
      isValid: false,
      error: {
        type: 'personel',
        messageKey: 'staff:transactionForm.selectPersonel',
      },
    };
  }

  return { isValid: true };
}
