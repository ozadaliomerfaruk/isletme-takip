// Global __DEV__ mock
(global as any).__DEV__ = true;

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

// Mock i18next
jest.mock('i18next', () => ({
  t: (key: string) => key,
  language: 'tr',
}));
