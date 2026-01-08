import { useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';

export type TransactionType = 'gelir' | 'gider' | 'transfer' | 'odeme' | 'tahsilat';

interface TransactionTypeTabsProps {
  value: TransactionType;
  onChange: (type: TransactionType) => void;
}

const TABS: { type: TransactionType; label: string; color: string; bgColor: string }[] = [
  { type: 'gelir', label: 'Gelir', color: colors.success, bgColor: colors.successLight },
  { type: 'gider', label: 'Gider', color: colors.error, bgColor: colors.errorLight },
  { type: 'transfer', label: 'Transfer', color: colors.info, bgColor: colors.infoLight },
  { type: 'odeme', label: 'Ödeme', color: colors.orange, bgColor: colors.orangeLight },
  { type: 'tahsilat', label: 'Tahsilat', color: colors.primary, bgColor: colors.primaryLight },
];

export function TransactionTypeTabs({ value, onChange }: TransactionTypeTabsProps) {
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

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {TABS.map((tab) => {
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
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export function getTransactionTypeColor(type: TransactionType): string {
  const tab = TABS.find(t => t.type === type);
  return tab?.color || colors.primary;
}

export function getTransactionTypeBgColor(type: TransactionType): string {
  const tab = TABS.find(t => t.type === type);
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
