/**
 * usePendingFormSave
 *
 * Handles save (both baslangic_bakiyesi special case and normal transactions)
 * and skip/dismiss logic for pending import transactions.
 */

import { useCallback } from 'react';
import { Platform, Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { parseCurrency } from '@/lib/currency';
import { formatDateTimeForDB } from '@/lib/date';
import {
  useSavePendingAsIslem,
  useDismissPendingIslem,
  buildIslemFromPending,
} from '@/hooks/usePendingIslemler';
import { useAuthContext } from '@/contexts/AuthContext';
import { applyImportOpeningBalance } from '@/lib/importFinancialSafety';
import type { PendingIslem, IslemType } from '@/types/database';
import type { ExtendedIslemType } from './PendingTransactionForm.types';
import { toErrorMessage } from '@/lib/errors';

export interface PendingFormSaveParams {
  pendingIslem: PendingIslem | null;
  type: ExtendedIslemType;
  amount: string;
  description: string;
  safeDate: Date;
  hesapId: string | null;
  hedefHesapId: string | null;
  kategoriId: string | null;
  cariId: string | null;
  personelId: string | null;
  setIsSaving: (v: boolean) => void;
  handleDismiss: () => void;
  onSuccess?: () => void;
}

export function usePendingFormSave() {
  const { t } = useTranslation(['transactions', 'common', 'accounts', 'clients', 'staff', 'settings']);
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();
  const savePendingAsIslem = useSavePendingAsIslem();
  const dismissPending = useDismissPendingIslem();

  const handleSave = useCallback(async (params: PendingFormSaveParams) => {
    const {
      pendingIslem, type, amount, description, safeDate,
      hesapId, hedefHesapId, kategoriId, cariId, personelId,
      setIsSaving, handleDismiss, onSuccess,
    } = params;

    if (!pendingIslem) return;

    // Validate amount
    const parsedAmount = parseCurrency(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      Alert.alert(t('common:status.error'), t('transactions:validation.invalidAmount'));
      return;
    }

    // =====================================================
    // BASLANGIC BAKIYESI - Special operation
    // =====================================================
    if (type === 'baslangic_bakiyesi') {
      if (!hesapId && !cariId && !personelId) {
        Alert.alert(
          t('common:status.error'),
          'Baslangic bakiyesi icin hesap, cari veya personel secmelisiniz.'
        );
        return;
      }

      setIsSaving(true);
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      try {
        if (!isletme) throw new Error('No isletme');

        const signedBalance = pendingIslem.raw_data.isExpense ? -parsedAmount : parsedAmount;

        const targets = [
          hesapId ? { entityType: 'hesap' as const, entityId: hesapId } : null,
          cariId ? { entityType: 'cari' as const, entityId: cariId } : null,
          personelId ? { entityType: 'personel' as const, entityId: personelId } : null,
        ].filter((target): target is NonNullable<typeof target> => target !== null);

        // Sıralı çalıştırmak kilit sırasını öngörülebilir tutar. RPC mevcut işlem
        // etkisini gerçek para birimleriyle hesaplar ve bakiyeyi atomik günceller.
        for (const target of targets) {
          await applyImportOpeningBalance({
            isletmeId: isletme.id,
            entityType: target.entityType,
            entityId: target.entityId,
            amount: signedBalance,
            replaceExisting: true,
          });
        }

        await dismissPending.mutateAsync(pendingIslem.id);

        if (hesapId) queryClient.invalidateQueries({ queryKey: queryKeys.hesaplar.all() });
        if (cariId) queryClient.invalidateQueries({ queryKey: queryKeys.cariler.all() });
        if (personelId) queryClient.invalidateQueries({ queryKey: queryKeys.personel.all() });

        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        handleDismiss();
        onSuccess?.();
      } catch (error) {
        console.error('Error applying opening balance:', error);
        Alert.alert(t('common:status.error'), toErrorMessage(error) || t('common:status.error'));
      } finally {
        setIsSaving(false);
      }
      return;
    }

    // =====================================================
    // Normal transactions
    // =====================================================
    const hesapGerekmeyenTipler = ['cari_alis', 'cari_satis', 'cari_alis_iade', 'cari_satis_iade', 'personel_gider'];
    const needsHesap = !hesapGerekmeyenTipler.includes(type);
    if (needsHesap && !hesapId) {
      Alert.alert(t('common:status.error'), t('accounts:messages.noAccounts'));
      return;
    }

    if (type === 'transfer' && !hedefHesapId) {
      Alert.alert(t('common:status.error'), t('transactions:validation.selectTargetAccount'));
      return;
    }

    if (type === 'cari_odeme' && !cariId) {
      Alert.alert(t('common:status.error'), t('clients:transactionForm.selectSupplier'));
      return;
    }

    if (type === 'personel_odeme' && !personelId) {
      Alert.alert(t('common:status.error'), t('staff:transactionForm.selectPersonel'));
      return;
    }

    if (type === 'cari_tahsilat' && !cariId) {
      Alert.alert(t('common:status.error'), t('clients:transactionForm.selectCustomer'));
      return;
    }

    if (['cari_alis', 'cari_satis', 'cari_alis_iade', 'cari_satis_iade'].includes(type) && !cariId) {
      const isSupplierType = ['cari_alis', 'cari_alis_iade'].includes(type);
      const msg = isSupplierType
        ? t('clients:transactionForm.selectSupplier')
        : t('clients:transactionForm.selectCustomer');
      Alert.alert(t('common:status.error'), msg);
      return;
    }

    if (['personel_gider', 'personel_tahsilat', 'personel_satis'].includes(type) && !personelId) {
      Alert.alert(t('common:status.error'), t('staff:transactionForm.selectPersonel'));
      return;
    }

    setIsSaving(true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      const corrections = {
        type: type as IslemType,
        amount: parsedAmount,
        description: description || null,
        date: formatDateTimeForDB(safeDate),
        hesap_id: hesapId,
        hedef_hesap_id: hedefHesapId,
        kategori_id: kategoriId,
        cari_id: cariId,
        personel_id: personelId,
      };

      const islemData = buildIslemFromPending(pendingIslem, corrections);

      await savePendingAsIslem.mutateAsync({
        pendingId: pendingIslem.id,
        islemData,
      });

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      handleDismiss();
      onSuccess?.();
    } catch (error) {
      console.error('Error saving pending transaction:', error);
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('common:status.error'));
    } finally {
      setIsSaving(false);
    }
  }, [savePendingAsIslem, dismissPending, queryClient, t, isletme]);

  const handleSkip = useCallback(async (
    pendingIslem: PendingIslem | null,
    handleDismiss: () => void,
    onSuccess?: () => void,
  ) => {
    if (!pendingIslem) return;

    Alert.alert(
      t('settings:dataImport.pendingForm.skipTitle'),
      t('settings:dataImport.pendingForm.skipMessage'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.skip'),
          style: 'destructive',
          onPress: async () => {
            try {
              await dismissPending.mutateAsync(pendingIslem.id);
              if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
              handleDismiss();
              onSuccess?.();
            } catch (error) {
              console.error('Error dismissing pending transaction:', error);
              Alert.alert(t('common:status.error'), toErrorMessage(error));
            }
          },
        },
      ]
    );
  }, [dismissPending, t]);

  return { handleSave, handleSkip };
}
