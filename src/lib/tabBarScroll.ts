import { useCallback } from 'react';
import type { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { makeMutable, withTiming } from 'react-native-reanimated';

/**
 * Sekme bar'ı "daralma" durumu (Revolut deseni): aşağı kaydırınca yazılar solup bar kısalır,
 * yukarı kaydırınca / tepeye gelince geri açılır.
 *
 * `tabBarCollapsed`: 0 = açık (ikon+yazı), 1 = daralmış (yalnız ikon). MODÜL-DÜZEYİ shared
 * value — PersistentTabBar tek örnek (app ömrü boyunca yaşar), 5 sekme ekranı onScroll ile
 * besler, bar UI-thread'de okuyup animasyonu sürer. lastY/target JS-thread var'ları
 * (onScroll JS callback'i) — yön eşiğiyle jitter elenir, withTiming yalnız YÖN DEĞİŞİNCE tetiklenir.
 */
export const tabBarCollapsed = makeMutable(0);

let lastY = 0;
let target = 0;
const DUR = 200;
const DELTA = 6; // yön eşiği (px) — küçük titremeleri yok say

export function useTabBarScroll() {
  return useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastY;
    lastY = y;
    let next = target;
    if (y <= 4) next = 0;              // tepeye yakın → daima açık
    else if (dy > DELTA) next = 1;     // aşağı → daralt
    else if (dy < -DELTA) next = 0;    // yukarı → aç
    if (next !== target) {
      target = next;
      tabBarCollapsed.value = withTiming(next, { duration: DUR });
    }
  }, []);
}

/** Sekme değişince bar'ı aç + scroll referansını sıfırla (PersistentTabBar kullanır). */
export function resetTabBarCollapse() {
  lastY = 0;
  target = 0;
  tabBarCollapsed.value = withTiming(0, { duration: DUR });
}
