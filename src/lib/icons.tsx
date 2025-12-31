/**
 * Merkezi İkon Yönetimi
 *
 * Bu dosya uygulamadaki tekrar eden ikon/renk kombinasyonlarını yönetir.
 * Yeni entity tipi eklendiğinde sadece burası güncellenmelidir.
 *
 * KULLANIM KURALLARI:
 * - Component'larda getHesapIcon, getIslemIcon gibi fonksiyonları tekrar tanımlama
 * - Tüm entity ikonları bu dosyadan alınmalı
 */

import React from 'react';
import {
  Wallet,
  Building2,
  CreditCard,
  Banknote,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Users,
  UserCheck,
  Receipt,
  TrendingUp,
  TrendingDown,
  Package,
  ShoppingCart,
  Send,
  Landmark,
} from 'lucide-react-native';
import { colors } from '@/constants/colors';
import { HesapType, IslemType, CariType } from '@/types/database';

// ============================================================================
// TİP TANIMLAMALARI
// ============================================================================

export interface IconConfig {
  icon: React.ReactNode;
  color: string;
  backgroundColor: string;
}

// ============================================================================
// HESAP İKONLARI
// ============================================================================

/**
 * Hesap tipine göre ikon ve renk bilgisi döndür
 *
 * @example
 * const { icon, color, backgroundColor } = getHesapIconConfig('nakit');
 * <View style={{ backgroundColor }}>{icon}</View>
 */
export function getHesapIconConfig(type: HesapType, size: number = 24): IconConfig {
  switch (type) {
    case 'nakit':
      return {
        icon: <Wallet size={size} color={colors.primary} />,
        color: colors.primary,
        backgroundColor: colors.primaryLight,
      };
    case 'banka':
      return {
        icon: <Building2 size={size} color={colors.info} />,
        color: colors.info,
        backgroundColor: colors.infoLight,
      };
    case 'kredi_karti':
      return {
        icon: <CreditCard size={size} color={colors.warning} />,
        color: colors.warning,
        backgroundColor: colors.warningLight,
      };
    default:
      return {
        icon: <Banknote size={size} color={colors.primary} />,
        color: colors.primary,
        backgroundColor: colors.primaryLight,
      };
  }
}

/**
 * Hesap tipi için sadece ikon komponenti döndür (geriye uyumluluk için)
 */
export function getHesapIcon(type: HesapType, size: number = 24): React.ReactNode {
  return getHesapIconConfig(type, size).icon;
}

// ============================================================================
// İŞLEM İKONLARI
// ============================================================================

/**
 * İşlem tipine göre ikon ve renk bilgisi döndür
 */
export function getIslemIconConfig(type: IslemType, size: number = 24): IconConfig {
  switch (type) {
    // Gelir türleri
    case 'gelir':
      return {
        icon: <ArrowDownLeft size={size} color={colors.success} />,
        color: colors.success,
        backgroundColor: colors.successLight,
      };
    case 'cari_satis':
      return {
        icon: <ShoppingCart size={size} color={colors.success} />,
        color: colors.success,
        backgroundColor: colors.successLight,
      };
    case 'cari_tahsilat':
      return {
        icon: <ArrowDownLeft size={size} color={colors.info} />,
        color: colors.info,
        backgroundColor: colors.infoLight,
      };

    // Gider türleri
    case 'gider':
      return {
        icon: <ArrowUpRight size={size} color={colors.error} />,
        color: colors.error,
        backgroundColor: colors.errorLight,
      };
    case 'cari_alis':
      return {
        icon: <Package size={size} color={colors.error} />,
        color: colors.error,
        backgroundColor: colors.errorLight,
      };
    case 'personel_gider':
      return {
        icon: <UserCheck size={size} color={colors.error} />,
        color: colors.error,
        backgroundColor: colors.errorLight,
      };

    // Ödeme türleri
    case 'cari_odeme':
      return {
        icon: <Send size={size} color={colors.orange} />,
        color: colors.orange,
        backgroundColor: colors.orangeLight,
      };
    case 'personel_odeme':
      return {
        icon: <Users size={size} color={colors.orange} />,
        color: colors.orange,
        backgroundColor: colors.orangeLight,
      };

    // Transfer
    case 'transfer':
      return {
        icon: <ArrowLeftRight size={size} color={colors.warning} />,
        color: colors.warning,
        backgroundColor: colors.warningLight,
      };

    default:
      return {
        icon: <Receipt size={size} color={colors.textMuted} />,
        color: colors.textMuted,
        backgroundColor: colors.surfaceLight,
      };
  }
}

/**
 * İşlem tipi için sadece ikon komponenti döndür
 */
export function getIslemIcon(type: IslemType, size: number = 24): React.ReactNode {
  return getIslemIconConfig(type, size).icon;
}

/**
 * İşlem tipi için arkaplan rengi döndür
 */
export function getIslemIconBg(type: IslemType): string {
  return getIslemIconConfig(type).backgroundColor;
}

/**
 * İşlem tipi için etiket döndür
 */
export function getIslemTypeLabel(type: IslemType): string {
  switch (type) {
    case 'gelir':
      return 'Gelir';
    case 'gider':
      return 'Gider';
    case 'transfer':
      return 'Transfer';
    case 'cari_alis':
      return 'Tedarikçi Alış';
    case 'cari_satis':
      return 'Müşteri Satış';
    case 'cari_odeme':
      return 'Tedarikçi Ödeme';
    case 'cari_tahsilat':
      return 'Müşteri Tahsilat';
    case 'personel_gider':
      return 'Personel Gider';
    case 'personel_odeme':
      return 'Personel Ödeme';
    default:
      return type;
  }
}

// ============================================================================
// İŞLEM TUTAR RENKLERİ
// ============================================================================

export type AmountColorType = 'success' | 'error' | 'primary' | 'warning' | 'info' | 'secondary';

/**
 * İşlem tipine göre tutar rengi döndür
 */
export function getIslemAmountColor(type: IslemType): AmountColorType {
  switch (type) {
    // Gelir - yeşil
    case 'gelir':
    case 'cari_satis':
      return 'success';

    // Gider - kırmızı
    case 'gider':
    case 'cari_alis':
    case 'personel_gider':
      return 'error';

    // Tahsilat - mavi (para içeri)
    case 'cari_tahsilat':
      return 'info';

    // Ödeme - turuncu (para dışarı ama gider değil)
    case 'cari_odeme':
    case 'personel_odeme':
      return 'warning';

    // Transfer - sarı
    case 'transfer':
      return 'warning';

    default:
      return 'primary';
  }
}

/**
 * İşlem tipine göre tutar öneki döndür (+, -, veya boş)
 */
export function getIslemAmountPrefix(type: IslemType): '+' | '-' | '' {
  switch (type) {
    // Para girişi
    case 'gelir':
    case 'cari_tahsilat':
      return '+';

    // Para çıkışı
    case 'gider':
    case 'cari_odeme':
    case 'personel_odeme':
      return '-';

    // Diğerleri (satış, alış, transfer) - işaret gösterme
    default:
      return '';
  }
}

// ============================================================================
// TREND İKONLARI
// ============================================================================

/**
 * Gelir/Gider trend ikonları
 */
export function getTrendIcon(
  type: 'income' | 'expense',
  size: number = 20
): IconConfig {
  if (type === 'income') {
    return {
      icon: <TrendingUp size={size} color={colors.success} />,
      color: colors.success,
      backgroundColor: colors.successLight,
    };
  }

  return {
    icon: <TrendingDown size={size} color={colors.error} />,
    color: colors.error,
    backgroundColor: colors.errorLight,
  };
}

// ============================================================================
// CARİ İKONLARI
// ============================================================================

/**
 * Cari tipine göre ikon döndür
 */
export function getCariIconConfig(
  type: CariType,
  size: number = 24
): IconConfig {
  if (type === 'musteri') {
    return {
      icon: <Users size={size} color={colors.info} />,
      color: colors.info,
      backgroundColor: colors.infoLight,
    };
  }

  return {
    icon: <Building2 size={size} color={colors.warning} />,
    color: colors.warning,
    backgroundColor: colors.warningLight,
  };
}

/**
 * Cari tipi için sadece ikon komponenti döndür
 */
export function getCariIcon(type: CariType, size: number = 24): React.ReactNode {
  return getCariIconConfig(type, size).icon;
}

/**
 * Cari bakiye etiketi döndür
 */
export function getCariBalanceLabel(type: CariType, balance: number): string {
  if (balance === 0) return 'Bakiye yok';
  if (type === 'tedarikci') {
    return balance < 0 ? 'Borcumuz' : 'Alacağımız';
  } else {
    return balance > 0 ? 'Alacağımız' : 'Borcumuz';
  }
}

/**
 * Personel bakiye etiketi döndür
 */
export function getPersonelBalanceLabel(balance: number): string {
  if (balance === 0) return 'Bakiye yok';
  return balance < 0 ? 'Borcumuz' : 'Alacağımız';
}

// ============================================================================
// PERSONEL İKONLARI
// ============================================================================

/**
 * Personel ikonu
 */
export function getPersonelIconConfig(size: number = 24): IconConfig {
  return {
    icon: <UserCheck size={size} color={colors.primary} />,
    color: colors.primary,
    backgroundColor: colors.primaryLight,
  };
}
