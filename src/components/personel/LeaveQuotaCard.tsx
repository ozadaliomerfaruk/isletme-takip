import { useCallback, useRef, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated, LayoutAnimation, Platform, UIManager } from 'react-native';
import { CalendarDays, Plus, ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface LeaveQuotaCardProps {
  hakEdilenGun: number;
  kullanilanGun: number;
  onAddLeave: () => void;
  onCardPress?: () => void;
}

export function LeaveQuotaCard({ hakEdilenGun, kullanilanGun, onAddLeave, onCardPress }: LeaveQuotaCardProps) {
  const { t } = useTranslation('staff');
  const progressAnim = useRef(new Animated.Value(0)).current;

  const kalanGun = hakEdilenGun - kullanilanGun;
  const progressRatio = hakEdilenGun > 0 ? Math.min(kullanilanGun / hakEdilenGun, 1) : (kullanilanGun > 0 ? 1 : 0);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progressRatio,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [progressRatio]);

  const barWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const hasData = hakEdilenGun > 0 || kullanilanGun > 0;

  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [hasData]);

  const handleAddLeave = useCallback(() => {
    onAddLeave();
  }, [onAddLeave]);

  if (!hasData) {
    return (
      <TouchableOpacity style={styles.emptyCard} onPress={handleAddLeave} activeOpacity={0.7}>
        <CalendarDays size={18} color={colors.textMuted} />
        <Text style={styles.emptyText}>{t('leave.noLeaveData')}</Text>
        <Plus size={16} color={colors.primary} />
      </TouchableOpacity>
    );
  }

  const CardWrapper = onCardPress ? TouchableOpacity : View;
  const cardWrapperProps = onCardPress ? { onPress: onCardPress, activeOpacity: 0.7 } : {};

  return (
    <CardWrapper style={styles.card} {...cardWrapperProps}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <CalendarDays size={16} color={colors.primary} />
          <Text style={styles.title}>{t('leave.leaveStatus')}</Text>
          {onCardPress && <ChevronRight size={14} color={colors.textMuted} />}
        </View>
        <TouchableOpacity style={styles.addButton} onPress={handleAddLeave} activeOpacity={0.7}>
          <Plus size={14} color={colors.primary} />
          <Text style={styles.addButtonText}>{t('leave.addLeave')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>{t('leave.entitled')}</Text>
          <Text style={styles.statValue}>
            {hakEdilenGun} {t('leave.days')}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statLabel}>{t('leave.used')}</Text>
          <Text style={[styles.statValue, { color: colors.textMuted }]}>
            {kullanilanGun} {t('leave.days')}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statLabel}>{t('leave.remaining')}</Text>
          <Text
            style={[
              styles.statValue,
              styles.remainingValue,
              { color: kalanGun > 0 ? colors.success : colors.error },
            ]}
          >
            {kalanGun} {t('leave.days')}
          </Text>
        </View>
      </View>

      <View style={styles.barContainer}>
        <Animated.View
          style={[
            styles.barFill,
            {
              width: barWidth,
              backgroundColor: progressRatio >= 1 ? colors.error : colors.primary,
            },
          ]}
        />
      </View>
    </CardWrapper>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderStyle: 'dashed',
    gap: spacing.sm,
  },
  emptyText: {
    flex: 1,
    fontSize: 13,
    color: colors.textMuted,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primaryLight,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.borderLight,
  },
  statLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  remainingValue: {
    fontWeight: '700',
  },
  barContainer: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.borderLight,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
});
