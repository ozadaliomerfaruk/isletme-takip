/**
 * i18n Configuration
 * Internationalization setup for the Defter app
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'intl-pluralrules';

// Storage key for language preference
const LANGUAGE_KEY = '@defter_language';

// Import Turkish locales
import trCommon from './locales/tr/common.json';
import trErrors from './locales/tr/errors.json';
import trNavigation from './locales/tr/navigation.json';
import trAuth from './locales/tr/auth.json';
import trTransactions from './locales/tr/transactions.json';
import trAccounts from './locales/tr/accounts.json';
import trClients from './locales/tr/clients.json';
import trStaff from './locales/tr/staff.json';
import trReports from './locales/tr/reports.json';
import trSettings from './locales/tr/settings.json';
import trCategories from './locales/tr/categories.json';
import trLegal from './locales/tr/legal.json';
import trChecks from './locales/tr/checks.json';
import trAnalytics from './locales/tr/analytics.json';
import trProducts from './locales/tr/products.json';
import trOcrImport from './locales/tr/ocrImport.json';

// Import English locales
import enCommon from './locales/en/common.json';
import enErrors from './locales/en/errors.json';
import enNavigation from './locales/en/navigation.json';
import enAuth from './locales/en/auth.json';
import enTransactions from './locales/en/transactions.json';
import enAccounts from './locales/en/accounts.json';
import enClients from './locales/en/clients.json';
import enStaff from './locales/en/staff.json';
import enReports from './locales/en/reports.json';
import enSettings from './locales/en/settings.json';
import enCategories from './locales/en/categories.json';
import enLegal from './locales/en/legal.json';
import enChecks from './locales/en/checks.json';
import enAnalytics from './locales/en/analytics.json';
import enProducts from './locales/en/products.json';
import enOcrImport from './locales/en/ocrImport.json';

// Resource bundle
export const resources = {
  tr: {
    common: trCommon,
    errors: trErrors,
    navigation: trNavigation,
    auth: trAuth,
    transactions: trTransactions,
    accounts: trAccounts,
    clients: trClients,
    staff: trStaff,
    reports: trReports,
    settings: trSettings,
    categories: trCategories,
    legal: trLegal,
    checks: trChecks,
    analytics: trAnalytics,
    products: trProducts,
    ocrImport: trOcrImport,
  },
  en: {
    common: enCommon,
    errors: enErrors,
    navigation: enNavigation,
    auth: enAuth,
    transactions: enTransactions,
    accounts: enAccounts,
    clients: enClients,
    staff: enStaff,
    reports: enReports,
    settings: enSettings,
    categories: enCategories,
    legal: enLegal,
    checks: enChecks,
    analytics: enAnalytics,
    products: enProducts,
    ocrImport: enOcrImport,
  },
} as const;

// Get device language
const getDeviceLanguage = (): string => {
  const locales = Localization.getLocales();
  const deviceLang = locales[0]?.languageCode || 'tr';
  // Only support tr and en, fallback to tr
  return ['tr', 'en'].includes(deviceLang) ? deviceLang : 'tr';
};

// Namespace list
export const namespaces = [
  'common',
  'errors',
  'navigation',
  'auth',
  'transactions',
  'accounts',
  'clients',
  'staff',
  'reports',
  'settings',
  'categories',
  'legal',
  'checks',
  'analytics',
  'products',
  'ocrImport',
] as const;

export type Namespace = (typeof namespaces)[number];

// Initialize i18next
i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getDeviceLanguage(),
    fallbackLng: 'tr',
    defaultNS: 'common',
    ns: namespaces,
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    react: {
      useSuspense: false, // Disable suspense for React Native
    },
    compatibilityJSON: 'v4', // For Android compatibility
  });

// Language change helper - persists to AsyncStorage
export const changeLanguage = async (lang: 'tr' | 'en') => {
  await i18n.changeLanguage(lang);
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, lang);
  } catch (error) {
    if (__DEV__) {
      console.warn('Failed to save language preference:', error);
    }
  }
};

// Get current language
export const getCurrentLanguage = () => i18n.language as 'tr' | 'en';

// Load saved language preference
export const loadSavedLanguage = async () => {
  try {
    const savedLang = await AsyncStorage.getItem(LANGUAGE_KEY);
    if (savedLang && ['tr', 'en'].includes(savedLang)) {
      await i18n.changeLanguage(savedLang);
      return savedLang as 'tr' | 'en';
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('Failed to load language preference:', error);
    }
  }
  return null;
};

export default i18n;
