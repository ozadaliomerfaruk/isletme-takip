export const colors = {
  // Ana renkler - Yeşil tema
  primary: '#0D5C4D',
  primaryLight: '#E8F5F1',
  primaryDark: '#094539',

  // Arka plan renkleri - Açık tema
  background: '#F5F5F5',
  surface: '#FFFFFF',
  surfaceLight: '#FAFAFA',
  surfaceLighter: '#F0F0F0',

  // Metin renkleri
  text: '#1A1A1A',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',

  // Durum renkleri
  success: '#10B981',
  successLight: '#D1FAE5',
  error: '#EF4444',
  errorLight: '#FEE2E2',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  info: '#3B82F6',
  infoLight: '#DBEAFE',

  // Gelir/Gider renkleri
  income: '#10B981',
  incomeLight: '#D1FAE5',
  expense: '#EF4444',
  expenseLight: '#FEE2E2',
  transfer: '#3B82F6',
  transferLight: '#DBEAFE',

  // Border
  border: '#E5E7EB',
  borderLight: '#F3F4F6',

  // Diğer
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

export type ColorKey = keyof typeof colors;
