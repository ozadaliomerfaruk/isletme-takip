import { useCallback } from 'react';
import type { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { makeMutable, withSpring } from 'react-native-reanimated';

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
/**
 * Yay, timing DEĞİL: kaydırma yönü sürekli değişiyor; yay hedef değişince hızı
 * koruyarak yeniden yönlenir, timing eğrisi sıfırdan başlayıp mekanik durur.
 * KRİTİK SÖNÜMLÜ (dampingRatio 1): bu animasyon LAYOUT sürüyor (yükseklik +
 * marginHorizontal) — taşma olsa bar hedefi aşıp geri gelir, uzun oturma
 * kuyruğu da her karede layout hesabı demek olurdu.
 */
const COLLAPSE_SPRING = { duration: 380, dampingRatio: 1 };
const DELTA = 6; // yön eşiği (px) — küçük titremeleri yok say

export function useTabBarScroll() {
  return useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    // Lastik-bant taşmasını KIRP: iOS'ta tepede y negatife, dipte maxY'nin
    // üstüne çıkar; geri yaylanırken dy işaret değiştirip bar'ı bir kare
    // açıp kapatır (görünür titreme). Kırpınca taşma yönü hiç üretilmez.
    const maxY = Math.max(contentSize.height - layoutMeasurement.height, 0);
    const y = Math.min(Math.max(contentOffset.y, 0), maxY);
    const dy = y - lastY;
    lastY = y;
    let next = target;
    if (y <= 4) next = 0;              // tepeye yakın → daima açık
    else if (dy > DELTA) next = 1;     // aşağı → daralt
    else if (dy < -DELTA) next = 0;    // yukarı → aç
    if (next !== target) {
      target = next;
      tabBarCollapsed.value = withSpring(next, COLLAPSE_SPRING);
    }
  }, []);
}

/** Sekme değişince bar'ı aç + scroll referansını sıfırla (PersistentTabBar kullanır). */
export function resetTabBarCollapse() {
  lastY = 0;
  target = 0;
  tabBarCollapsed.value = withSpring(0, COLLAPSE_SPRING);
}
