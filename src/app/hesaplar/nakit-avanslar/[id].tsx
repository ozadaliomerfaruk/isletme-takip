import { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Banknote,
  ArrowRight,
  Check,
  Clock,
  AlertTriangle,
  Plus,
  CreditCard,
  Pencil,
  Trash2,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { Text, Card, Button, EmptyState } from '@/components/ui';
import { NakitAvansSheet } from '@/components/nakitAvans';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { formatDateShort } from '@/lib/date';
import { useHesap } from '@/hooks/useHesaplar';
import { useNakitAvanslarByKrediKarti, useDeleteNakitAvans } from '@/hooks/useNakitAvans';
import type { NakitAvansWithRelations } from '@/types/database';

export default function NakitAvanslarPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation(['accounts', 'common']);

  const { data: hesap, isLoading: hesapLoading } = useHesap(id!);
  const { data: avanslar, isLoading: avanslarLoading } = useNakitAvanslarByKrediKarti(id!);
  const deleteNakitAvans = useDeleteNakitAvans();

  const [showNakitAvansSheet, setShowNakitAvansSheet] = useState(false);
  const [editingAvans, setEditingAvans] = useState<NakitAvansWithRelations | null>(null);

  // Track completed avanslar for "Tebrikler" message
  const prevCompletedIdsRef = useRef<Set<string>>(new Set());

  // Filter active and completed avanslar
  const activeAvanslar = avanslar?.filter((a) => a.status === 'active') || [];
  const completedAvanslar = avanslar?.filter((a) => a.status === 'completed') || [];

  // Show "Tebrikler" message when an avans becomes completed
  useEffect(() => {
    if (!avanslar) return;

    const currentCompletedIds = new Set(
      avanslar.filter((a) => a.status === 'completed').map((a) => a.id)
    );

    // Check for newly completed avans
    currentCompletedIds.forEach((id) => {
      if (!prevCompletedIdsRef.current.has(id)) {
        // New completion detected - show congratulations message
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        Alert.alert(
          t('accounts:nakitAvans.messages.congratulations'),
          t('accounts:nakitAvans.messages.allInstallmentsPaid')
        );
      }
    });

    prevCompletedIdsRef.current = currentCompletedIds;
  }, [avanslar, t]);

  const handleEditAvans = (avans: NakitAvansWithRelations) => {
    setEditingAvans(avans);
    setShowNakitAvansSheet(true);
  };

  const handleDeleteAvans = (avans: NakitAvansWithRelations) => {
    Alert.alert(
      t('common:buttons.delete'),
      t('accounts:nakitAvans.messages.deleteConfirm'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNakitAvans.mutateAsync(avans.id);
              if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
            } catch (error) {
              if (__DEV__) {
                console.error('Delete avans error:', error);
              }
              Alert.alert(t('common:status.error'), t('common:messages.operationFailed'));
            }
          },
        },
      ]
    );
  };

  const isLoading = hesapLoading || avanslarLoading;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <Text>{t('common:status.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!hesap || hesap.type !== 'kredi_karti') {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <EmptyState
          icon={<CreditCard size={48} color={colors.textMuted} />}
          title={t('errors:account.notFound')}
          description={t('accounts:messages.noCreditCards')}
        />
      </SafeAreaView>
    );
  }

  return (
    <>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Kredi Kartı Bilgisi */}
          <Card style={styles.creditCardInfo}>
            <View style={styles.creditCardRow}>
              <View style={styles.creditCardIcon}>
                <CreditCard size={24} color={colors.warning} />
              </View>
              <View style={styles.creditCardDetails}>
                <Text variant="body" style={styles.creditCardName}>{hesap.name}</Text>
                <Text variant="caption" color="secondary">
                  {t('accounts:creditCard.currentDebt')}: {formatCurrency(Math.abs(Number(hesap.balance)))}
                </Text>
              </View>
            </View>
          </Card>

          {/* Yeni Nakit Avans Butonu */}
          <View style={styles.addButtonContainer}>
            <Button
              variant="primary"
              size="md"
              icon={<Plus size={18} color={colors.surface} />}
              onPress={() => setShowNakitAvansSheet(true)}
              style={styles.addButton}
            >
              {t('accounts:nakitAvans.actions.add')}
            </Button>
          </View>

          {/* Aktif Nakit Avanslar */}
          <View style={styles.section}>
            <Text variant="h3" style={styles.sectionTitle}>
              {t('accounts:nakitAvans.status.active')} ({activeAvanslar.length})
            </Text>

            {activeAvanslar.length > 0 ? (
              activeAvanslar.map((avans) => {
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

                    {/* Taksitler */}
                    {avans.is_taksitli && avans.taksitler && avans.taksitler.length > 0 && (
                      <View style={styles.taksitContainer}>
                        {avans.taksitler
                          .sort((a, b) => a.sira_no - b.sira_no)
                          .map((taksit) => {
                            const isPaid = taksit.status === 'paid';
                            const isOverdue = taksit.status === 'overdue';

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
                                    {taksit.sira_no}/{totalCount}
                                  </Text>
                                  <Text variant="caption" style={isPaid ? styles.paidAmount : styles.pendingAmount}>
                                    {formatCurrency(taksit.tutar)}
                                  </Text>
                                  <Text variant="caption" color="secondary">
                                    {formatDateShort(taksit.odeme_tarihi)}
                                  </Text>
                                </View>
                              </View>
                            );
                          })}
                      </View>
                    )}

                    {/* Tek seferlik ödeme bilgisi */}
                    {!avans.is_taksitli && (
                      <View style={styles.singlePaymentInfo}>
                        <View style={styles.taksitIcon}>
                          <Clock size={12} color={colors.textMuted} />
                        </View>
                        <Text variant="caption" color="secondary">
                          {t('accounts:nakitAvans.installment')}: {formatCurrency(avans.geri_odeme_tutari)}
                        </Text>
                        <Text variant="caption" color="secondary">
                          {formatDateShort(avans.tarih)}
                        </Text>
                      </View>
                    )}

                    {/* Description */}
                    {avans.aciklama && (
                      <Text variant="caption" color="secondary" style={styles.description}>
                        {avans.aciklama}
                      </Text>
                    )}

                    {/* Action Buttons */}
                    <View style={styles.avansActions}>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleEditAvans(avans)}
                      >
                        <Pencil size={14} color={colors.text} />
                        <Text variant="caption">{t('common:buttons.edit')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.deleteButton]}
                        onPress={() => handleDeleteAvans(avans)}
                      >
                        <Trash2 size={14} color={colors.error} />
                        <Text variant="caption" color="error">{t('common:buttons.delete')}</Text>
                      </TouchableOpacity>
                    </View>
                  </Card>
                );
              })
            ) : (
              <Card style={styles.emptyCard}>
                <View style={styles.emptyContent}>
                  <Banknote size={32} color={colors.textMuted} />
                  <Text variant="body" color="secondary" style={styles.emptyText}>
                    {t('accounts:nakitAvans.messages.noAvans')}
                  </Text>
                </View>
              </Card>
            )}
          </View>

          {/* Tamamlanmış Nakit Avanslar */}
          {completedAvanslar.length > 0 && (
            <View style={styles.section}>
              <Text variant="h3" style={styles.sectionTitle}>
                {t('accounts:nakitAvans.status.completed')} ({completedAvanslar.length})
              </Text>

              {completedAvanslar.map((avans) => (
                <Card key={avans.id} style={styles.completedCard}>
                  <View style={styles.completedRow}>
                    <View style={styles.completedIcon}>
                      <Check size={16} color={colors.success} />
                    </View>
                    <View style={styles.completedInfo}>
                      <Text variant="body">{formatCurrency(avans.tutar)}</Text>
                      <Text variant="caption" color="secondary">
                        {avans.hedef_hesap?.name} • {formatDateShort(avans.tarih)}
                      </Text>
                    </View>
                    <Text variant="body" color="success">
                      {formatCurrency(avans.geri_odeme_tutari)}
                    </Text>
                  </View>
                </Card>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Nakit Avans Ekleme/Düzenleme Sheet */}
      <NakitAvansSheet
        visible={showNakitAvansSheet}
        onDismiss={() => {
          setShowNakitAvansSheet(false);
          setEditingAvans(null);
        }}
        creditCard={hesap}
        editingAvans={editingAvans}
        onSuccess={() => {
          setShowNakitAvansSheet(false);
          setEditingAvans(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  creditCardInfo: {
    margin: spacing.lg,
  },
  creditCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  creditCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.warningLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creditCardDetails: {
    flex: 1,
  },
  creditCardName: {
    fontWeight: '600',
  },
  addButtonContainer: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  addButton: {
    width: '100%',
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.md,
  },
  avansCard: {
    padding: spacing.md,
    marginBottom: spacing.sm,
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
  paidAmount: {
    color: colors.success,
    textDecorationLine: 'line-through',
  },
  pendingAmount: {
    fontWeight: '600',
    color: colors.text,
  },
  singlePaymentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
  },
  description: {
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  avansActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceLight,
  },
  deleteButton: {
    backgroundColor: colors.errorLight,
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
  completedCard: {
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  completedIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedInfo: {
    flex: 1,
  },
});
