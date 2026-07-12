import { useCallback } from 'react';
import { useToast } from '@/contexts/ToastContext';
import { useHaptics } from '@/hooks/useHaptics';

/**
 * Tam-sayfa formlarda başarılı kayıt geri bildirimi (A3): başarı haptiği + toast.
 * Navigasyon ÇAĞIRANA bırakılır (formdan forma değişir: router.back / push / replace).
 *
 * Neden bloke eden `Alert.alert` yerine bu: eski desende başarı Alert'i mutlu yolu keser VE
 * `{cancelable:false}` olmadığından Android'de dışarı-dokunuş/geri-tuşu Alert'i kapatınca
 * OK butonunun onPress'i (=router.back) HİÇ çalışmaz → form açık kalır, submit yeniden
 * aktifleşir → yanlışlıkla ÇİFT KAYIT. Haptik+toast bloke etmez; çağıran hemen navigate eder.
 *
 * Not: yalnız form katmanında kullanılır. QuickTransactionBar kendi haptik/toast'unu
 * verdiğinden bu hook'u KULLANMAZ (çift geri bildirim olmaz).
 *
 * Kullanım:
 *   const notifySaved = useSaveSuccessFeedback();
 *   // mutation onSuccess:
 *   notifySaved(t('transactions:messages.saveSuccess'));
 *   router.back();
 */
export function useSaveSuccessFeedback() {
  const { showToast } = useToast();
  const { success } = useHaptics();

  return useCallback(
    (message: string) => {
      success();
      showToast(message, 'success');
    },
    [showToast, success]
  );
}
