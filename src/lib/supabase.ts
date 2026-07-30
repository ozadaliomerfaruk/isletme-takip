import { createClient } from '@supabase/supabase-js';
import { processLock } from '@supabase/auth-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, AppState } from 'react-native';
import { withTelemetrySafe } from './supabaseTelemetry';
import { probeBackendHealth } from './backendHealth';
import {
  beginBackendRequest,
  isDeviceDisconnected,
  reportBackendFailure,
  reportBackendSuccess,
} from './networkStatus';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
/** Faz 4 web-ekstre: public edge function URL'leri için taban adres. */
export const SUPABASE_PROJECT_URL = supabaseUrl;
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
const fetchWithTimeout: typeof fetch = async (input, init) => {
  // Bu bir ağ isteği değildir: cihaz kesin çevrimdışıysa yazıyı TanStack
  // kuyruğunda bekletmek yerine anında reddeder. Form verisi ekranda kalır ve
  // bağlantı gelince kullanıcının haberi olmadan finansal kayıt gönderilmez.
  if (isDeviceDisconnected()) {
    throw new TypeError('Network request skipped because the device is offline');
  }

  const backendRequestId = beginBackendRequest();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const external = init?.signal;
  const abortFromExternalSignal = () => controller.abort();

  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', abortFromExternalSignal, { once: true });
  }

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    if (response.status >= 500) {
      reportBackendFailure(backendRequestId);
    } else {
      // 4xx dahil bir HTTP cevabı, servise ağ seviyesinde ulaşıldığını kanıtlar.
      reportBackendSuccess(backendRequestId);
    }
    return response;
  } catch (error) {
    // Kullanıcı/caller isteği bilerek iptal ettiyse bunu servis kesintisi sayma.
    if (!external?.aborted) {
      reportBackendFailure(backendRequestId);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', abortFromExternalSignal);
  }
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
// [GEÇİCİ TEŞHİS — yavaş-kayıt korelasyonu, 14 Tem] Son ön-plana geçiş zamanı.
// Yavaş kayıt loglarına ms_since_fg olarak eklenir: asılmaların "arka plandan dönüş"
// anlarında kümelenip kümelenmediğini kanıtlar. Teşhis bitince sadeleştirilebilir.
let lastForegroundAt = Date.now();
export function msSinceForeground(): number {
  return Date.now() - lastForegroundAt;
}

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (nextState) => {
    if (nextState === 'active') {
      lastForegroundAt = Date.now();
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

/**
 * Supabase servis sağlığı/socket ısıtma probu.
 *
 * Bu sonuç cihazın internet durumu DEĞİLDİR ve finansal kayıt öncesinde blocking
 * preflight olarak kullanılmamalıdır. Cihaz bağlantısının tek kaynağı expo-network'tür.
 */
export async function checkBackendConnectivity(): Promise<boolean> {
  if (isDeviceDisconnected()) return false;

  const backendRequestId = beginBackendRequest();
  // /rest/v1/ kök path'i legacy JWT anon key ile 401 (UNAUTHORIZED_INVALID_API_KEY_TYPE)
  // döndürüyor; auth health endpoint'i GET+apikey ile 200 döner ve log gürültüsü yaratmaz
  // (HEAD bu endpoint'te 405 döndürdüğü için GET kullanılıyor).
  const result = await probeBackendHealth({
    url: `${supabaseUrl}/auth/v1/health`,
    headers: { apikey: supabaseAnonKey },
  });

  if (result.available) {
    reportBackendSuccess(backendRequestId);
  } else {
    reportBackendFailure(backendRequestId);
  }

  return result.healthy;
}
