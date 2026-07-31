import { Modal as RNModal, type ModalProps } from 'react-native';
import { ModalInsets } from './ModalInsets';

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
 * Props RN Modal ile birebir aynı; davranış farkı yok.
 */
export function Modal({ children, ...props }: ModalProps) {
  return (
    <RNModal {...props}>
      <ModalInsets>{children}</ModalInsets>
    </RNModal>
  );
}
