// Remote config — returns hardcoded defaults.
// Telemetry is disabled; no need to fetch from app-config edge function.
// When telemetry is re-enabled, restore the network fetch logic.

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

export async function getRemoteConfig(): Promise<RemoteConfig> {
  return { ...DEFAULTS };
}

export function getCachedRemoteConfig(): RemoteConfig {
  return { ...DEFAULTS };
}

export function resetRemoteConfigCache(): void {
  // no-op — no cache to reset
}

export const REMOTE_CONFIG_DEFAULTS: Readonly<RemoteConfig> = DEFAULTS;

export function cohortBucket(userId: string | null | undefined): number {
  if (!userId) return 1;
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
