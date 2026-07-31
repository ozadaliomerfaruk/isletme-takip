import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Sabit alt aksiyon çubuğunun (kaydet/iptal) güvenli alan boşluğu.
 *
 * KLAVYEYE DUYARLI olmak ZORUNDA:
 *  • Klavye KAPALI → footer ekranın dibinde; home indicator'ı VE overlay tab
 *    bar'ı temizlemeli → insets.bottom (override'lı, bar yüksekliğini içerir).
 *  • Klavye AÇIK   → KeyboardAvoidingView footer'ı klavyenin üstüne kaldırıyor.
 *    Tab bar ve home indicator klavyenin ALTINDA kalıyor, yani temizlenecek bir
 *    şey yok → 0. Koşulsuz eklenirse footer ile klavye arasında ~118px'lik
 *    kocaman bir boşluk açılır (cihazda görüldü).
 *
 * Görsel padding'i (spacing.md gibi) çağıran ekler; bu hook yalnız GÜVENLİ ALAN
 * payını döndürür.
 */
export function useFooterBottomPadding(): number {
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    // iOS'ta will* olayları klavye animasyonuyla eş zamanlı → boşluk sıçramaz.
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return keyboardVisible ? 0 : insets.bottom;
}
