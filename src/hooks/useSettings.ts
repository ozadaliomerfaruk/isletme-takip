/**
 * useSettings Hook
 *
 * Manages user preferences for currency and date format.
 * Stores preferences in AsyncStorage for persistence.
 */

import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

// Storage keys
const STORAGE_KEYS = {
  CURRENCY: '@defter_currency',
  DATE_FORMAT: '@defter_date_format',
} as const;

// Supported currencies
export type CurrencyCode = 'TRY' | 'USD' | 'EUR';

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  locale: string;
}

export const CURRENCY_OPTIONS: CurrencyConfig[] = [
  { code: 'TRY', symbol: '₺', locale: 'tr-TR' },
  { code: 'USD', symbol: '$', locale: 'en-US' },
  { code: 'EUR', symbol: '€', locale: 'de-DE' },
];

// Date format options
export type DateFormatType = 'DMY' | 'MDY';

export interface DateFormatConfig {
  code: DateFormatType;
  example: string;
  separator: string;
}

export const DATE_FORMAT_OPTIONS: DateFormatConfig[] = [
  { code: 'DMY', example: '31/12/2024', separator: '/' },
  { code: 'MDY', example: '12/31/2024', separator: '/' },
];

// Ülke koduna göre para birimi eşlemesi
const COUNTRY_CURRENCY_MAP: Record<string, CurrencyCode> = {
  TR: 'TRY',
  US: 'USD',
  // Eurozone ülkeleri
  DE: 'EUR',
  FR: 'EUR',
  IT: 'EUR',
  ES: 'EUR',
  NL: 'EUR',
  BE: 'EUR',
  AT: 'EUR',
  PT: 'EUR',
  IE: 'EUR',
  FI: 'EUR',
  GR: 'EUR',
  // GBP desteklenmediği için EUR
  GB: 'EUR',
};

/**
 * Telefon locale'ına göre varsayılan para birimini belirle
 */
function getDefaultCurrencyFromLocale(): CurrencyCode {
  try {
    const locales = Localization.getLocales();
    const region = locales[0]?.regionCode; // 'TR', 'US', 'DE', etc.

    // Önce ülke koduna bak
    if (region && COUNTRY_CURRENCY_MAP[region]) {
      return COUNTRY_CURRENCY_MAP[region];
    }

    // Dil koduna göre fallback
    const lang = locales[0]?.languageCode;
    if (lang === 'tr') return 'TRY';
    if (lang === 'de' || lang === 'fr' || lang === 'es' || lang === 'it') return 'EUR';

    // Uluslararası varsayılan
    return 'USD';
  } catch {
    return 'TRY';
  }
}

/**
 * Telefon locale'ına göre varsayılan tarih formatını belirle
 */
function getDefaultDateFormatFromLocale(): DateFormatType {
  try {
    const locales = Localization.getLocales();
    const region = locales[0]?.regionCode;

    // ABD ve Kanada MDY kullanır
    if (region === 'US' || region === 'CA') return 'MDY';

    // Diğer tüm ülkeler DMY kullanır
    return 'DMY';
  } catch {
    return 'DMY';
  }
}

// Default values (telefon locale'ına göre)
const DEFAULT_CURRENCY: CurrencyCode = getDefaultCurrencyFromLocale();
const DEFAULT_DATE_FORMAT: DateFormatType = getDefaultDateFormatFromLocale();

// Global state to share between hook instances
let globalCurrency: CurrencyCode = DEFAULT_CURRENCY;
let globalDateFormat: DateFormatType = DEFAULT_DATE_FORMAT;
let isInitialized = false;
const listeners: Set<() => void> = new Set();

// Initialize from AsyncStorage (called once)
async function initializeSettings() {
  if (isInitialized) return;

  try {
    const [storedCurrency, storedDateFormat] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.CURRENCY),
      AsyncStorage.getItem(STORAGE_KEYS.DATE_FORMAT),
    ]);

    if (storedCurrency && ['TRY', 'USD', 'EUR'].includes(storedCurrency)) {
      globalCurrency = storedCurrency as CurrencyCode;
    }
    if (storedDateFormat && ['DMY', 'MDY'].includes(storedDateFormat)) {
      globalDateFormat = storedDateFormat as DateFormatType;
    }

    isInitialized = true;
    notifyListeners();
  } catch (error) {
    if (__DEV__) {
      console.error('Failed to load settings:', error);
    }
  }
}

function notifyListeners() {
  // Snapshot to avoid issues with concurrent add/delete during iteration
  const snapshot = Array.from(listeners);
  snapshot.forEach((listener) => listener());
}

/**
 * Hook for managing user settings (currency and date format)
 */
export function useSettings() {
  const [currency, setCurrencyState] = useState<CurrencyCode>(globalCurrency);
  const [dateFormat, setDateFormatState] = useState<DateFormatType>(globalDateFormat);
  const [isLoading, setIsLoading] = useState(!isInitialized);

  // Initialize settings on first mount
  useEffect(() => {
    let isMounted = true;

    const loadSettings = async () => {
      if (!isInitialized) {
        await initializeSettings();
      }
      if (isMounted) {
        setCurrencyState(globalCurrency);
        setDateFormatState(globalDateFormat);
        setIsLoading(false);
      }
    };

    loadSettings();

    // Subscribe to changes from other hook instances
    const listener = () => {
      if (isMounted) {
        setCurrencyState(globalCurrency);
        setDateFormatState(globalDateFormat);
      }
    };
    listeners.add(listener);

    return () => {
      isMounted = false;
      listeners.delete(listener);
    };
  }, []);

  // Update currency
  const setCurrency = useCallback(async (newCurrency: CurrencyCode) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.CURRENCY, newCurrency);
      globalCurrency = newCurrency;
      notifyListeners();
    } catch (error) {
      if (__DEV__) {
        console.error('Failed to save currency:', error);
      }
    }
  }, []);

  // Update date format
  const setDateFormat = useCallback(async (newFormat: DateFormatType) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.DATE_FORMAT, newFormat);
      globalDateFormat = newFormat;
      notifyListeners();
    } catch (error) {
      if (__DEV__) {
        console.error('Failed to save date format:', error);
      }
    }
  }, []);

  // Get currency config
  const currencyConfig = CURRENCY_OPTIONS.find((c) => c.code === currency) || CURRENCY_OPTIONS[0];

  // Get date format config
  const dateFormatConfig = DATE_FORMAT_OPTIONS.find((d) => d.code === dateFormat) || DATE_FORMAT_OPTIONS[0];

  return {
    // Current values
    currency,
    dateFormat,
    isLoading,

    // Config objects
    currencyConfig,
    dateFormatConfig,

    // Setters
    setCurrency,
    setDateFormat,

    // Options for selectors
    currencyOptions: CURRENCY_OPTIONS,
    dateFormatOptions: DATE_FORMAT_OPTIONS,
  };
}

// Standalone getters for non-hook contexts (like lib/currency.ts)
export function getCurrentCurrency(): CurrencyConfig {
  return CURRENCY_OPTIONS.find((c) => c.code === globalCurrency) || CURRENCY_OPTIONS[0];
}

export function getCurrentDateFormat(): DateFormatConfig {
  return DATE_FORMAT_OPTIONS.find((d) => d.code === globalDateFormat) || DATE_FORMAT_OPTIONS[0];
}

// Initialize settings when module is loaded
initializeSettings();

export default useSettings;
