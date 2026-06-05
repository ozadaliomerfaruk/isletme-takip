/**
 * Uygulama içi olay izleme (Faz 2)
 *
 * Tasarım kuralları (app_sessions / supabaseTelemetry desenini izler):
 *  - ATEŞLE-UNUT: logEvent await edilmez, asla throw etmez, UI'yı bloklamaz.
 *  - Hata olursa sessizce yutulur (yalnızca __DEV__ uyarısı). Uygulamayı BOZMAZ.
 *  - GİZLİLİK: meta'ya ASLA tutar/isim/açıklama gibi finansal/kişisel veri konmaz.
 *    Yalnızca tip, sayım, ekran adı, para birimi kodu gibi PII-SİZ alanlar.
 *
 * Kullanım:
 *   import { logEvent } from '@/lib/appEvents';
 *   logEvent('account_created', { hesap_type: 'banka', currency: 'TRY' });
 *
 * Bağlam (user_id / isletme_id) AuthContext tarafından setEventContext ile
 * güncellenir; böylece logEvent component dışından (hook'lar, lib'ler) da çağrılabilir.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

type EventPlatform = 'ios' | 'android' | 'web';

const PLATFORM: EventPlatform | null =
  Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web'
    ? Platform.OS
    : null;

const APP_VERSION: string | null =
  (Constants.expoConfig?.version as string | undefined) ?? null;

// Modül-seviyesi bağlam (AuthContext günceller)
let currentUserId: string | null = null;
let currentIsletmeId: string | null = null;

/** AuthContext'ten çağrılır: aktif kullanıcı/işletme değiştikçe günceller. */
export function setEventContext(userId: string | null, isletmeId: string | null): void {
  currentUserId = userId;
  currentIsletmeId = isletmeId;
}

/**
 * Bir uygulama olayı kaydet (ateşle-unut).
 * @param eventName olay adı (örn. 'screen_view', 'transaction_created')
 * @param meta PII-SİZ ek bağlam (tip/sayım/ekran). Tutar/isim KONMAZ.
 */
export function logEvent(eventName: string, meta?: Record<string, unknown>): void {
  const userId = currentUserId;
  if (!userId || !eventName) return;
  const isletmeId = currentIsletmeId;

  // Await edilmez: olay arka planda gider, çağıran akışı beklemez/etkilenmez.
  void (async () => {
    try {
      const { error } = await supabase.from('app_events').insert({
        user_id: userId,
        isletme_id: isletmeId,
        event_name: eventName,
        platform: PLATFORM,
        app_version: APP_VERSION,
        meta: meta ?? null,
      });
      if (error && __DEV__) {
        console.warn('[appEvents]', eventName, error.message);
      }
    } catch (e) {
      if (__DEV__) console.warn('[appEvents] error', e);
    }
  })();
}
