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
import { supabase } from '@/lib/supabase';
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
        const signedBalance = pendingIslem.raw_data.isExpense ? -parsedAmount : parsedAmount;

        if (hesapId) {
          const { data: hesapData } = await supabase
            .from('hesaplar')
            .select('balance, initial_balance')
            .eq('id', hesapId)
            .single();
          const currentInitial = hesapData?.initial_balance ?? 0;
          const txEffect = (hesapData?.balance ?? 0) - currentInitial;
          const newBalance = signedBalance + txEffect;
          const { error } = await supabase
            .from('hesaplar')
            .update({ balance: newBalance, initial_balance: signedBalance })
            .eq('id', hesapId);
          if (error) throw error;
        }

        if (cariId) {
          const { data: cariTxs } = await supabase
            .from('islemler').select('type, amount').eq('cari_id', cariId);
          let cariTxEffect = 0;
          cariTxs?.forEach(tx => {
            const amt = Number(tx.amount) || 0;
            if (tx.type === 'cari_alis') cariTxEffect -= amt;
            else if (tx.type === 'cari_odeme') cariTxEffect += amt;
            else if (tx.type === 'cari_satis') cariTxEffect += amt;
            else if (tx.type === 'cari_tahsilat') cariTxEffect -= amt;
            else if (tx.type === 'cari_alis_iade') cariTxEffect += amt;
            else if (tx.type === 'cari_satis_iade') cariTxEffect -= amt;
          });
          const newBalance = signedBalance + cariTxEffect;
          const { error } = await supabase
            .from('cariler')
            .update({ balance: newBalance })
            .eq('id', cariId);
          if (error) throw error;
        }

        if (personelId) {
          const { data: personelTxs } = await supabase
            .from('islemler').select('type, amount').eq('personel_id', personelId);
          let personelTxEffect = 0;
          personelTxs?.forEach(tx => {
            const amt = Number(tx.amount) || 0;
            if (tx.type === 'personel_gider') personelTxEffect -= amt;
            else if (tx.type === 'personel_odeme') personelTxEffect += amt;
            else if (tx.type === 'personel_tahsilat') personelTxEffect -= amt;
            else if (tx.type === 'personel_satis') personelTxEffect += amt;
          });
          const newBalance = signedBalance + personelTxEffect;
          const { error } = await supabase
            .from('personel')
            .update({ balance: newBalance })
            .eq('id', personelId);
          if (error) throw error;
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
  }, [savePendingAsIslem, dismissPending, queryClient, t]);

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
