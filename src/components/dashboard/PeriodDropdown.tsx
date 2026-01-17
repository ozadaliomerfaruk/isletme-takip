import { useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';

import { Text } from '@/components/ui';
import { ActionSheet, ActionSheetOption } from '@/components/ui/ActionSheet';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import type { PeriodType } from '@/lib/date';

interface PeriodDropdownProps {
  periodLabel: string;
  periodType: PeriodType;
  onPeriodChange: (type: PeriodType) => void;
  onNavigate: (direction: -1 | 1) => void;
  onCustomDatePress?: () => void;
  showNavigation?: boolean;
}

export function PeriodDropdown({
  periodLabel,
  periodType,
  onPeriodChange,
  onNavigate,
  onCustomDatePress,
  showNavigation = true,
}: PeriodDropdownProps) {
  const { t } = useTranslation(['reports', 'common']);
  const [showActionSheet, setShowActionSheet] = useState(false);

  const handleBadgePress = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setShowActionSheet(true);
  }, []);

  const handleNavigate = useCallback((direction: -1 | 1) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
    onNavigate(direction);
  }, [onNavigate]);

  const handlePeriodSelect = useCallback((type: PeriodType) => {
    if (type === 'custom' && onCustomDatePress) {
      onCustomDatePress();
    } else {
      onPeriodChange(type);
    }
  }, [onPeriodChange, onCustomDatePress]);

  const periodOptions: ActionSheetOption[] = [
    {
      label: t('reports:period.yearly'),
      onPress: () => handlePeriodSelect('yearly'),
    },
    {
      label: t('reports:period.monthly'),
      onPress: () => handlePeriodSelect('monthly'),
    },
    {
      label: t('reports:period.weekly'),
      onPress: () => handlePeriodSelect('weekly'),
    },
    {
      label: t('reports:period.daily'),
      onPress: () => handlePeriodSelect('daily'),
    },
    {
      label: t('reports:period.custom'),
      onPress: () => handlePeriodSelect('custom'),
    },
  ];

  // Don't show navigation for custom period type
  const shouldShowNavigation = showNavigation && periodType !== 'custom';

  return (
    <View style={styles.container}>
      {/* Left Navigation */}
      {shouldShowNavigation && (
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => handleNavigate(-1)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ChevronLeft size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      )}

      {/* Period Badge */}
      <TouchableOpacity
        style={styles.badge}
        onPress={handleBadgePress}
        activeOpacity={0.7}
      >
        <Text style={styles.badgeText}>{periodLabel}</Text>
        <ChevronDown size={14} color={colors.primary} style={styles.chevron} />
      </TouchableOpacity>

      {/* Right Navigation */}
      {shouldShowNavigation && (
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => handleNavigate(1)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ChevronRight size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      )}

      {/* ActionSheet */}
      <ActionSheet
        visible={showActionSheet}
        onClose={() => setShowActionSheet(false)}
        title={t('reports:period.selectPeriod')}
        options={periodOptions}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  navButton: {
    padding: spacing.xs,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.lg,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.primary,
  },
  chevron: {
    marginLeft: spacing.xs,
  },
});
