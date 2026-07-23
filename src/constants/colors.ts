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
  textSecondary: '#4B5563', // WCAG AA compliant (~7:1 contrast ratio)
  textMuted: '#6B7280', // Improved from #9CA3AF

  // Durum renkleri
  success: '#10B981',
  successLight: '#D1FAE5',
  error: '#EF4444',
  errorLight: '#FEE2E2',
  warning: '#EAB308',
  warningLight: '#FEF9C3',
  info: '#3B82F6',
  infoLight: '#DBEAFE',
  orange: '#F97316',
  orangeLight: '#FFEDD5',

  // Koyu vurgu tonları — açık (…Light) zeminler ÜZERİNDE metin için.
  // warning/orange gibi parlak tonlar açık zeminde okunmuyordu (sarı-üstü-sarı);
  // metinde bu koyu ton, ikon/nokta/çizgide parlak ton kullanılır.
  successDark: '#065F46',
  errorDark: '#991B1B',
  warningDark: '#854D0E',
  infoDark: '#1E40AF',
  orangeDark: '#9A3412',

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
