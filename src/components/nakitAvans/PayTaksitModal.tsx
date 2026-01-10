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
import { X, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { formatDateShort } from '@/lib/date';
import { getHesapIconConfig } from '@/lib/icons';
import { usePayTaksit } from '@/hooks/useNakitAvans';
import { useHesaplar } from '@/hooks/useHesaplar';
import type { NakitAvansWithRelations, NakitAvansTaksit } from '@/types/database';

export interface PayTaksitModalProps {
  taksit: NakitAvansTaksit;
  avans: NakitAvansWithRelations;
  onClose: () => void;
}

export function PayTaksitModal({ taksit, avans, onClose }: PayTaksitModalProps) {
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
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={styles.container}
          activeOpacity={1}
          onPress={() => {}}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {t('accounts:nakitAvans.actions.payInstallment')}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Taksit Info */}
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
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
          <Text variant="label" style={styles.sectionTitle}>
            {t('accounts:nakitAvans.selectPaymentAccount')}
          </Text>

          <ScrollView style={styles.accountList}>
            {paymentHesaplar.map((hesap) => {
              const iconConfig = getHesapIconConfig(hesap.type, 18);
              const isSelected = selectedHesapId === hesap.id;

              return (
                <TouchableOpacity
                  key={hesap.id}
                  style={[
                    styles.accountItem,
                    isSelected && styles.accountItemSelected,
                  ]}
                  onPress={() => {
                    if (Platform.OS !== 'web') {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                    setSelectedHesapId(hesap.id);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.accountIcon, { backgroundColor: iconConfig.backgroundColor }]}>
                    {iconConfig.icon}
                  </View>
                  <View style={styles.accountContent}>
                    <Text variant="body" style={isSelected && styles.selectedText}>
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
              styles.payButton,
              (!selectedHesapId || isPaying) && styles.payButtonDisabled,
            ]}
            onPress={handlePay}
            disabled={!selectedHesapId || isPaying}
            activeOpacity={0.8}
          >
            <Text style={styles.payButtonText}>
              {isPaying ? t('common:status.processing') : t('accounts:nakitAvans.actions.payInstallment')}
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
