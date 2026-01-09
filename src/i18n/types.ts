/**
 * i18n TypeScript Definitions
 * Type safety for translations
 */

import 'i18next';

// Extend i18next types - disable strict mode for flexibility
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    // Disable strict type checking for translation keys
    // This allows using any string as a key, which is more flexible for large apps
    returnNull: false;
  }
}

// Supported languages
export type SupportedLanguage = 'tr' | 'en';

// Language options for UI
export const languageOptions: { code: SupportedLanguage; label: string; nativeLabel: string }[] = [
  { code: 'tr', label: 'Turkish', nativeLabel: 'Türkçe' },
  { code: 'en', label: 'English', nativeLabel: 'English' },
];
