export type PerformanceEntityKind = 'personel' | 'cari' | 'hesap';

export interface RecentEntityPerformanceTrace {
  traceId: string;
  completedAt: number;
  ageMs: number;
}

interface StoredEntityPerformanceTrace {
  traceId: string;
  completedAt: number;
}

const RECENT_TRACE_TTL_MS = 10 * 60 * 1000;
const NAVIGATION_TRACE_TTL_MS = 2 * 60 * 1000;
const recentEntityTraces = new Map<string, StoredEntityPerformanceTrace>();
const recentNavigationTraces = new Map<string, StoredEntityPerformanceTrace>();
let traceSequence = 0;

function entityKey(kind: PerformanceEntityKind, entityId: string): string {
  return `${kind}:${entityId}`;
}

/**
 * Correlation-only identifier. It is not an auth/idempotency token and contains
 * no user, tenant, entity or financial data.
 */
export function createPerformanceTraceId(prefix: string, now = Date.now()): string {
  traceSequence = (traceSequence + 1) % 1_000_000;
  return `${prefix}-${now.toString(36)}-${traceSequence.toString(36)}`;
}

/**
 * Entity id stays in memory only. Telemetry receives just the opaque trace id,
 * allowing a save to be linked to the next detail-screen visit without logging
 * personel/cari/hesap identifiers.
 */
export function rememberRecentEntityPerformanceTrace(
  kind: PerformanceEntityKind,
  entityId: string | null | undefined,
  traceId: string,
  completedAt = Date.now(),
): void {
  if (!entityId || !traceId) return;
  recentEntityTraces.set(entityKey(kind, entityId), { traceId, completedAt });
}

export function getRecentEntityPerformanceTrace(
  kind: PerformanceEntityKind,
  entityId: string | null | undefined,
  now = Date.now(),
): RecentEntityPerformanceTrace | null {
  if (!entityId) return null;
  const key = entityKey(kind, entityId);
  const stored = recentEntityTraces.get(key);
  if (!stored) return null;

  const ageMs = Math.max(0, now - stored.completedAt);
  if (ageMs > RECENT_TRACE_TTL_MS) {
    recentEntityTraces.delete(key);
    return null;
  }
  return { ...stored, ageMs };
}

export function rememberEntityNavigationPerformanceTrace(
  kind: PerformanceEntityKind,
  entityId: string | null | undefined,
  traceId: string,
  startedAt = Date.now(),
): void {
  if (!entityId || !traceId) return;
  recentNavigationTraces.set(entityKey(kind, entityId), {
    traceId,
    completedAt: startedAt,
  });
}

export function takeEntityNavigationPerformanceTrace(
  kind: PerformanceEntityKind,
  entityId: string | null | undefined,
  now = Date.now(),
): RecentEntityPerformanceTrace | null {
  if (!entityId) return null;
  const key = entityKey(kind, entityId);
  const stored = recentNavigationTraces.get(key);
  if (!stored) return null;
  recentNavigationTraces.delete(key);

  const ageMs = Math.max(0, now - stored.completedAt);
  if (ageMs > NAVIGATION_TRACE_TTL_MS) return null;
  return { ...stored, ageMs };
}

export const __performanceTraceInternals = {
  reset: (): void => {
    recentEntityTraces.clear();
    recentNavigationTraces.clear();
    traceSequence = 0;
  },
  recentTraceTtlMs: RECENT_TRACE_TTL_MS,
  navigationTraceTtlMs: NAVIGATION_TRACE_TTL_MS,
};
