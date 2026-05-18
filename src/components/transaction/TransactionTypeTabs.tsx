import { useCallback, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';

// Normal mod: gelir, gider, transfer, odeme, tahsilat
// Cari mod (tedarikci): alis, odeme, alis_iade
// Cari mod (musteri): satis, tahsilat, satis_iade
// Personel mod: personel_gider_tab, personel_odeme_tab, personel_tahsilat_tab
// Kredi kartı mod: kredi_karti_gider, kredi_karti_odeme, kredi_karti_ekstre
export type TransactionType =
  | 'gelir'
  | 'gider'
  | 'transfer'
  | 'odeme'
  | 'tahsilat'
  | 'alis'
  | 'satis'
  | 'alis_iade'
  | 'satis_iade'
  | 'personel_odeme_tab'
  | 'personel_gider_tab'
  | 'personel_tahsilat_tab'
  | 'personel_satis_tab'
  | 'personel_izin_hakki_tab'
  | 'personel_izin_kullanimi_tab'
  | 'kredi_karti_gider'
  | 'kredi_karti_odeme'
  | 'kredi_karti_ekstre';

export type TransactionTabMode = 'normal' | 'tedarikci' | 'musteri' | 'tedarikci_viewer' | 'musteri_viewer' | 'personel' | 'personel_izin' | 'kredi_karti';

interface TransactionTypeTabsProps {
  value: TransactionType;
  onChange: (type: TransactionType) => void;
  onTabPress?: (type: TransactionType) => void;
  mode?: TransactionTabMode;
}

interface TabConfig {
  type: TransactionType;
  labelKey: string;
  color: string;
  bgColor: string;
}

const ALL_TABS: TabConfig[] = [
  { type: 'gelir', labelKey: 'transactions:tabs.gelir', color: colors.success, bgColor: colors.successLight },
  { type: 'gider', labelKey: 'transactions:tabs.gider', color: colors.error, bgColor: colors.errorLight },
  { type: 'transfer', labelKey: 'transactions:tabs.transfer', color: colors.info, bgColor: colors.infoLight },
  { type: 'odeme', labelKey: 'transactions:tabs.odeme', color: colors.orange, bgColor: colors.orangeLight },
  { type: 'tahsilat', labelKey: 'transactions:tabs.tahsilat', color: colors.primary, bgColor: colors.primaryLight },
  { type: 'alis', labelKey: 'transactions:tabs.alis', color: colors.error, bgColor: colors.errorLight },
  { type: 'satis', labelKey: 'transactions:tabs.satis', color: colors.success, bgColor: colors.successLight },
  { type: 'alis_iade', labelKey: 'transactions:tabs.alis_iade', color: colors.warning, bgColor: colors.warningLight },
  { type: 'satis_iade', labelKey: 'transactions:tabs.satis_iade', color: colors.warning, bgColor: colors.warningLight },
  // Personel sekmeleri
  { type: 'personel_odeme_tab', labelKey: 'transactions:tabs.personel_odeme', color: colors.success, bgColor: colors.successLight },
  { type: 'personel_gider_tab', labelKey: 'transactions:tabs.personel_gider', color: colors.error, bgColor: colors.errorLight },
  { type: 'personel_tahsilat_tab', labelKey: 'transactions:tabs.personel_tahsilat', color: colors.info, bgColor: colors.infoLight },
  { type: 'personel_satis_tab', labelKey: 'transactions:tabs.personel_satis', color: colors.primary, bgColor: colors.primaryLight },
  // Personel izin sekmeleri
  { type: 'personel_izin_hakki_tab', labelKey: 'transactions:tabs.personel_izin_hakki', color: colors.success, bgColor: colors.successLight },
  { type: 'personel_izin_kullanimi_tab', labelKey: 'transactions:tabs.personel_izin_kullanimi', color: colors.textMuted, bgColor: colors.background },
  // Kredi kartı sekmeleri
  { type: 'kredi_karti_gider', labelKey: 'transactions:tabs.kredi_karti_gider', color: colors.error, bgColor: colors.errorLight },
  { type: 'kredi_karti_odeme', labelKey: 'transactions:tabs.kredi_karti_odeme', color: colors.orange, bgColor: colors.orangeLight },
  { type: 'kredi_karti_ekstre', labelKey: 'transactions:tabs.kredi_karti_ekstre', color: colors.success, bgColor: colors.successLight },
];

// Normal mod için sekmeler
const NORMAL_TABS: TransactionType[] = ['gelir', 'gider', 'transfer', 'odeme', 'tahsilat'];

// Tedarikçi cari modu için sekmeler
const TEDARIKCI_TABS: TransactionType[] = ['alis', 'satis', 'odeme', 'alis_iade'];

// Müşteri cari modu için sekmeler
const MUSTERI_TABS: TransactionType[] = ['satis', 'alis', 'tahsilat', 'satis_iade'];

// Tedarikçi cari viewer modu (paylaşılan cari - ödeme yok)
const TEDARIKCI_VIEWER_TABS: TransactionType[] = ['alis', 'satis', 'alis_iade'];

// Müşteri cari viewer modu (paylaşılan cari - tahsilat yok)
const MUSTERI_VIEWER_TABS: TransactionType[] = ['satis', 'alis', 'satis_iade'];

// Personel modu için sekmeler
const PERSONEL_TABS: TransactionType[] = ['personel_gider_tab', 'personel_satis_tab', 'personel_odeme_tab', 'personel_tahsilat_tab', 'personel_izin_hakki_tab', 'personel_izin_kullanimi_tab'];

// Personel izin modu (sadece izin hakki + kullanimi)
const PERSONEL_IZIN_TABS: TransactionType[] = ['personel_izin_hakki_tab', 'personel_izin_kullanimi_tab'];

// Kredi kartı modu için sekmeler
const KREDI_KARTI_TABS: TransactionType[] = ['kredi_karti_gider', 'kredi_karti_odeme', 'kredi_karti_ekstre'];

export function TransactionTypeTabs({ value, onChange, onTabPress, mode = 'normal' }: TransactionTypeTabsProps) {
  const { t } = useTranslation('transactions');

  const handlePress = useCallback(
    (type: TransactionType) => {
      if (type !== value) {
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onChange(type);
      }
    },
    [value, onChange]
  );

  // Moda göre görünecek sekmeleri filtrele
  const visibleTabs = useMemo(() => {
    let tabTypes: TransactionType[];
    switch (mode) {
      case 'tedarikci':
        tabTypes = TEDARIKCI_TABS;
        break;
      case 'musteri':
        tabTypes = MUSTERI_TABS;
        break;
      case 'tedarikci_viewer':
        tabTypes = TEDARIKCI_VIEWER_TABS;
        break;
      case 'musteri_viewer':
        tabTypes = MUSTERI_VIEWER_TABS;
        break;
      case 'personel':
        tabTypes = PERSONEL_TABS;
        break;
      case 'personel_izin':
        tabTypes = PERSONEL_IZIN_TABS;
        break;
      case 'kredi_karti':
        tabTypes = KREDI_KARTI_TABS;
        break;
      default:
        tabTypes = NORMAL_TABS;
    }
    return ALL_TABS.filter(tab => tabTypes.includes(tab.type));
  }, [mode]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="always"
    >
      {visibleTabs.map((tab) => {
        const isActive = value === tab.type;

        return (
          <TouchableOpacity
            key={tab.type}
            style={[
              styles.tab,
              isActive && { backgroundColor: tab.bgColor },
            ]}
            onPress={() => handlePress(tab.type)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.tabText,
                isActive && styles.tabTextActive,
              ]}
            >
              {t(tab.labelKey)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export function getTransactionTypeColor(type: TransactionType): string {
  const tab = ALL_TABS.find(t => t.type === type);
  return tab?.color || colors.primary;
}

export function getTransactionTypeBgColor(type: TransactionType): string {
  const tab = ALL_TABS.find(t => t.type === type);
  return tab?.bgColor || colors.primaryLight;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textMuted,
  },
  tabTextActive: {
    fontWeight: '600',
    color: colors.text,
  },
});
