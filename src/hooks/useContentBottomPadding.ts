import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FLOATING_SEARCH_CLEARANCE } from '@/components/ui/FloatingSearchBar';

interface Options {
  /**
   * Bu ekranda yüzen arama çubuğu var mı. true ise FLOATING_SEARCH_CLEARANCE
   * kendiliğinden eklenir — "sabiti eklemeyi unuttum mu?" sorusu ortadan kalkar.
   */
  search?: boolean;
  /** Ek boşluk (ör. ekrana özel bir yüzen kart). */
  extra?: number;
}

/**
 * Kaydırma İÇERİĞİNİN alt boşluğu — `contentContainerStyle.paddingBottom`'a verilir.
 *
 * Adı bilinçli olarak "content" içeriyor: container padding'iyle karıştırılmasın.
 * Container'a alt boşluk konursa görünür alan kısalır ve içerik cam tab bar'ın
 * altından akamaz (bkz. Screen.tsx'teki kural).
 *
 * insets.bottom, _layout'un override'ı sayesinde gerçek safe-area'ya EK OLARAK
 * overlay tab bar'ın yüksekliğini de taşır → son satır bar'ın altında kalmaz.
 */
export function useContentBottomPadding({ search = false, extra = 0 }: Options = {}): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + (search ? FLOATING_SEARCH_CLEARANCE : 0) + extra;
}
