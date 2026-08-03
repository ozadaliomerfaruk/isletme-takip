import { Modal as RNModal, StyleSheet, View, type ModalProps } from 'react-native';
import { ModalInsets } from './ModalInsets';

export interface AppModalProps extends ModalProps {
  /**
   * Zaten acik bir native Modal icinde gosterilecek picker/sheet icin yeni bir
   * native pencere acmaz; parent modalin icinde mutlak konumlu katman kullanir.
   */
  inline?: boolean;
}

/**
 * React Native'in Modal'ının yerine geçen sarmalayıcı — içeriğini otomatik
 * olarak ModalInsets ile sarar.
 *
 * NEDEN: iOS'ta Modal AYRI BİR NATIVE PENCEREDE açılıyor; PersistentTabBar kök
 * View'in içinde kaldığı için modalın altında kalıyor, yani çizilmiyor. Ama
 * React ağacı değişmediğinden modal içindeki useSafeAreaInsets() hâlâ
 * _layout'un override'lı değerini (gerçek safe-area + tab bar yüksekliği)
 * döndürüyor → bar'ın GÖRÜNMEDİĞİ her sheet'te ~72px hayalet alt boşluk.
 *
 * NEDEN SARMALAYICI: düzeltmeyi 26 dosyada tek tek <ModalInsets> yazarak yapmak
 * hem kırılgan (yuvalanmış modallarda JSX ağacı bozulabiliyor) hem de her yeni
 * modalda yeniden hatırlanması gereken bir şey olurdu. Import'u değiştirmek
 * yeterli: `from 'react-native'` → `from '@/components/ui'`. Yeni modal yazan
 * kimse ayrıca bir şey düşünmez.
 *
 * Props RN Modal ile birebir aynı; `inline` yalnız nested-modal güvenliği içindir.
 */
export function Modal({ children, inline = false, visible = true, ...props }: AppModalProps) {
  if (inline) {
    if (!visible) return null;

    return (
      <View
        style={styles.inlineRoot}
        pointerEvents="box-none"
        accessibilityViewIsModal
      >
        <ModalInsets>{children}</ModalInsets>
      </View>
    );
  }

  return (
    <RNModal visible={visible} {...props}>
      <ModalInsets>{children}</ModalInsets>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  inlineRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
});
