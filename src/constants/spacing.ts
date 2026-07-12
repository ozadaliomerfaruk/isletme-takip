import { Platform } from 'react-native';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
} as const;

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  full: 9999,
} as const;

export const fontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  '2xl': 20,
  '3xl': 24,
  '4xl': 28,
  '5xl': 32,
} as const;

export const fontWeight = {
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

// Shadow presets - platform-aware (Airbnb-style soft shadows)
export const shadows = {
  sm: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
    },
    android: {
      elevation: 2,
    },
    default: {},
  }),
  md: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
    },
    android: {
      elevation: 3,
    },
    default: {},
  }),
  lg: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 16,
    },
    android: {
      elevation: 5,
    },
    default: {},
  }),
} as const;

// Dokunma hedefi genişletmeleri (hitSlop) — küçük ikonlarda (satır içi ⋮, X, tarih chip'i)
// ıska dokunuşu azaltır. Değerler kod tabanındaki mevcut baskın değerlerden türetildi:
// sm=8 ve md=10 en yaygın (dedup ile değişmez); lg=15 büyük foto-görüntüleyici kontrolleri için.
// RN hitSlop objesi {top,bottom,left,right} bekler; skaler hitSlop={8} ile obje eşdeğerdir.
export const HIT_SLOP = {
  sm: { top: 8, bottom: 8, left: 8, right: 8 },
  md: { top: 10, bottom: 10, left: 10, right: 10 },
  lg: { top: 15, bottom: 15, left: 15, right: 15 },
} as const;

// Layout constants
export const TAB_BAR_HEIGHT = 52;
