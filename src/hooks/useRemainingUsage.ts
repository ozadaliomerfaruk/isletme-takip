import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/queryKeys';
import { useCallback } from 'react';

const DAILY_LIMIT = 20;

export function useRemainingUsage() {
  const { user } = useAuthContext();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.remainingUsage.detail(user?.id ?? ''),
    queryFn: async (): Promise<number> => {
      if (!user) return DAILY_LIMIT;

      const { data, error } = await supabase.rpc('get_remaining_usage', {
        p_user_id: user.id,
        p_function_name: 'parse-invoice',
        p_daily_limit: DAILY_LIMIT,
      });

      if (error) {
        console.warn('[useRemainingUsage] Error:', error.message);
        return DAILY_LIMIT;
      }

      return (data as number) ?? DAILY_LIMIT;
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.remainingUsage.detail(user?.id ?? '') });
  }, [queryClient, user?.id]);

  return {
    remaining: query.data ?? DAILY_LIMIT,
    dailyLimit: DAILY_LIMIT,
    isLoading: query.isLoading,
    invalidate,
  };
}
