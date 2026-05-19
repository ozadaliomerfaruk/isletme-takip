import { useState, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { checkNetworkConnectivity } from '@/lib/supabase';

const CHECK_INTERVAL = 15000;

export function useNetworkStatus() {
  const [isOffline, setIsOffline] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const check = async () => {
      const connected = await checkNetworkConnectivity();
      setIsOffline(!connected);
    };

    check();
    intervalRef.current = setInterval(check, CHECK_INTERVAL);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      subscription.remove();
    };
  }, []);

  return isOffline;
}
