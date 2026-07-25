/**
 * Overlay tab bar'ın görünürlüğü ve hangi sekmeye ait olduğu — TEK KAYNAK.
 *
 * İki tüketici var ve ikisi de AYNI cevabı almalı:
 *  • PersistentTabBar → bar'ı çizip çizmeyeceği ve hangi sekmenin aktif olduğu
 *  • _layout          → insets.bottom'a bar yüksekliğini ekleyip eklemeyeceği
 *
 * Ayrı ayrı hesaplanırsa bar'ın olmadığı ekranlarda (giriş, onboarding) hayalet
 * bir alt boşluk kalır. Ayrıca "şu ekranlarda bar gizlensin" kararı ileride
 * verilirse tek yerde değişir, inset'ler kendiliğinden uyar.
 */
export function getActiveTab(segments: readonly string[]): string | null {
  const first = segments[0];
  const second = segments[1];

  if (first === '(auth)' || first === 'onboarding' || first === 'verify') return null;

  if (first === '(tabs)') {
    if (!second || second === 'index') return 'home';
    if (second === 'cariler') return 'cariler';
    if (second === 'personel') return 'personel';
    if (second === 'urunler') return 'urunler';
    if (second === 'daha') return 'daha';
    return 'home';
  }

  if (first === 'cariler') return 'cariler';
  if (first === 'personel') return 'personel';
  if (first === 'urunler') return 'urunler';
  if (first === 'hesaplar') return 'home';
  if (first === 'islemler') return 'home';
  if (first === 'nakit-akisi') return 'home';
  if (first === 'arama') return 'home';
  if (first === 'foto-import') return 'home';

  if (first === 'raporlar') return 'daha';
  if (first === 'ayarlar') return 'daha';
  if (first === 'kategoriler') return 'daha';
  if (first === 'notlar') return 'daha';
  if (first === 'arsiv') return 'daha';
  if (first === 'taksit') return 'daha';
  if (first === 'yasal') return 'daha';

  return 'home';
}

/** Bar bu rotada çiziliyor mu — inset override'ı da buna bağlı. */
export function isTabBarVisible(segments: readonly string[]): boolean {
  return getActiveTab(segments) !== null;
}
