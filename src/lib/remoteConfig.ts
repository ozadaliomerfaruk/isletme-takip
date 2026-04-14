// Remote config — fetches a small JSON doc from the `app-config` Edge Function.
// Hard rules (see plan §5.1 & §5.4):
//  - MUST NEVER throw. Every error path is swallowed; callers always get a valid config.
//  - MUST NEVER block. Fetch has a 5 s timeout; a stale cached value is used on failure.
//  - Cached in AsyncStorage for 5 min; on cold start without cache, safe defaults apply.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

export interface RemoteConfig {
  telemetry_enabled: boolean;
  telemetry_rate: number; // 0..1
  telemetry_sink: "console" | "edge";
  telemetry_allowlist: string[]; // userIds always sampled when enabled
  telemetry_flush_interval_ms: number;
  telemetry_flush_batch_size: number;
  telemetry_max_buffer: number;
  config_version: number;
}

const DEFAULTS: RemoteConfig = {
  telemetry_enabled: false,
  telemetry_rate: 0,
  telemetry_sink: "edge",
  telemetry_allowlist: [],
  telemetry_flush_interval_ms: 60_000,
  telemetry_flush_batch_size: 30,
  telemetry_max_buffer: 500,
  config_version: 0,
};

const CACHE_KEY = "@app_config_v1";
const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5_000;

interface CacheEntry {
  value: RemoteConfig;
  fetchedAt: number;
}

let inMemory: CacheEntry | null = null;
let inFlight: Promise<RemoteConfig> | null = null;

function safeMerge(partial: unknown): RemoteConfig {
  if (!partial || typeof partial !== "object") return { ...DEFAULTS };
  const p = partial as Record<string, unknown>;
  const out: RemoteConfig = { ...DEFAULTS };
  if (typeof p.telemetry_enabled === "boolean") out.telemetry_enabled = p.telemetry_enabled;
  if (typeof p.telemetry_rate === "number" && p.telemetry_rate >= 0 && p.telemetry_rate <= 1) {
    out.telemetry_rate = p.telemetry_rate;
  }
  if (p.telemetry_sink === "console" || p.telemetry_sink === "edge") {
    out.telemetry_sink = p.telemetry_sink;
  }
  if (Array.isArray(p.telemetry_allowlist)) {
    out.telemetry_allowlist = p.telemetry_allowlist.filter(
      (x): x is string => typeof x === "string"
    );
  }
  if (typeof p.telemetry_flush_interval_ms === "number" && p.telemetry_flush_interval_ms > 0) {
    out.telemetry_flush_interval_ms = Math.min(300_000, p.telemetry_flush_interval_ms);
  }
  if (typeof p.telemetry_flush_batch_size === "number" && p.telemetry_flush_batch_size > 0) {
    out.telemetry_flush_batch_size = Math.min(200, p.telemetry_flush_batch_size);
  }
  if (typeof p.telemetry_max_buffer === "number" && p.telemetry_max_buffer > 0) {
    out.telemetry_max_buffer = Math.min(5000, p.telemetry_max_buffer);
  }
  if (typeof p.config_version === "number") out.config_version = p.config_version;
  return out;
}

async function readCache(): Promise<CacheEntry | null> {
  try {
    const raw =
      Platform.OS === "web" ? localStorage.getItem(CACHE_KEY) : await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.fetchedAt !== "number") return null;
    return { value: safeMerge(parsed.value), fetchedAt: parsed.fetchedAt };
  } catch {
    return null;
  }
}

async function writeCache(entry: CacheEntry): Promise<void> {
  try {
    const raw = JSON.stringify(entry);
    if (Platform.OS === "web") localStorage.setItem(CACHE_KEY, raw);
    else await AsyncStorage.setItem(CACHE_KEY, raw);
  } catch {
    /* swallow */
  }
}

async function fetchFromNetwork(): Promise<RemoteConfig | null> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${url}/functions/v1/app-config`, {
      method: "GET",
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    return safeMerge(json);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function getRemoteConfig(): Promise<RemoteConfig> {
  try {
    const now = Date.now();
    if (inMemory && now - inMemory.fetchedAt < CACHE_TTL_MS) return inMemory.value;

    if (!inMemory) {
      const cached = await readCache();
      if (cached) {
        inMemory = cached;
        if (now - cached.fetchedAt < CACHE_TTL_MS) return cached.value;
      }
    }

    if (!inFlight) {
      inFlight = (async () => {
        const fresh = await fetchFromNetwork();
        if (fresh) {
          const entry: CacheEntry = { value: fresh, fetchedAt: Date.now() };
          inMemory = entry;
          await writeCache(entry);
          return fresh;
        }
        return inMemory?.value ?? { ...DEFAULTS };
      })().finally(() => {
        inFlight = null;
      });
    }
    return await inFlight;
  } catch {
    return inMemory?.value ?? { ...DEFAULTS };
  }
}

export function getCachedRemoteConfig(): RemoteConfig {
  return inMemory?.value ?? { ...DEFAULTS };
}

export function resetRemoteConfigCache(): void {
  inMemory = null;
  inFlight = null;
}

export const REMOTE_CONFIG_DEFAULTS: Readonly<RemoteConfig> = DEFAULTS;

// Deterministic 0..1 bucket from a userId. Used for cohort sampling.
export function cohortBucket(userId: string | null | undefined): number {
  if (!userId) return 1; // no user → bucket=1 → always outside any rate<1 cohort
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

export function isInCohort(
  userId: string | null | undefined,
  cfg: RemoteConfig
): boolean {
  if (!cfg.telemetry_enabled) return false;
  if (userId && cfg.telemetry_allowlist.includes(userId)) return true;
  return cohortBucket(userId) < cfg.telemetry_rate;
}
