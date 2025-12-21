import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 dakika
      gcTime: 30 * 60 * 1000, // 30 dakika (eski cacheTime)
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      retry: 2,
    },
    mutations: {
      retry: 1,
    },
  },
});
