import {
  __performanceTraceInternals,
  createPerformanceTraceId,
  getRecentEntityPerformanceTrace,
  rememberEntityNavigationPerformanceTrace,
  rememberRecentEntityPerformanceTrace,
  takeEntityNavigationPerformanceTrace,
} from '../performanceTrace';

describe('performanceTrace', () => {
  beforeEach(() => {
    __performanceTraceInternals.reset();
  });

  it('creates correlation ids without embedding entity data', () => {
    const first = createPerformanceTraceId('save', 1_000);
    const second = createPerformanceTraceId('save', 1_000);

    expect(first).toMatch(/^save-/);
    expect(second).not.toBe(first);
    expect(first).not.toContain('personel-123');
  });

  it('links a recent entity visit and expires the in-memory identifier', () => {
    rememberRecentEntityPerformanceTrace(
      'personel',
      'personel-123',
      'save-trace',
      10_000,
    );

    expect(
      getRecentEntityPerformanceTrace('personel', 'personel-123', 12_500),
    ).toEqual({ traceId: 'save-trace', completedAt: 10_000, ageMs: 2_500 });

    expect(
      getRecentEntityPerformanceTrace(
        'personel',
        'personel-123',
        10_000 + __performanceTraceInternals.recentTraceTtlMs + 1,
      ),
    ).toBeNull();
  });

  it('does not link a different entity', () => {
    rememberRecentEntityPerformanceTrace(
      'personel',
      'personel-123',
      'save-trace',
      10_000,
    );

    expect(
      getRecentEntityPerformanceTrace('personel', 'personel-456', 12_500),
    ).toBeNull();
  });

  it('measures and consumes a detail navigation trace without logging the entity id', () => {
    rememberEntityNavigationPerformanceTrace(
      'personel',
      'personel-123',
      'navigation-trace',
      20_000,
    );

    expect(
      takeEntityNavigationPerformanceTrace('personel', 'personel-123', 20_350),
    ).toEqual({
      traceId: 'navigation-trace',
      completedAt: 20_000,
      ageMs: 350,
    });
    expect(
      takeEntityNavigationPerformanceTrace('personel', 'personel-123', 20_500),
    ).toBeNull();
  });
});
