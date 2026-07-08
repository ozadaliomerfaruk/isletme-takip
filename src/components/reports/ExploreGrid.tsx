import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  PieChart,
  Wallet,
  Building2,
  Users,
  GitCompareArrows,
  ShoppingCart,
  TrendingUp,
} from 'lucide-react-native';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';

interface ExploreGridProps {
  onPress: (route: string) => void;
}

const REPORT_CARDS = [
  { id: 'genel', icon: BarChart3, labelKey: 'reports:explore.genel', route: '/raporlar/genel', color: colors.primary },
  { id: 'net-varlik-trend', icon: TrendingUp, labelKey: 'reports:explore.netWorthTrend', route: '/raporlar/net-varlik-trend', color: colors.success },
  { id: 'kategori-dagilimi', icon: PieChart, labelKey: 'reports:explore.kategoriDagilimi', route: '/raporlar/gelir-gider', color: colors.info },
  { id: 'nakit', icon: Wallet, labelKey: 'reports:explore.nakit', route: '/nakit-akisi', color: colors.success },
  { id: 'cari', icon: Building2, labelKey: 'reports:explore.cari', route: '/raporlar/cari', color: colors.warning },
  { id: 'personel', icon: Users, labelKey: 'reports:explore.personel', route: '/raporlar/personel', color: colors.info },
  { id: 'alis-satis', icon: ShoppingCart, labelKey: 'reports:explore.alisSatis', route: '/raporlar/alis-satis', color: colors.orange },
  { id: 'karsilastirma', icon: GitCompareArrows, labelKey: 'reports:explore.karsilastirma', route: '/raporlar/karsilastirma', color: colors.primary },
] as const;

export function ExploreGrid({ onPress }: ExploreGridProps) {
  const { t } = useTranslation(['reports']);

  return (
    <View style={styles.container}>
      <Text variant="label" color="secondary" style={styles.title}>
        {t('reports:home.explore')}
      </Text>
      <View style={styles.grid}>
        {REPORT_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <TouchableOpacity
              key={card.id}
              style={styles.card}
              onPress={() => onPress(card.route)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconContainer, { backgroundColor: card.color + '15' }]}>
                <Icon size={22} color={card.color} />
              </View>
              <Text variant="caption" style={styles.cardLabel} numberOfLines={2}>
                {t(card.labelKey)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  title: {
    marginBottom: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  card: {
    width: '23%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  cardLabel: {
    textAlign: 'center',
    fontSize: 11,
  },
});
