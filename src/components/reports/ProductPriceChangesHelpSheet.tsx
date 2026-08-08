import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { CircleHelp, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { BottomSheet, Button, Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { borderRadius, spacing } from '@/constants/spacing';

interface ProductPriceChangesHelpSheetProps {
  visible: boolean;
  onDismiss: () => void;
}

const HELP_SHEET_SNAP_POINTS = [0.86];

const PRICE_TRANSITIONS = [
  { from: 40, to: 35, kind: 'decrease' },
  { from: 35, to: 25, kind: 'decrease' },
  { from: 25, to: 30, kind: 'increase' },
  { from: 30, to: 35, kind: 'increase' },
  { from: 35, to: 30, kind: 'decrease' },
  { from: 30, to: 25, kind: 'decrease' },
] as const;

const SAVINGS_ROWS = [
  { price: 40, quantity: 15, paid: 600, savings: 0 },
  { price: 35, quantity: 38, paid: 1330, savings: 190 },
  { price: 30, quantity: 35, paid: 1050, savings: 350 },
  { price: 25, quantity: 89, paid: 2225, savings: 1335 },
] as const;

export function ProductPriceChangesHelpSheet({
  visible,
  onDismiss,
}: ProductPriceChangesHelpSheetProps) {
  const { t, i18n } = useTranslation('reports');
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'tr';
  const locale = language.startsWith('tr') ? 'tr-TR' : 'en-US';
  const moneyFormatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'TRY',
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
  });
  const numberFormatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  });

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      snapPoints={HELP_SHEET_SNAP_POINTS}
      enablePanDownToClose
      enableBackdropDismiss
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={styles.titleIcon}>
              <CircleHelp size={22} color={colors.primary} />
            </View>
            <View style={styles.titleCopy}>
              <Text variant="h3">
                {t('purchaseSales.priceChanges.help.title')}
              </Text>
              <Text variant="bodySmall" color="secondary" style={styles.subtitle}>
                {t('purchaseSales.priceChanges.help.subtitle')}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={onDismiss}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel={t('purchaseSales.priceChanges.help.close')}
          >
            <X size={21} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.outcomeCard}>
            <Text variant="body" bold>
              {t('purchaseSales.priceChanges.help.outcomeTitle')}
            </Text>
            <View style={styles.outcomeGrid}>
              <View style={styles.outcomeItem}>
                <Text variant="caption" color="secondary">
                  {t('purchaseSales.priceChanges.help.startPrice')}
                </Text>
                <Text variant="body" bold>{moneyFormatter.format(40)}</Text>
              </View>
              <View style={styles.outcomeItem}>
                <Text variant="caption" color="secondary">
                  {t('purchaseSales.priceChanges.help.endPrice')}
                </Text>
                <Text variant="body" bold>{moneyFormatter.format(25)}</Text>
              </View>
              <View style={styles.outcomeItem}>
                <Text variant="caption" color="secondary">
                  {t('purchaseSales.priceChanges.help.netChange')}
                </Text>
                <Text variant="body" color="successDark" bold>
                  {t('purchaseSales.priceChanges.help.netChangeValue')}
                </Text>
              </View>
              <View style={styles.outcomeItem}>
                <Text variant="caption" color="secondary">
                  {t('purchaseSales.priceChanges.help.percentChange')}
                </Text>
                <Text variant="body" color="successDark" bold>
                  {t('purchaseSales.priceChanges.help.percentChangeValue')}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text variant="body" bold>
              {t('purchaseSales.priceChanges.help.transitionTitle')}
            </Text>
            <Text variant="bodySmall" color="secondary" style={styles.sectionBody}>
              {t('purchaseSales.priceChanges.help.transitionBody')}
            </Text>
            <View style={styles.transitionList}>
              {PRICE_TRANSITIONS.map((transition, index) => {
                const isIncrease = transition.kind === 'increase';
                return (
                  <View
                    key={`${transition.from}-${transition.to}-${index}`}
                    style={styles.transitionRow}
                  >
                    <Text variant="bodySmall" bold>
                      {moneyFormatter.format(transition.from)} →{' '}
                      {moneyFormatter.format(transition.to)}
                    </Text>
                    <View
                      style={[
                        styles.transitionBadge,
                        isIncrease
                          ? styles.transitionBadgeIncrease
                          : styles.transitionBadgeDecrease,
                      ]}
                    >
                      <Text
                        variant="caption"
                        color={isIncrease ? 'errorDark' : 'successDark'}
                        bold
                      >
                        {t(`purchaseSales.priceChanges.help.${transition.kind}`)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
            <Text variant="bodySmall" color="secondary" style={styles.transitionSummary}>
              {t('purchaseSales.priceChanges.help.transitionSummary')}
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="body" bold>
              {t('purchaseSales.priceChanges.help.referenceTitle')}
            </Text>
            <Text variant="bodySmall" color="secondary" style={styles.sectionBody}>
              {t('purchaseSales.priceChanges.help.referenceBody')}
            </Text>
          </View>

          <View style={styles.exampleCard}>
            <Text variant="body" bold>
              {t('purchaseSales.priceChanges.help.calculationTitle')}
            </Text>
            <Text variant="bodySmall" color="secondary" style={styles.sectionBody}>
              {t('purchaseSales.priceChanges.help.calculationIntro')}
            </Text>

            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <Text variant="caption" color="secondary" style={styles.priceCell}>
                  {t('purchaseSales.priceChanges.help.tablePrice')}
                </Text>
                <Text variant="caption" color="secondary" style={styles.quantityCell}>
                  {t('purchaseSales.priceChanges.help.tableQuantity')}
                </Text>
                <Text variant="caption" color="secondary" style={styles.amountCell}>
                  {t('purchaseSales.priceChanges.help.tablePaid')}
                </Text>
                <Text variant="caption" color="secondary" style={styles.amountCell}>
                  {t('purchaseSales.priceChanges.help.tableSavings')}
                </Text>
              </View>
              {SAVINGS_ROWS.map((row) => (
                <View key={row.price} style={styles.tableRow}>
                  <Text variant="caption" bold style={styles.priceCell}>
                    {moneyFormatter.format(row.price)}
                  </Text>
                  <Text variant="caption" style={styles.quantityCell}>
                    {numberFormatter.format(row.quantity)} kg
                  </Text>
                  <Text variant="caption" style={styles.amountCell}>
                    {moneyFormatter.format(row.paid)}
                  </Text>
                  <Text variant="caption" color="successDark" bold style={styles.amountCell}>
                    {moneyFormatter.format(row.savings)}
                  </Text>
                </View>
              ))}
              <View style={[styles.tableRow, styles.tableTotalRow]}>
                <Text variant="caption" bold style={styles.priceCell}>
                  {t('purchaseSales.priceChanges.help.tableTotal')}
                </Text>
                <Text variant="caption" bold style={styles.quantityCell}>177 kg</Text>
                <Text variant="caption" bold style={styles.amountCell}>
                  {moneyFormatter.format(5205)}
                </Text>
                <Text variant="caption" color="successDark" bold style={styles.amountCell}>
                  {moneyFormatter.format(1875)}
                </Text>
              </View>
            </View>

            <View style={styles.resultRow}>
              <View style={styles.calculationCopy}>
                <Text variant="bodySmall" color="successDark" bold>
                  {t('purchaseSales.priceChanges.help.savingsLabel')}
                </Text>
                <Text variant="caption" color="successDark">
                  {t('purchaseSales.priceChanges.help.savingsFormula')}
                </Text>
              </View>
              <Text variant="h3" color="successDark">
                {moneyFormatter.format(1875)}
              </Text>
            </View>
            <Text variant="bodySmall" color="secondary" style={styles.conclusion}>
              {t('purchaseSales.priceChanges.help.conclusion')}
            </Text>
          </View>

          <View style={styles.explanationCard}>
            <Text variant="body" bold>
              {t('purchaseSales.priceChanges.help.whyTitle')}
            </Text>
            <Text variant="bodySmall" color="secondary" style={styles.sectionBody}>
              {t('purchaseSales.priceChanges.help.whyBody')}
            </Text>
          </View>

          <View style={styles.perspectiveCard}>
            <Text variant="body" bold>
              {t('purchaseSales.priceChanges.help.perspectiveTitle')}
            </Text>
            <Text variant="bodySmall" color="secondary" style={styles.perspectiveRow}>
              <Text bold>{t('purchaseSales.priceChanges.help.changeCountLabel')}: </Text>
              {t('purchaseSales.priceChanges.help.changeCountBody')}
            </Text>
            <Text variant="bodySmall" color="secondary" style={styles.perspectiveRow}>
              <Text bold>{t('purchaseSales.priceChanges.help.savingsViewLabel')}: </Text>
              {t('purchaseSales.priceChanges.help.savingsViewBody')}
            </Text>
          </View>

          <Text variant="caption" color="secondary" style={styles.note}>
            {t('purchaseSales.priceChanges.help.note')}
          </Text>
        </ScrollView>

        <View style={styles.footer}>
          <Button fullWidth onPress={onDismiss}>
            {t('purchaseSales.priceChanges.help.gotIt')}
          </Button>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  titleCopy: {
    flex: 1,
  },
  subtitle: {
    marginTop: 2,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceLighter,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  section: {
    paddingHorizontal: spacing.xs,
  },
  sectionBody: {
    marginTop: spacing.xs,
    lineHeight: 21,
  },
  outcomeCard: {
    padding: spacing.md,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.successLight,
    borderWidth: 1,
    borderColor: colors.success + '45',
  },
  outcomeGrid: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.md,
  },
  outcomeItem: {
    width: '50%',
  },
  transitionList: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  transitionRow: {
    minHeight: 42,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  transitionBadge: {
    minWidth: 62,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    borderRadius: borderRadius.full,
  },
  transitionBadgeIncrease: {
    backgroundColor: colors.errorLight,
  },
  transitionBadgeDecrease: {
    backgroundColor: colors.successLight,
  },
  transitionSummary: {
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  exampleCard: {
    padding: spacing.md,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceLight,
  },
  table: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  tableRow: {
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tableHeader: {
    minHeight: 38,
    backgroundColor: colors.surfaceLighter,
  },
  tableTotalRow: {
    backgroundColor: colors.primaryLight,
    borderBottomWidth: 0,
  },
  priceCell: {
    width: 56,
  },
  quantityCell: {
    width: 56,
    textAlign: 'right',
  },
  amountCell: {
    flex: 1,
    textAlign: 'right',
  },
  calculationCopy: {
    flex: 1,
  },
  resultRow: {
    minHeight: 66,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.successLight,
  },
  conclusion: {
    marginTop: spacing.md,
    lineHeight: 21,
  },
  explanationCard: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.warningLight,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  perspectiveCard: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.infoLight,
  },
  perspectiveRow: {
    marginTop: spacing.sm,
    lineHeight: 21,
  },
  note: {
    paddingHorizontal: spacing.xs,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
