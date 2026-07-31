import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  CalendarClock,
  Clock3,
  TrendingDown,
  TrendingUp,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { AnimatedPressable, Text } from '@/components/ui';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import {
  CariPickerSheet,
  type CariPickerMode,
} from '@/components/transaction/QuickTransactionBar/components';
import { colors } from '@/constants/colors';
import { borderRadius, spacing } from '@/constants/spacing';
import { useCariler } from '@/hooks/useCariler';
import { usePermissions } from '@/hooks/usePermissions';
import type { CariType } from '@/types/database';

type TrackingKind = 'taksit' | 'vade';

interface TrackingQuickStartCardProps {
  kind: TrackingKind;
}

export function TrackingQuickStartCard({ kind }: TrackingQuickStartCardProps) {
  const { t } = useTranslation('transactions');
  const { canCreateTransactionType } = usePermissions();
  const canCreateSale = canCreateTransactionType('cari_satis');
  const canCreatePurchase = canCreateTransactionType('cari_alis');
  const canCreateAny = canCreateSale || canCreatePurchase;

  const { data: musteriler } = useCariler(
    'musteri',
    false,
    false,
    canCreateSale,
  );
  const { data: tedarikciler } = useCariler(
    'tedarikci',
    false,
    false,
    canCreatePurchase,
  );

  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerMode, setPickerMode] = useState<CariPickerMode>('customer');
  const [qtbCari, setQtbCari] = useState<{
    id: string;
    type: CariType;
  } | null>(null);

  const openPicker = useCallback((mode: CariPickerMode) => {
    setPickerMode(mode);
    setPickerVisible(true);
  }, []);

  const handleCariSelect = useCallback((cariId: string) => {
    const cariType: CariType =
      pickerMode === 'customer' ? 'musteri' : 'tedarikci';
    setPickerVisible(false);
    setTimeout(() => setQtbCari({ id: cariId, type: cariType }), 300);
  }, [pickerMode]);

  const isTaksit = kind === 'taksit';
  const HeroIcon = isTaksit ? CalendarClock : Clock3;

  return (
    <>
      <View style={styles.card}>
        <View style={styles.headingRow}>
          <View style={styles.heroIcon}>
            <HeroIcon size={22} color={colors.primary} strokeWidth={2.2} />
          </View>
          <View style={styles.headingCopy}>
            <Text style={styles.eyebrow}>
              {t(
                canCreateAny
                  ? `${kind}.quickStartEyebrow`
                  : `${kind}.trackingEyebrow`,
              )}
            </Text>
            <Text variant="h3" style={styles.title}>
              {t(
                canCreateAny
                  ? `${kind}.quickStartTitle`
                  : `${kind}.trackingTitle`,
              )}
            </Text>
          </View>
        </View>

        <Text variant="bodySmall" color="secondary" style={styles.description}>
          {t(
            canCreateAny
              ? `${kind}.quickStartDescription`
              : `${kind}.trackingDescription`,
          )}
        </Text>

        {canCreateAny ? (
          <View style={styles.actionRow}>
            {canCreateSale ? (
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel={t(`${kind}.addSale`)}
                style={[styles.action, styles.saleAction]}
                onPress={() => openPicker('customer')}
                enableHaptic
              >
                <View style={[styles.actionIcon, styles.saleIcon]}>
                  <TrendingUp size={18} color={colors.successDark} />
                </View>
                <Text style={[styles.actionText, styles.saleText]} numberOfLines={2}>
                  {t(`${kind}.addSale`)}
                </Text>
              </AnimatedPressable>
            ) : null}

            {canCreatePurchase ? (
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel={t(`${kind}.addPurchase`)}
                style={[styles.action, styles.purchaseAction]}
                onPress={() => openPicker('supplier')}
                enableHaptic
              >
                <View style={[styles.actionIcon, styles.purchaseIcon]}>
                  <TrendingDown size={18} color={colors.errorDark} />
                </View>
                <Text style={[styles.actionText, styles.purchaseText]} numberOfLines={2}>
                  {t(`${kind}.addPurchase`)}
                </Text>
              </AnimatedPressable>
            ) : null}
          </View>
        ) : null}
      </View>

      <CariPickerSheet
        visible={pickerVisible}
        onDismiss={() => setPickerVisible(false)}
        onSelect={handleCariSelect}
        cariler={pickerMode === 'customer' ? (musteriler ?? []) : (tedarikciler ?? [])}
        selectedId={null}
        mode={pickerMode}
      />

      <QuickTransactionBar
        visible={!!qtbCari}
        onDismiss={() => setQtbCari(null)}
        defaultCariId={qtbCari?.id}
        defaultCariType={qtbCari?.type}
        defaultType={qtbCari?.type === 'tedarikci' ? 'alis' : 'satis'}
        onSuccess={() => setQtbCari(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius['2xl'],
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#D7ECE6',
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  headingCopy: {
    flex: 1,
    gap: 1,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.primaryDark,
    lineHeight: 23,
  },
  description: {
    marginTop: spacing.sm,
    lineHeight: 19,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  action: {
    flex: 1,
    minHeight: 52,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
  },
  saleAction: {
    backgroundColor: '#F7FFFC',
    borderColor: '#C9EBDD',
  },
  purchaseAction: {
    backgroundColor: '#FFF9F9',
    borderColor: '#F5DADA',
  },
  actionIcon: {
    width: 30,
    height: 30,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saleIcon: {
    backgroundColor: colors.successLight,
  },
  purchaseIcon: {
    backgroundColor: colors.errorLight,
  },
  actionText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
  },
  saleText: {
    color: colors.successDark,
  },
  purchaseText: {
    color: colors.errorDark,
  },
});
