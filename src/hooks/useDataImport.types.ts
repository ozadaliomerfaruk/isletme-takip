/**
 * Data Import Types
 * useDataImport hook ailesi tarafından paylaşılan tip tanımları
 */

import { ParsedTransaction } from '@/lib/excelImport';

export interface ImportProgress {
  phase: 'idle' | 'categories' | 'accounts' | 'clients' | 'personel' | 'transactions' | 'balances' | 'done' | 'error';
  current: number;
  total: number;
  message: string;
  estimatedTimeRemaining?: number;
  startTime?: number;
  percentage: number;
  itemsPerSecond: number;
  phaseDetails: {
    categories: number;
    accounts: number;
    clients: number;
    personel: number;
    transactions: number;
  };
}

export interface SkippedTransaction {
  transaction: ParsedTransaction;
  reason: string;
  rowNumber: number;
}

export interface ImportResult {
  success: boolean;
  categoriesCreated: number;
  accountsCreated: number;
  clientsCreated: number;
  personelCreated: number;
  transactionsCreated: number;
  transactionIds: string[];
  createdCategoryIds: string[];
  reactivatedCategoryIds: string[];
  createdAccountIds: string[];
  createdClientIds: string[];
  createdPersonelIds: string[];
  errors: string[];
  skipped: number;
  skippedTransactions: SkippedTransaction[];
  startingBalancesApplied: number;
  startingBalancesUpdated: number;
  totalRowsProcessed: number;
}

export interface EntityIdMap {
  categories: Map<string, string>;
  accounts: Map<string, string>;
  clients: Map<string, string>;
  personel: Map<string, string>;
}

export interface DuplicateInfo {
  rowIndex: number;
  existingId: string;
  existingDate: string;
  existingAmount: number;
}

export interface ProgressTranslations {
  categories: string;
  accounts: string;
  clients: string;
  personel: string;
  transactions: string;
  balances: string;
  done: string;
  simulation: string;
  starting?: string;
  etaRemaining?: string;
}

export interface ImportOptions {
  dryRun?: boolean;
  skipDuplicates?: boolean;
  categoryMappings?: Record<string, 'gelir' | 'gider'>;
  translations?: ProgressTranslations;
}

export const DEFAULT_TRANSLATIONS: ProgressTranslations = {
  categories: 'Creating categories...',
  accounts: 'Creating accounts...',
  clients: 'Creating clients...',
  personel: 'Creating personnel...',
  transactions: 'Importing transactions...',
  balances: 'Updating balances...',
  done: 'Done!',
  simulation: 'Running simulation...',
  starting: 'Starting...',
  etaRemaining: 'remaining',
};

export const EMPTY_IMPORT_RESULT: ImportResult = {
  success: false,
  categoriesCreated: 0,
  accountsCreated: 0,
  clientsCreated: 0,
  personelCreated: 0,
  transactionsCreated: 0,
  transactionIds: [],
  createdCategoryIds: [],
  reactivatedCategoryIds: [],
  createdAccountIds: [],
  createdClientIds: [],
  createdPersonelIds: [],
  errors: [],
  skipped: 0,
  skippedTransactions: [],
  startingBalancesApplied: 0,
  startingBalancesUpdated: 0,
  totalRowsProcessed: 0,
};

export const EMPTY_PROGRESS: ImportProgress = {
  phase: 'idle',
  current: 0,
  total: 0,
  message: '',
  percentage: 0,
  itemsPerSecond: 0,
  phaseDetails: { categories: 0, accounts: 0, clients: 0, personel: 0, transactions: 0 },
};
