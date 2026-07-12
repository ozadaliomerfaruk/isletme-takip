import { createClient } from '@supabase/supabase-js';
import { processLock } from '@supabase/auth-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, AppState } from 'react-native';
import { withTelemetrySafe } from './supabaseTelemetry';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const SupabaseStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    await AsyncStorage.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return;
    }
    await AsyncStorage.removeItem(key);
  },
};

// supabase-js'in token-yenileme ve REST fetch'inde varsayılan timeout YOK; ağ bir an
// takılırsa istek SONSUZA asılır (açılışta getSession'ı dondurup "veri yok" gösterir).
// 15 sn'lik AbortController ile her supabase fetch'ini sınırlıyoruz: takılırsa hızlı hata
// verir ve OTURUMU KORUR (ağ hatası oturumu silmez) → kullanıcı çıkış yaptırılmaz,
// ağ geri gelince veri normal yüklenir.
const FETCH_TIMEOUT_MS = 15000;
const fetchWithTimeout: typeof fetch = (input, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const external = init?.signal;
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
};

export const supabase = withTelemetrySafe(
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: SupabaseStorageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // React Native: eşzamanlı token-yenileme / getSession çağrıları auth kilidinde
      // DEADLOCK'a girip TÜM istekleri (kayıt dahil) sonsuza asabiliyor. Varsayılan
      // navigatorLock RN'de yok (navigator.locks tanımsız); processLock (in-process mutex)
      // bu deadlock'u önler → "sonsuz spinner, foreground'da çözülüyor" bug'ının çekirdek fix'i.
      // (Bonus: kilit çözülünce refresh'in kendi fetch'i de fetchWithTimeout'a tabi → en kötü
      // sonsuz-asılma penceresi ≤15 sn'ye iner.)
      lock: processLock,
    },
    global: { fetch: fetchWithTimeout },
  })
);

// React Native: token auto-refresh timer'ını yalnız uygulama ÖN PLANDAYKEN çalıştır/durdur.
// Arka planda RN timer'ları kısıtlanır; bu wiring olmadan token sessizce expire olur ve
// sonraki yazma isteği auth kilidinde asılırdı (foreground'da useAuth.refreshSession() yalnız
// yara bandıydı). Resmî Supabase RN deseni; createClient'ın hemen yanında (tek instance) durur
// ve processLock ile serileşir → useAuth'taki mevcut foreground refresh'iyle çakışmaz.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (nextState) => {
    if (nextState === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
  // İlk yüklemede uygulama zaten aktifse timer'ı hemen başlat.
  if (AppState.currentState === 'active') {
    supabase.auth.startAutoRefresh();
  }
}

export async function checkNetworkConnectivity(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    // /rest/v1/ kök path'i legacy JWT anon key ile 401 (UNAUTHORIZED_INVALID_API_KEY_TYPE)
    // döndürüyor; auth health endpoint'i GET+apikey ile 200 döner ve log gürültüsü yaratmaz
    // (HEAD bu endpoint'te 405 döndürdüğü için GET kullanılıyor).
    await fetch(`${supabaseUrl}/auth/v1/health`, {
      method: 'GET',
      signal: controller.signal,
      headers: { apikey: supabaseAnonKey },
    });
    clearTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}
