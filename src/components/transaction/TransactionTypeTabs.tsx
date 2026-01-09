import { useCallback, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';

// Normal mod: gelir, gider, transfer, odeme, tahsilat
// Cari mod (tedarikci): odeme, alis, alis_iade
// Cari mod (musteri): tahsilat, satis, satis_iade
// Personel mod: personel_odeme_tab, personel_gider_tab, personel_tahsilat_tab
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
  | 'personel_tahsilat_tab';

export type TransactionTabMode = 'normal' | 'tedarikci' | 'musteri' | 'personel';

interface TransactionTypeTabsProps {
  value: TransactionType;
  onChange: (type: TransactionType) => void;
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
];

// Normal mod için sekmeler
const NORMAL_TABS: TransactionType[] = ['gelir', 'gider', 'transfer', 'odeme', 'tahsilat'];

// Tedarikçi cari modu için sekmeler
const TEDARIKCI_TABS: TransactionType[] = ['odeme', 'alis', 'alis_iade'];

// Müşteri cari modu için sekmeler
const MUSTERI_TABS: TransactionType[] = ['tahsilat', 'satis', 'satis_iade'];

// Personel modu için sekmeler
const PERSONEL_TABS: TransactionType[] = ['personel_odeme_tab', 'personel_gider_tab', 'personel_tahsilat_tab'];

export function TransactionTypeTabs({ value, onChange, mode = 'normal' }: TransactionTypeTabsProps) {
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
      case 'personel':
        tabTypes = PERSONEL_TABS;
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
