import { QueryClient, type QueryCacheNotifyEvent } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import Constants from 'expo-constants';
import {
  enqueueSample,
  type ClientRQSample,
  type TelemetryTriggerType,
} from './supabaseTelemetry';
import { getCachedRemoteConfig } from './remoteConfig';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 dakika - veri "taze" kabul edilir
      // gcTime: persist ile uyum için ≥ maxAge (24s) olmalı; aksi halde bellekten
      // düşen sorgu dehydrate edilmez ve soğuk açılışta cache eksik kalırdı.
      gcTime: 1000 * 60 * 60 * 24, // 24 saat
      refetchOnWindowFocus: false, // Mobilde gereksiz, pil ve data tasarrufu
      refetchOnMount: true, // Taze ise cache'ten anında göster; yalnızca stale ise fetch (her navigasyonda tüm sorguları yeniden çekmeyi önler). Güncellik mutasyonların invalidateRelatedQueries (refetchType:'active') ile sağlanır.
      refetchOnReconnect: true, // İnternet geldiğinde yenile
      retry: 1, // Mobilde 1 retry yeterli, hızlı hata göster
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000), // Exponential backoff, max 10sn
      networkMode: 'online', // React Native'de offlineFirst güvenilir değil (netinfo olmadan)
    },
    mutations: {
      retry: 1,
      networkMode: 'online',
    },
  },
});

// ============================================================================
// DİSK PERSISTER (read-cache) — React Query cache'ini AsyncStorage'a yazar.
// Soğuk açılışta son görülen veri ANINDA gösterilir, arkada sessizce tazelenir.
// FİNANSAL GUARDRAIL'ler:
//  • CACHE_BUSTER: uygulama sürümü değişince eski cache geçersiz (şema kayması yok)
//  • maxAge (provider'da): çok eski cache gösterilmez
//  • logout/kullanıcı değişimi: wipePersistedCache() ile TEMİZLENİR (veri sızmaz)
//  • Kritik finansal karar (mutabakat / işlem yazma) öncesi HER ZAMAN taze çekilir
// Not: AsyncStorage şifreli DEĞİLDİR; hassas veri diskte açıktır (Faz 3'te şifreleme).
// ============================================================================
export const CACHE_BUSTER = `v${Constants.expoConfig?.version ?? '0'}`;

const PERSIST_KEY = 'ISLETME_TAKIP_RQ_CACHE_V1';

export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: PERSIST_KEY,
  throttleTime: 1500,
});

/** Logout / kullanıcı değişiminde: bellekteki VE diskteki cache'i tamamen sil. */
export async function wipePersistedCache(): Promise<void> {
  queryClient.clear();
  try {
    await asyncStoragePersister.removeClient();
  } catch {
    // removeClient başarısız olsa da bellek temizlendi; anahtarı elle de dene
    try {
      await AsyncStorage.removeItem(PERSIST_KEY);
    } catch {
      /* swallow */
    }
  }
}

// Passive QueryCache subscription — tracks trigger reasons (mount / refetch / invalidation).
// Hard rule: any throw inside the subscriber is swallowed; React Query cannot observe it.
try {
  const fetchStart = new Map<string, number>();

  queryClient.getQueryCache().subscribe((event: QueryCacheNotifyEvent) => {
    try {
      const cfg = getCachedRemoteConfig();
      if (!cfg.telemetry_enabled) return;

      const query = event.query;
      const keyHash = query.queryHash;
      const meta = (query.meta ?? {}) as { query_purpose?: string };
      const purpose = meta.query_purpose ?? 'unknown';

      switch (event.type) {
        case 'added': {
          // No-op; not a trigger on its own.
          break;
        }
        case 'observerAdded': {
          const hasData = query.state.data !== undefined;
          const sample: ClientRQSample = {
            source: 'client',
            kind: 'rq',
            t: Date.now(),
            query_key: keyHash,
            query_purpose: purpose,
            trigger_type: hasData ? 'observer_added' : 'mount',
            observers: query.getObserversCount(),
          };
          enqueueSample(sample);
          break;
        }
        case 'updated': {
          const action = event.action as { type?: string; meta?: { reason?: string } };
          if (action?.type === 'fetch') {
            fetchStart.set(keyHash, Date.now());
            const reason = action.meta?.reason;
            let triggerType: TelemetryTriggerType = 'manual';
            if (reason === 'refetchOnMount') triggerType = 'refetch_mount';
            else if (reason === 'refetchOnWindowFocus') triggerType = 'refetch_focus';
            else if (reason === 'refetchOnReconnect') triggerType = 'refetch_reconnect';

            const sample: ClientRQSample = {
              source: 'client',
              kind: 'rq',
              t: Date.now(),
              query_key: keyHash,
              query_purpose: purpose,
              trigger_type: triggerType,
              observers: query.getObserversCount(),
            };
            enqueueSample(sample);
          } else if (action?.type === 'success' || action?.type === 'error') {
            const t0 = fetchStart.get(keyHash);
            if (t0 !== undefined) {
              fetchStart.delete(keyHash);
              const sample: ClientRQSample = {
                source: 'client',
                kind: 'rq',
                t: Date.now(),
                query_key: keyHash,
                query_purpose: purpose,
                trigger_type: 'manual',
                observers: query.getObserversCount(),
                ms: Date.now() - t0,
                result: action.type === 'success' ? 'success' : 'error',
              };
              enqueueSample(sample);
            }
          } else if (action?.type === 'invalidate') {
            const sample: ClientRQSample = {
              source: 'client',
              kind: 'rq',
              t: Date.now(),
              query_key: keyHash,
              query_purpose: purpose,
              trigger_type: 'invalidation',
              observers: query.getObserversCount(),
            };
            enqueueSample(sample);
          }
          break;
        }
        default:
          break;
      }
    } catch {
      /* swallow */
    }
  });
} catch {
  /* swallow */
}
