import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  ShoppingCart,
  Banknote,
  CreditCard,
  Receipt,
  Undo2,
  UserCheck,
  Calendar,
  Coins,
} from 'lucide-react-native';
import type { IslemType } from '@/types/database';

// İşlem tipine göre renkler (açık arka plan + koyu ikon)
const TYPE_STYLES: Record<string, { bg: string; icon: string }> = {
  // Gelir (yeşil)
  gelir: { bg: '#D1FAE5', icon: '#059669' },
  cari_satis: { bg: '#D1FAE5', icon: '#059669' },
  cari_tahsilat: { bg: '#D1FAE5', icon: '#059669' },
  personel_satis: { bg: '#D1FAE5', icon: '#059669' },
  personel_tahsilat: { bg: '#D1FAE5', icon: '#059669' },
  personel_izin_hakki: { bg: '#DBEAFE', icon: '#2563EB' },

  // Gider (kırmızı)
  gider: { bg: '#FEE2E2', icon: '#DC2626' },
  cari_alis: { bg: '#FEE2E2', icon: '#DC2626' },
  cari_odeme: { bg: '#FEE2E2', icon: '#DC2626' },
  personel_gider: { bg: '#FEE2E2', icon: '#DC2626' },
  personel_odeme: { bg: '#FEE2E2', icon: '#DC2626' },

  // Nötr (gri/mavi)
  transfer: { bg: '#DBEAFE', icon: '#2563EB' },
  cari_alis_iade: { bg: '#FEF3C7', icon: '#D97706' },
  cari_satis_iade: { bg: '#FEF3C7', icon: '#D97706' },
  personel_izin_kullanimi: { bg: '#E0E7FF', icon: '#4338CA' },
};

const DEFAULT_STYLE = { bg: '#F3F4F6', icon: '#6B7280' };

function getIconComponent(type: IslemType) {
  switch (type) {
    case 'gelir':
      return TrendingUp;
    case 'gider':
      return TrendingDown;
    case 'transfer':
      return ArrowLeftRight;
    case 'cari_satis':
    case 'personel_satis':
      return ShoppingCart;
    case 'cari_tahsilat':
    case 'personel_tahsilat':
      return Banknote;
    case 'cari_alis':
      return CreditCard;
    case 'cari_odeme':
    case 'personel_odeme':
      return Coins;
    case 'personel_gider':
      return Receipt;
    case 'cari_alis_iade':
    case 'cari_satis_iade':
      return Undo2;
    case 'personel_izin_hakki':
    case 'personel_izin_kullanimi':
      return Calendar;
    default:
      return UserCheck;
  }
}

interface TransactionIconProps {
  type: IslemType;
  size?: number;
}

export const TransactionIcon = memo(function TransactionIcon({
  type,
  size = 40,
}: TransactionIconProps) {
  const { bg, icon } = TYPE_STYLES[type] ?? DEFAULT_STYLE;
  const Icon = getIconComponent(type);
  const iconSize = size * 0.5;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
        },
      ]}
    >
      <Icon size={iconSize} color={icon} />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
