/**
 * String Constants Index
 *
 * Tüm uygulama string'lerinin merkezi export noktası.
 * i18n implementasyonuna hazırlık için string'ler burada toplanmıştır.
 *
 * Kullanım:
 * import { COMMON, ERRORS, NAVIGATION } from '@/constants/strings';
 * veya
 * import { S } from '@/constants/strings';
 * S.COMMON.buttons.save // 'Kaydet'
 */

// Tüm string modüllerini export et
export * from './common';
export * from './errors';
export * from './navigation';
export * from './auth';
export * from './transactions';
export * from './accounts';
export * from './cariler';
export * from './personel';
export * from './reports';
export * from './settings';
export * from './categories';

// Named imports
import { COMMON, type CommonStrings } from './common';
import { ERRORS, type ErrorStrings } from './errors';
import { NAVIGATION, type NavigationStrings } from './navigation';
import { AUTH, type AuthStrings } from './auth';
import { TRANSACTIONS, type TransactionStrings, getIslemTypeLabel, getHesapTypeLabel, getCariTypeLabel } from './transactions';
import { ACCOUNTS, type AccountStrings } from './accounts';
import { CARILER, type CarilerStrings } from './cariler';
import { PERSONEL, type PersonelStrings } from './personel';
import { REPORTS, type ReportStrings } from './reports';
import { SETTINGS, type SettingsStrings } from './settings';
import { CATEGORIES, type CategoryStrings } from './categories';

// Tüm string'leri tek bir obje altında topla (kolay erişim için)
export const S = {
  COMMON,
  ERRORS,
  NAVIGATION,
  AUTH,
  TRANSACTIONS,
  ACCOUNTS,
  CARILER,
  PERSONEL,
  REPORTS,
  SETTINGS,
  CATEGORIES,
} as const;

// Helper fonksiyonları export et
export {
  getIslemTypeLabel,
  getHesapTypeLabel,
  getCariTypeLabel,
};

// Tüm string tiplerini export et
export type {
  CommonStrings,
  ErrorStrings,
  NavigationStrings,
  AuthStrings,
  TransactionStrings,
  AccountStrings,
  CarilerStrings,
  PersonelStrings,
  ReportStrings,
  SettingsStrings,
  CategoryStrings,
};

// Tüm string'lerin birleşik tipi
export type AllStrings = {
  COMMON: CommonStrings;
  ERRORS: ErrorStrings;
  NAVIGATION: NavigationStrings;
  AUTH: AuthStrings;
  TRANSACTIONS: TransactionStrings;
  ACCOUNTS: AccountStrings;
  CARILER: CarilerStrings;
  PERSONEL: PersonelStrings;
  REPORTS: ReportStrings;
  SETTINGS: SettingsStrings;
  CATEGORIES: CategoryStrings;
};
