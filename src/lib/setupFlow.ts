/**
 * Onboarding v1.5 — kurulum akışı durumu
 *
 * "needs setup" bayrağı YALNIZCA yeni işletme oluşturulduğunda set edilir
 * (useAuth.fetchOrCreateIsletme create yolu). Mevcut kullanıcılar bayrağı
 * hiç görmez — davranışları değişmez.
 *
 * Modül-seviyesi cache + abone listesi: _layout'taki yönlendirme kapısının
 * (useSyncExternalStore) bayrak temizlenince anında güncellenmesi için.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const NEEDS_SETUP_KEY = '@defter_needs_setup';

let needsSetupCache = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/** Uygulama açılışında bir kez çağrılır (\_layout). */
export async function loadNeedsSetup(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(NEEDS_SETUP_KEY);
    needsSetupCache = value === 'true';
  } catch {
    needsSetupCache = false;
  }
  emit();
  return needsSetupCache;
}

export function getNeedsSetupSync(): boolean {
  return needsSetupCache;
}

export function subscribeNeedsSetup(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/** Yeni işletme oluşturulunca çağrılır — kurulum akışını tetikler. */
export function markNeedsSetup(): void {
  needsSetupCache = true;
  emit();
  AsyncStorage.setItem(NEEDS_SETUP_KEY, 'true').catch(() => {});
}

/** Kurulum tamamlanınca veya atlanınca çağrılır. */
export function clearNeedsSetup(): void {
  needsSetupCache = false;
  emit();
  AsyncStorage.setItem(NEEDS_SETUP_KEY, 'false').catch(() => {});
}
