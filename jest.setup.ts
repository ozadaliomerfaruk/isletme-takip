// Global __DEV__ mock
(global as unknown as Record<string, boolean>).__DEV__ = true;

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

// Mock expo-notifications
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('mock-notification-id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

// Mock expo-localization
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'tr', regionCode: 'TR' }],
}));

// Mock expo-crypto
jest.mock('expo-crypto', () => ({
  digestStringAsync: jest.fn().mockResolvedValue('mocked-sha256-hash'),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

// Mock supabase client
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      refreshSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
  },
}));

// Mock i18next - variable MUST be prefixed with "mock" for jest.mock() factory
const mockI18n = {
  t: (key: string) => key,
  language: 'tr',
  use: jest.fn().mockReturnThis(),
  init: jest.fn().mockReturnThis(),
  changeLanguage: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  off: jest.fn(),
  exists: jest.fn(() => true),
  getFixedT: jest.fn(() => (key: string) => key),
  isInitialized: true,
};
jest.mock('i18next', () => ({
  __esModule: true,
  default: mockI18n,
  ...mockI18n,
}));

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: mockI18n,
  }),
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  Trans: ({ children }: { children: unknown }) => children,
}));

// Mock @/i18n module to prevent full init
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: mockI18n,
  loadSavedLanguage: jest.fn().mockResolvedValue(undefined),
}));
