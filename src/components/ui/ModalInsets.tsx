import { createContext, useContext, type ReactNode } from 'react';
import {
  SafeAreaInsetsContext,
  useSafeAreaInsets,
  type EdgeInsets,
} from 'react-native-safe-area-context';

/**
 * _layout'un yayınladığı GERÇEK (override'sız) safe-area değerleri.
 * Yalnız ModalInsets tüketir; ekranlar override'lı olanı kullanmaya devam eder.
 */
export const RealInsetsContext = createContext<EdgeInsets | null>(null);

/**
 * Modalı döndüren bileşenin kendi hook'ları ModalInsets sağlayıcısının DIŞINDA
 * çalışır. Bu nedenle sheet yüksekliğini/padding'ini aynı bileşende hesaplayan
 * yüzeyler gerçek kök inset'ini doğrudan bu hook ile okumalıdır.
 */
export function useModalSafeAreaInsets(): EdgeInsets {
  const inherited = useSafeAreaInsets();
  return useContext(RealInsetsContext) ?? inherited;
}

/**
 * MODAL İÇİ ALT BOŞLUK DÜZELTMESİ — her `<Modal>`'ın içeriği bununla sarılır.
 *
 * SORUN: iOS'ta `<Modal>` AYRI BİR NATIVE PENCEREDE açılıyor. PersistentTabBar
 * kök View'in içinde kaldığı için modalın ALTINDA kalıyor, yani çizilmiyor.
 * Ama React ağacı değişmediğinden modal içindeki useSafeAreaInsets() hâlâ
 * _layout'un override'lı değerini (gerçek safe-area + tab bar yüksekliği)
 * döndürüyor → bar'ın GÖRÜNMEDİĞİ her sheet'te ~72px hayalet alt boşluk.
 *
 * tabBarVisibility bunu kapatmaz: karar ROTA bazlı ve rota açısından bar
 * görünür durumda; sorun modalın onu örtmesi.
 *
 * ÇÖZÜM: modalın alt ağacı için SafeAreaInsetsContext'i GERÇEK değerle yeniden
 * sağlanır. O andan itibaren modal içindeki her şey — Screen ve
 * useContentBottomPadding dahil — doğru değeri kendiliğinden alır; dosya başına
 * düşünmek gerekmez.
 */
export function ModalInsets({ children }: { children: ReactNode }) {
  const real = useContext(RealInsetsContext);
  if (!real) return <>{children}</>;
  return (
    <SafeAreaInsetsContext.Provider value={real}>{children}</SafeAreaInsetsContext.Provider>
  );
}
