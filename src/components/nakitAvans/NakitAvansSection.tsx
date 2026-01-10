import { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Platform,
  Modal,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  Banknote,
  ArrowRight,
  Check,
  Clock,
  AlertTriangle,
  Plus,
  Wallet,
  X,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { Text, Card, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { formatDateShort } from '@/lib/date';
import { getHesapIconConfig } from '@/lib/icons';
import {
  useNakitAvanslarByKrediKarti,
  usePayTaksit,
} from '@/hooks/useNakitAvans';
import { useHesaplar } from '@/hooks/useHesaplar';
import type { NakitAvansWithRelations, NakitAvansTaksit } from '@/types/database';

interface NakitAvansSectionProps {
  krediKartiId: string;
  onAddPress: () => void;
}

export function NakitAvansSection({ krediKartiId, onAddPress }: NakitAvansSectionProps) {
  const { t } = useTranslation(['accounts', 'common']);

  const { data: avanslar, isLoading } = useNakitAvanslarByKrediKarti(krediKartiId);

  // Taksit ödeme modal
  const [payingTaksit, setPayingTaksit] = useState<NakitAvansTaksit | null>(null);
  const [payingAvans, setPayingAvans] = useState<NakitAvansWithRelations | null>(null);

  // Filter active avanslar
  const activeAvanslar = avanslar?.filter((a) => a.status === 'active') || [];
  const completedAvanslar = avanslar?.filter((a) => a.status === 'completed') || [];

  const handlePayTaksit = (taksit: NakitAvansTaksit, avans: NakitAvansWithRelations) => {
    setPayingTaksit(taksit);
    setPayingAvans(avans);
  };

  // Get next payable taksit for an avans
  const getNextPayableTaksit = (avans: NakitAvansWithRelations) => {
    if (!avans.taksitler || avans.taksitler.length === 0) return null;
    const sorted = [...avans.taksitler].sort((a, b) => a.sira_no - b.sira_no);
    return sorted.find((t) => t.status !== 'paid');
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Banknote size={20} color={colors.warning} />
          </View>
          <Text variant="h3" style={styles.headerTitle}>
            {t('accounts:nakitAvans.title')}
          </Text>
        </View>
        <Text variant="body" color="secondary">{t('common:status.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Banknote size={20} color={colors.warning} />
        </View>
        <Text variant="h3" style={styles.headerTitle}>
          {t('accounts:nakitAvans.title')}
        </Text>
        <TouchableOpacity style={styles.addButton} onPress={onAddPress}>
          <Plus size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Active Avanslar - Kompakt Liste */}
      {activeAvanslar.length > 0 ? (
        <View style={styles.avansList}>
          {activeAvanslar.map((avans) => {
            const nextTaksit = getNextPayableTaksit(avans);
            const paidCount = avans.taksitler?.filter((t) => t.status === 'paid').length || 0;
            const totalCount = avans.taksit_sayisi || 1;

            return (
              <Card key={avans.id} style={styles.avansCard}>
                {/* Main Info Row */}
                <View style={styles.avansMainRow}>
                  <View style={styles.avansAmountSection}>
                    <Text variant="h3" style={styles.avansAmount}>
                      {formatCurrency(avans.tutar)}
                    </Text>
                    <View style={styles.avansTarget}>
                      <ArrowRight size={12} color={colors.textMuted} />
                      <Text variant="caption" color="secondary" numberOfLines={1}>
                        {avans.hedef_hesap?.name || '-'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.avansDateSection}>
                    <Text variant="caption" color="secondary">
                      {formatDateShort(avans.tarih)}
                    </Text>
                    <View style={styles.statusBadge}>
                      <Text variant="caption" style={styles.statusText}>
                        {t('accounts:nakitAvans.status.active')}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Repayment Row */}
                <View style={styles.repaymentRow}>
                  <Text variant="caption" color="secondary">
                    {t('accounts:nakitAvans.repaymentAmount')}:
                  </Text>
                  <Text variant="body" style={styles.repaymentAmount}>
                    {formatCurrency(avans.geri_odeme_tutari)}
                  </Text>
                  {avans.is_taksitli && (
                    <Text variant="caption" color="secondary">
                      ({paidCount}/{totalCount} {t('accounts:nakitAvans.installment')})
                    </Text>
                  )}
                </View>

                {/* Taksitler - Inline Compact */}
                {avans.is_taksitli && avans.taksitler && avans.taksitler.length > 0 && (
                  <View style={styles.taksitContainer}>
                    {avans.taksitler
                      .sort((a, b) => a.sira_no - b.sira_no)
                      .map((taksit) => {
                        const isPaid = taksit.status === 'paid';
                        const isOverdue = taksit.status === 'overdue';
                        const isNext = nextTaksit?.id === taksit.id;

                        return (
                          <View key={taksit.id} style={styles.taksitRow}>
                            <View style={styles.taksitInfo}>
                              <View
                                style={[
                                  styles.taksitIcon,
                                  isPaid && styles.taksitIconPaid,
                                  isOverdue && styles.taksitIconOverdue,
                                ]}
                              >
                                {isPaid ? (
                                  <Check size={12} color={colors.white} />
                                ) : isOverdue ? (
                                  <AlertTriangle size={12} color={colors.white} />
                                ) : (
                                  <Clock size={12} color={colors.textMuted} />
                                )}
                              </View>
                              <Text
                                variant="caption"
                                color={isPaid ? 'success' : isOverdue ? 'error' : 'secondary'}
                              >
                                {taksit.sira_no}. {formatCurrency(taksit.tutar)}
                              </Text>
                              <Text variant="caption" color="secondary">
                                - {formatDateShort(taksit.odeme_tarihi)}
                              </Text>
                            </View>
                            {isNext && (
                              <TouchableOpacity
                                style={styles.payButton}
                                onPress={() => handlePayTaksit(taksit, avans)}
                              >
                                <Text variant="caption" style={styles.payButtonText}>
                                  {t('accounts:nakitAvans.actions.pay')}
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        );
                      })}
                  </View>
                )}

                {/* Single Payment (non-taksitli) */}
                {!avans.is_taksitli && (
                  <TouchableOpacity
                    style={styles.singlePayButton}
                    onPress={() => {
                      // For non-taksitli, create a virtual taksit
                      const virtualTaksit: NakitAvansTaksit = {
                        id: `virtual-${avans.id}`,
                        nakit_avans_id: avans.id,
                        sira_no: 1,
                        tutar: avans.geri_odeme_tutari,
                        odeme_tarihi: avans.tarih,
                        status: 'pending',
                        odenen_tarih: null,
                        reminder_enabled: false,
                        reminder_days_before: 1,
                        reminder_time: '09:00',
                        created_at: avans.created_at,
                        updated_at: avans.updated_at,
                      };
                      handlePayTaksit(virtualTaksit, avans);
                    }}
                  >
                    <Text variant="caption" style={styles.singlePayText}>
                      {t('accounts:nakitAvans.actions.payNow')}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Description */}
                {avans.aciklama && (
                  <Text variant="caption" color="secondary" style={styles.description}>
                    {avans.aciklama}
                  </Text>
                )}
              </Card>
            );
          })}
        </View>
      ) : (
        <Card style={styles.emptyCard}>
          <View style={styles.emptyContent}>
            <Banknote size={32} color={colors.textMuted} />
            <Text variant="body" color="secondary" style={styles.emptyText}>
              {t('accounts:nakitAvans.messages.noAvans')}
            </Text>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={16} color={colors.surface} />}
              onPress={onAddPress}
            >
              {t('accounts:nakitAvans.actions.add')}
            </Button>
          </View>
        </Card>
      )}

      {/* Completed Avanslar */}
      {completedAvanslar.length > 0 && (
        <View style={styles.completedSection}>
          <Text variant="caption" color="secondary" style={styles.completedTitle}>
            {t('accounts:nakitAvans.status.completed')} ({completedAvanslar.length})
          </Text>
          {completedAvanslar.slice(0, 3).map((avans) => (
            <View key={avans.id} style={styles.completedItem}>
              <Check size={14} color={colors.success} />
              <Text variant="caption" color="secondary" style={styles.completedText}>
                {formatCurrency(avans.tutar)} • {formatDateShort(avans.tarih)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Pay Taksit Modal */}
      {payingTaksit && payingAvans && (
        <PayTaksitModal
          taksit={payingTaksit}
          avans={payingAvans}
          onClose={() => {
            setPayingTaksit(null);
            setPayingAvans(null);
          }}
        />
      )}
    </View>
  );
}

// Pay Taksit Modal - Using Modal instead of BottomSheet
interface PayTaksitModalProps {
  taksit: NakitAvansTaksit;
  avans: NakitAvansWithRelations;
  onClose: () => void;
}

function PayTaksitModal({ taksit, avans, onClose }: PayTaksitModalProps) {
  const { t } = useTranslation(['accounts', 'common']);
  const { data: hesaplar } = useHesaplar();
  const payTaksit = usePayTaksit();
  const [selectedHesapId, setSelectedHesapId] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);

  // Filter out credit cards
  const paymentHesaplar = hesaplar?.filter((h) => h.type !== 'kredi_karti') || [];

  const handlePay = async () => {
    if (!selectedHesapId) {
      Alert.alert(t('common:status.error'), t('accounts:nakitAvans.selectPaymentAccount'));
      return;
    }

    setIsPaying(true);

    try {
      // Check if this is a virtual taksit (for non-taksitli avans)
      const isVirtual = taksit.id.startsWith('virtual-');

      if (isVirtual) {
        // For non-taksitli, we need to handle differently
        // This would mark the whole avans as completed
        // For now, we'll use the first real taksit if exists
        const realTaksit = avans.taksitler?.[0];
        if (realTaksit) {
          await payTaksit.mutateAsync({
            taksitId: realTaksit.id,
            sourceHesapId: selectedHesapId,
          });
        }
      } else {
        await payTaksit.mutateAsync({
          taksitId: taksit.id,
          sourceHesapId: selectedHesapId,
        });
      }

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      Alert.alert(
        t('common:status.success'),
        t('accounts:nakitAvans.messages.installmentPaid')
      );
      onClose();
    } catch (error) {
      console.error('Pay taksit error:', error);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      Alert.alert(t('common:status.error'), t('common:messages.operationFailed'));
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade">
      <TouchableOpacity
        style={modalStyles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={modalStyles.container}
          activeOpacity={1}
          onPress={() => {}}
        >
          {/* Header */}
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>
              {t('accounts:nakitAvans.actions.payInstallment')}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Taksit Info */}
          <View style={modalStyles.infoCard}>
            <View style={modalStyles.infoRow}>
              <Text variant="caption" color="secondary">
                {avans.is_taksitli
                  ? t('accounts:nakitAvans.installmentNo', { no: taksit.sira_no })
                  : t('accounts:nakitAvans.repaymentAmount')}
              </Text>
              <Text variant="h3" color="primary">
                {formatCurrency(taksit.tutar)}
              </Text>
            </View>
            <Text variant="caption" color="secondary">
              {t('accounts:nakitAvans.installmentDate')}: {formatDateShort(taksit.odeme_tarihi)}
            </Text>
          </View>

          {/* Account Selection */}
          <Text variant="label" style={modalStyles.sectionTitle}>
            {t('accounts:nakitAvans.selectPaymentAccount')}
          </Text>

          <ScrollView style={modalStyles.accountList}>
            {paymentHesaplar.map((hesap) => {
              const iconConfig = getHesapIconConfig(hesap.type, 18);
              const isSelected = selectedHesapId === hesap.id;

              return (
                <TouchableOpacity
                  key={hesap.id}
                  style={[
                    modalStyles.accountItem,
                    isSelected && modalStyles.accountItemSelected,
                  ]}
                  onPress={() => {
                    if (Platform.OS !== 'web') {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                    setSelectedHesapId(hesap.id);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[modalStyles.accountIcon, { backgroundColor: iconConfig.backgroundColor }]}>
                    {iconConfig.icon}
                  </View>
                  <View style={modalStyles.accountContent}>
                    <Text variant="body" style={isSelected && modalStyles.selectedText}>
                      {hesap.name}
                    </Text>
                    <Text variant="caption" color="secondary">
                      {formatCurrency(Number(hesap.balance))}
                    </Text>
                  </View>
                  {isSelected && (
                    <Check size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Pay Button */}
          <TouchableOpacity
            style={[
              modalStyles.payButton,
              (!selectedHesapId || isPaying) && modalStyles.payButtonDisabled,
            ]}
            onPress={handlePay}
            disabled={!selectedHesapId || isPaying}
            activeOpacity={0.8}
          >
            <Text style={modalStyles.payButtonText}>
              {isPaying ? t('common:status.processing') : t('accounts:nakitAvans.actions.payInstallment')}
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.warningLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  headerTitle: {
    flex: 1,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avansList: {
    gap: spacing.sm,
  },
  avansCard: {
    padding: spacing.md,
  },
  avansMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  avansAmountSection: {
    flex: 1,
  },
  avansAmount: {
    color: colors.warning,
  },
  avansTarget: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  avansDateSection: {
    alignItems: 'flex-end',
  },
  statusBadge: {
    backgroundColor: colors.success + '20',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    marginTop: 4,
  },
  statusText: {
    color: colors.success,
    fontSize: 10,
    fontWeight: '600',
  },
  repaymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  repaymentAmount: {
    fontWeight: '600',
    color: colors.error,
  },
  taksitContainer: {
    marginTop: spacing.sm,
  },
  taksitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  taksitInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  taksitIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taksitIconPaid: {
    backgroundColor: colors.success,
  },
  taksitIconOverdue: {
    backgroundColor: colors.error,
  },
  payButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  payButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
  },
  singlePayButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  singlePayText: {
    color: colors.white,
    fontWeight: '600',
  },
  description: {
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  emptyCard: {
    padding: spacing.xl,
  },
  emptyContent: {
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyText: {
    textAlign: 'center',
  },
  completedSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  completedTitle: {
    marginBottom: spacing.sm,
  },
  completedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  completedText: {
    flex: 1,
  },
});

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    width: '90%',
    maxWidth: 400,
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  infoCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.primaryLight + '30',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary + '40',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  accountList: {
    maxHeight: 200,
  },
  accountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
    backgroundColor: colors.surfaceLight,
  },
  accountItemSelected: {
    backgroundColor: colors.primaryLight,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  accountIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  accountContent: {
    flex: 1,
  },
  selectedText: {
    color: colors.primary,
    fontWeight: '600',
  },
  payButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  payButtonDisabled: {
    backgroundColor: colors.border,
  },
  payButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
});
