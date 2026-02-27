import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  AlertTriangle,
  Wallet,
  TrendingDown,
  TrendingUp,
  CheckCircle,
  CreditCard,
  Lightbulb,
  ChevronRight,
} from 'lucide-react-native';
import { Text, Card } from '@/components/ui';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { useAnalyticsInsights } from '@/hooks/useAnalyticsInsights';
import type { AnalyticsPeriod, Insight, InsightType } from '@/types/analytics';

interface InsightsWidgetProps {
  period: AnalyticsPeriod;
}

const ICON_MAP: Record<string, typeof AlertCircle> = {
  AlertCircle,
  AlertTriangle,
  Wallet,
  TrendingDown,
  TrendingUp,
  CheckCircle,
  CreditCard,
  Lightbulb,
};

const TYPE_COLORS: Record<InsightType, { bg: string; icon: string }> = {
  warning: { bg: colors.warning + '15', icon: colors.warning },
  info: { bg: colors.primary + '15', icon: colors.primary },
  success: { bg: colors.success + '15', icon: colors.success },
  tip: { bg: colors.info + '15', icon: colors.info },
};

export function InsightsWidget({ period }: InsightsWidgetProps) {
  const { t } = useTranslation('analytics');
  const router = useRouter();
  const { insights, isLoading } = useAnalyticsInsights(period);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text variant="label" color="secondary" style={styles.title}>
          {t('insights.title')}
        </Text>
        {[1, 2].map((i) => (
          <Card key={i} style={styles.card}>
            <View style={styles.cardRow}>
              <Skeleton width={32} height={32} borderRadius={16} />
              <View style={styles.cardContent}>
                <Skeleton width={200} height={14} borderRadius={4} />
                <Skeleton width={120} height={12} borderRadius={4} style={{ marginTop: 4 }} />
              </View>
            </View>
          </Card>
        ))}
      </View>
    );
  }

  if (insights.length === 0) {
    return null;
  }

  const handlePress = (insight: Insight) => {
    if (insight.action?.route) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push({ pathname: insight.action.route as any, params: insight.action.params });
    }
  };

  return (
    <View style={styles.container}>
      <Text variant="label" color="secondary" style={styles.title}>
        {t('insights.title')}
      </Text>
      {insights.map((insight) => {
        const typeColor = TYPE_COLORS[insight.type];
        const IconComponent = ICON_MAP[insight.icon] || AlertCircle;
        const hasAction = !!insight.action?.route;

        return (
          <TouchableOpacity
            key={insight.id}
            activeOpacity={hasAction ? 0.7 : 1}
            onPress={() => hasAction && handlePress(insight)}
            disabled={!hasAction}
          >
            <Card style={styles.card}>
              <View style={styles.cardRow}>
                <View style={[styles.iconContainer, { backgroundColor: typeColor.bg }]}>
                  <IconComponent size={18} color={typeColor.icon} />
                </View>
                <View style={styles.cardContent}>
                  <Text variant="body" style={styles.insightTitle}>
                    {insight.title}
                  </Text>
                  {insight.subtitle && (
                    <Text variant="caption" color="secondary">
                      {insight.subtitle}
                    </Text>
                  )}
                </View>
                {hasAction && (
                  <ChevronRight size={18} color={colors.textMuted} />
                )}
              </View>
            </Card>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  title: {
    marginBottom: spacing.xs,
  },
  card: {
    padding: spacing.md,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    gap: 2,
  },
  insightTitle: {
    fontSize: 14,
    lineHeight: 20,
  },
});
