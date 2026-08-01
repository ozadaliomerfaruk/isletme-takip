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
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Network from 'expo-network';
import { supabase } from './supabase';
import { networkStatusStore } from './networkStatus';

type EventPlatform = 'ios' | 'android' | 'web';

const PLATFORM: EventPlatform | null =
  Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web'
    ? Platform.OS
    : null;

const APP_VERSION: string | null =
  (Constants.expoConfig?.version as string | undefined) ?? null;

const NATIVE_BUILD: string | null =
  Platform.OS === 'ios'
    ? Constants.platform?.ios?.buildNumber ?? null
    : Platform.OS === 'android'
      ? String(Constants.platform?.android?.versionCode ?? '') || null
      : null;

type AppEventRow = {
  user_id: string;
  isletme_id: string | null;
  event_name: string;
  platform: EventPlatform | null;
  app_version: string | null;
  meta: Record<string, unknown> | null;
};

// Performance events are delayed and batched so observability never races the
// save/navigation requests that it is measuring.
const PERFORMANCE_FLUSH_DELAY_MS = 15_000;
const PERFORMANCE_BATCH_SIZE = 20;
let performanceBuffer: AppEventRow[] = [];
let performanceFlushTimer: ReturnType<typeof setTimeout> | null = null;
let performanceFlushInFlight = false;

// Modül-seviyesi bağlam (AuthContext günceller)
let currentUserId: string | null = null;
let currentIsletmeId: string | null = null;

/** AuthContext'ten çağrılır: aktif kullanıcı/işletme değiştikçe günceller. */
export function setEventContext(userId: string | null, isletmeId: string | null): void {
  // Never carry a previous user's delayed telemetry into a new auth context.
  // Besides privacy separation, an old user_id would make the entire RLS batch fail.
  if (currentUserId && currentUserId !== userId && performanceBuffer.length > 0) {
    performanceBuffer = [];
    if (performanceFlushTimer) {
      clearTimeout(performanceFlushTimer);
      performanceFlushTimer = null;
    }
  }
  currentUserId = userId;
  currentIsletmeId = isletmeId;
}

function createEventRow(
  eventName: string,
  meta?: Record<string, unknown>,
): AppEventRow | null {
  const userId = currentUserId;
  if (!userId || !eventName) return null;
  return {
    user_id: userId,
    isletme_id: currentIsletmeId,
    event_name: eventName,
    platform: PLATFORM,
    app_version: APP_VERSION,
    meta: meta ?? null,
  };
}

async function flushPerformanceEvents(): Promise<void> {
  if (performanceFlushInFlight || performanceBuffer.length === 0) return;
  performanceFlushInFlight = true;
  if (performanceFlushTimer) {
    clearTimeout(performanceFlushTimer);
    performanceFlushTimer = null;
  }

  const batch = performanceBuffer.splice(0, PERFORMANCE_BATCH_SIZE);
  try {
    const { error } = await supabase.from('app_events').insert(batch);
    if (error && __DEV__) {
      console.warn('[appEvents] performance batch', error.message);
    }
  } catch (e) {
    if (__DEV__) console.warn('[appEvents] performance batch error', e);
  } finally {
    performanceFlushInFlight = false;
    if (performanceBuffer.length > 0) {
      performanceFlushTimer = setTimeout(() => {
        performanceFlushTimer = null;
        void flushPerformanceEvents();
      }, PERFORMANCE_FLUSH_DELAY_MS);
    }
  }
}

function enqueuePerformanceEvent(row: AppEventRow): void {
  performanceBuffer.push(row);
  if (performanceBuffer.length >= PERFORMANCE_BATCH_SIZE) {
    void flushPerformanceEvents();
    return;
  }
  if (!performanceFlushTimer) {
    performanceFlushTimer = setTimeout(() => {
      performanceFlushTimer = null;
      void flushPerformanceEvents();
    }, PERFORMANCE_FLUSH_DELAY_MS);
  }
}

/**
 * Bir uygulama olayı kaydet (ateşle-unut).
 * @param eventName olay adı (örn. 'screen_view', 'transaction_created')
 * @param meta PII-SİZ ek bağlam (tip/sayım/ekran). Tutar/isim KONMAZ.
 */
export function logEvent(eventName: string, meta?: Record<string, unknown>): void {
  const row = createEventRow(eventName, meta);
  if (!row) return;

  // Await edilmez: olay arka planda gider, çağıran akışı beklemez/etkilenmez.
  void (async () => {
    try {
      const { error } = await supabase.from('app_events').insert(row);
      if (error && __DEV__) {
        console.warn('[appEvents]', eventName, error.message);
      }
    } catch (e) {
      if (__DEV__) console.warn('[appEvents] error', e);
    }
  })();
}

/**
 * Records a PII-free performance event without adding a competing request to
 * the measured interaction. Native network-state lookup is asynchronous and
 * queued rows are inserted later as a small batch.
 */
export function logPerformanceEvent(
  eventName: string,
  meta: Record<string, unknown>,
): void {
  const userIdAtCall = currentUserId;
  const isletmeIdAtCall = currentIsletmeId;
  if (!userIdAtCall || !eventName) return;
  const status = networkStatusStore.getSnapshot();

  const enqueue = (networkType: string): void => {
    // Network-state lookup may finish after logout/account switch. Silently drop
    // that stale event instead of mixing auth contexts in the delayed batch.
    if (currentUserId !== userIdAtCall) return;
    enqueuePerformanceEvent({
      user_id: userIdAtCall,
      isletme_id: isletmeIdAtCall,
      event_name: eventName,
      platform: PLATFORM,
      app_version: APP_VERSION,
      meta: {
        perf_schema: 2,
        native_build: NATIVE_BUILD,
        app_state: AppState.currentState,
        network_type: networkType,
        device_network: status.device,
        backend_reachability: status.backend,
        ...meta,
      },
    });
  };

  void Network.getNetworkStateAsync()
    .then((networkState) => enqueue(networkState.type ?? 'UNKNOWN'))
    .catch(() => enqueue('UNKNOWN'));
}

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (nextState) => {
    if (nextState !== 'active') void flushPerformanceEvents();
  });
}

export const __appEventInternals = {
  flushPerformanceEvents,
  getPerformanceBufferSize: () => performanceBuffer.length,
  resetForTests: (): void => {
    if (performanceFlushTimer) clearTimeout(performanceFlushTimer);
    performanceFlushTimer = null;
    performanceBuffer = [];
    performanceFlushInFlight = false;
    currentUserId = null;
    currentIsletmeId = null;
  },
};
