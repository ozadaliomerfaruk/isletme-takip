import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

/**
 * Ekran YENİDEN odaklandığında (başka ekrandan geri dönüş) verilen refetch fonksiyonlarını
 * çağırır. İLK odağı ATLAR — mount zaten çektiği için çift-fetch olmaz.
 *
 * Neden: Raporlarda odak-refetch YOKTU. Kullanıcı bir raporu açıp (ör. Gelir-Gider),
 * başka ekranda değişiklik yapıp (ör. ürüne kategori atama) rapora dönünce ekran bayat
 * kalıyordu; mutation invalidation'ı query'yi stale işaretlese de ekran remount olmuyor
 * ya da odakta refetch tetiklenmiyordu. Bu hook dönüşte ilgili raporu anlık tazeler.
 */
export function useRefetchOnFocus(refetchFns: Array<(() => unknown) | undefined>): void {
  const isFirstFocus = useRef(true);
  const fnsRef = useRef(refetchFns);
  fnsRef.current = refetchFns;

  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      for (const fn of fnsRef.current) {
        try {
          fn?.();
        } catch {
          /* refetch hatasını yut — sorgu kendi hata durumunu yönetir */
        }
      }
    }, [])
  );
}
