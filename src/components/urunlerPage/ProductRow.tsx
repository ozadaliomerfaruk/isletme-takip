import { useCallback, memo } from 'react';
import { View, StyleSheet, TouchableOpacity, GestureResponderEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Package, ArrowRightLeft, History, MoreVertical } from 'lucide-react-native';
import { Text, Button, ExpandableCard } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, HIT_SLOP } from '@/constants/spacing';
import { formatCurrency, formatQuantity } from '@/lib/currency';
import type { Urun, BirimType } from '@/types/database';

interface DonemOzet { giris: number; cikis: number; girisTutar: number; cikisTutar: number }

interface ProductRowProps {
  urun: Urun;
  expanded: boolean;
  onToggle: (id: string) => void;
  onNewTransaction: (urun: Urun) => void;
  onViewMovements: (id: string) => void;
  onOpenActionSheet: (urun: Urun) => void;
  urunOzet?: DonemOzet;
  kategoriAdi?: string;
  getBirimLabel: (birim: BirimType) => string;
  /** Dönem özeti pill'leri miktar mı tutar mı gösterecek (varsayılan miktar). */
  ozetMode?: 'miktar' | 'tutar';
}

export const ProductRow = memo(function ProductRow({
  urun, expanded, onToggle, onNewTransaction, onViewMovements, onOpenActionSheet,
  urunOzet, kategoriAdi, getBirimLabel, ozetMode = 'miktar',
}: ProductRowProps) {
  const { t } = useTranslation(['products', 'common']);
  const hasMovements = urunOzet && (urunOzet.giris > 0 || urunOzet.cikis > 0);

  const handleToggle = useCallback(() => onToggle(urun.id), [onToggle, urun.id]);
  const handleTransaction = useCallback(() => onNewTransaction(urun), [onNewTransaction, urun]);
  const handleMovements = useCallback(() => onViewMovements(urun.id), [onViewMovements, urun.id]);
  const handleActionSheet = useCallback((e: GestureResponderEvent) => {
    e.stopPropagation();
    onOpenActionSheet(urun);
  }, [onOpenActionSheet, urun]);

  return (
    <View style={rowStyles.wrapper}>
      <ExpandableCard
        expanded={expanded}
        onToggle={handleToggle}
        header={
          <View style={rowStyles.header}>
            <View style={rowStyles.iconWrap}>
              <Package size={18} color={colors.primary} />
            </View>
            <View style={rowStyles.info}>
              <View style={rowStyles.nameRow}>
                <Text variant="body" style={rowStyles.name} numberOfLines={1}>{urun.ad}</Text>
                {urun.kod ? (
                  <View style={rowStyles.codeBadge}>
                    <Text style={rowStyles.codeBadgeText}>{urun.kod}</Text>
                  </View>
                ) : null}
              </View>
              <View style={rowStyles.metaRow}>
                <Text variant="caption" color="secondary">
                  {formatQuantity(urun.miktar)} {getBirimLabel(urun.birim)}
                </Text>
                {urun.satis_fiyati > 0 && (
                  <Text variant="caption" color="secondary">
                    {formatCurrency(urun.satis_fiyati, urun.currency)}/{getBirimLabel(urun.birim)}
                  </Text>
                )}
                {kategoriAdi && (
                  <View style={rowStyles.categoryChip}>
                    <Text style={rowStyles.categoryChipText}>{kategoriAdi}</Text>
                  </View>
                )}
              </View>
            </View>
            <View style={rowStyles.periodSummary}>
              {hasMovements ? (
                <>
                  {(ozetMode === 'tutar' ? urunOzet.girisTutar > 0 : urunOzet.giris > 0) && (
                    <View style={rowStyles.pillIn}>
                      <Text style={rowStyles.pillInText}>
                        {ozetMode === 'tutar'
                          ? formatCurrency(urunOzet.girisTutar, urun.currency)
                          : `+${formatQuantity(urunOzet.giris)}`}
                      </Text>
                    </View>
                  )}
                  {(ozetMode === 'tutar' ? urunOzet.cikisTutar > 0 : urunOzet.cikis > 0) && (
                    <View style={rowStyles.pillOut}>
                      <Text style={rowStyles.pillOutText}>
                        {ozetMode === 'tutar'
                          ? formatCurrency(urunOzet.cikisTutar, urun.currency)
                          : `-${formatQuantity(urunOzet.cikis)}`}
                      </Text>
                    </View>
                  )}
                </>
              ) : null}
            </View>
            <TouchableOpacity
              style={rowStyles.moreBtn}
              onPress={handleActionSheet}
              hitSlop={HIT_SLOP.md}
            >
              <MoreVertical size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        }
      >
        <View style={rowStyles.actions}>
          <Button
            variant="primary"
            size="sm"
            icon={<ArrowRightLeft size={16} color={colors.white} />}
            iconPosition="left"
            onPress={handleTransaction}
            style={rowStyles.actionBtn}
          >
            {t('products:actions.newTransaction')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<History size={16} color={colors.primary} />}
            iconPosition="left"
            onPress={handleMovements}
            style={rowStyles.actionBtn}
          >
            {t('products:actions.viewMovements')}
          </Button>
        </View>
      </ExpandableCard>
    </View>
  );
});

interface ArchivedProductRowProps {
  urun: Urun;
  expanded: boolean;
  onToggle: (id: string) => void;
  onViewMovements: (id: string) => void;
  onOpenActionSheet: (urun: Urun) => void;
  getBirimLabel: (birim: BirimType) => string;
}

export const ArchivedProductRow = memo(function ArchivedProductRow({
  urun, expanded, onToggle, onViewMovements, onOpenActionSheet, getBirimLabel,
}: ArchivedProductRowProps) {
  const { t } = useTranslation(['products', 'common']);

  const handleToggle = useCallback(() => onToggle(urun.id), [onToggle, urun.id]);
  const handleMovements = useCallback(() => onViewMovements(urun.id), [onViewMovements, urun.id]);
  const handleActionSheet = useCallback((e: GestureResponderEvent) => {
    e.stopPropagation();
    onOpenActionSheet(urun);
  }, [onOpenActionSheet, urun]);

  return (
    <View style={rowStyles.wrapper}>
      <ExpandableCard
        expanded={expanded}
        onToggle={handleToggle}
        header={
          <View style={rowStyles.header}>
            <Package size={24} color={colors.textMuted} />
            <View style={rowStyles.info}>
              <Text variant="body" color="secondary">{urun.ad}</Text>
              <Text variant="caption" color="muted">
                {formatQuantity(urun.miktar)} {getBirimLabel(urun.birim)}
                {urun.kod && ` • ${urun.kod}`}
              </Text>
            </View>
            <TouchableOpacity
              style={rowStyles.moreBtn}
              onPress={handleActionSheet}
              hitSlop={HIT_SLOP.md}
            >
              <MoreVertical size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        }
      >
        <View style={rowStyles.actions}>
          <Button
            variant="outline"
            size="sm"
            icon={<History size={16} color={colors.primary} />}
            iconPosition="left"
            onPress={handleMovements}
            style={rowStyles.actionBtn}
          >
            {t('products:actions.viewMovements')}
          </Button>
        </View>
      </ExpandableCard>
    </View>
  );
});

const rowStyles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  codeBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
  },
  codeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  categoryChip: {
    backgroundColor: colors.background,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  periodSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  // giriş = ALIŞ → kırmızı, çıkış = SATIŞ → yeşil (gelir/gider mantığı; ürün detayıyla tutarlı)
  pillIn: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  pillInText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.error,
  },
  pillOut: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  pillOutText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.success,
  },
  moreBtn: {
    padding: spacing.xs,
    marginLeft: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionBtn: {
    flex: 1,
  },
});
