import type { useRouter, Href } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

/**
 * Bir tab köküne ('/(tabs)/...') geçişin TEK doğru yolu. (tabs) href'i ASLA push/replace EDİLMEZ.
 *
 * NEDEN: expo-router 6 / React Navigation 7'de `navigate` var-olan route'a GERİ POP'lamaz — o davranış
 * ayrı bir `popTo`/`dismissTo` aksiyonuna taşındı (kaynaktan doğrulandı). Dolayısıyla bir detay/rapor/form
 * ekranındayken `push` VEYA `navigate` ile bir (tabs) route'una gitmek, mevcut (tabs)'a dönmek yerine kök
 * Stack'e YENİ bir (tabs) kopyası yığar → altta biriken ekranlar sonsuza dek kalır (sonsuz swipe-back +
 * gezindikçe yavaşlama; biriken ekranlar mounted kaldığı için her invalidation'da yeniden render/refetch).
 *
 * DOĞRU DAVRANIŞ:
 * - (tabs) İÇİNDEYKEN  → navigate (JUMP_TO: sekmeler arası geçiş. dismissTo burada no-op olur çünkü
 *   TabRouter'da POP_TO case'i yok → sekme geçişi ölür).
 * - (tabs) DIŞINDAYKEN → dismissTo (POP_TO: kök Stack'i geriye doğru en yakın (tabs)'a collapse eder ve
 *   payload'daki tab parametresiyle doğru sekmeye geçer — tek geçiş, göz kırpması yok).
 *
 * Hedef stack'te bulunamazsa (soğuk açılış / deep-link) dismissTo mevcut ekranı hedefle değiştirir → güvenli.
 */
export function goToTab(router: Router, segments: readonly string[], tabRoute: Href) {
  if (segments[0] === '(tabs)') {
    router.navigate(tabRoute);
  } else {
    router.dismissTo(tabRoute);
  }
}
