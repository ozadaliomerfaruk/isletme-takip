import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 dakika - veri "taze" kabul edilir
      gcTime: 1000 * 60 * 30, // 30 dakika - cache'te tutulur
      refetchOnWindowFocus: false, // Mobilde gereksiz, pil ve data tasarrufu
      refetchOnMount: 'always', // Sayfa açıldığında her zaman kontrol et (stale ise fetch)
      refetchOnReconnect: true, // İnternet geldiğinde yenile
      retry: 1, // Mobilde 1 retry yeterli, hızlı hata göster
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000), // Exponential backoff, max 10sn
      networkMode: 'offlineFirst', // Önce cache'ten göster, sonra fetch et
    },
    mutations: {
      retry: 1,
      networkMode: 'offlineFirst',
    },
  },
});
