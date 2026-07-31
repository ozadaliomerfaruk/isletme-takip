import {
  probeBackendHealth,
  type BackendHealthFetch,
} from '@/lib/backendHealth';

describe('probeBackendHealth', () => {
  it('başarılı HTTP cevabını sağlıklı ve erişilebilir sayar', async () => {
    const fetchImpl = jest.fn<ReturnType<BackendHealthFetch>, Parameters<BackendHealthFetch>>(
      async () => ({ ok: true, status: 200 })
    );

    await expect(
      probeBackendHealth({ url: 'https://example.test/health', fetchImpl })
    ).resolves.toEqual({
      healthy: true,
      available: true,
      status: 200,
    });
  });

  it('4xx cevabında backend erişimini internet kesintisi sanmaz', async () => {
    const fetchImpl = jest.fn<ReturnType<BackendHealthFetch>, Parameters<BackendHealthFetch>>(
      async () => ({ ok: false, status: 401 })
    );

    await expect(
      probeBackendHealth({ url: 'https://example.test/health', fetchImpl })
    ).resolves.toEqual({
      healthy: false,
      available: true,
      status: 401,
    });
  });

  it('5xx cevabını servis erişilemezliği olarak sınıflandırır', async () => {
    const fetchImpl = jest.fn<ReturnType<BackendHealthFetch>, Parameters<BackendHealthFetch>>(
      async () => ({ ok: false, status: 503 })
    );

    await expect(
      probeBackendHealth({ url: 'https://example.test/health', fetchImpl })
    ).resolves.toEqual({
      healthy: false,
      available: false,
      status: 503,
    });
  });

  it('timeoutta isteği abort eder ve timerı finally ile temizler', async () => {
    jest.useFakeTimers();
    const fetchImpl: BackendHealthFetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new Error('aborted')),
          { once: true }
        );
      });

    const resultPromise = probeBackendHealth({
      url: 'https://example.test/health',
      timeoutMs: 5000,
      fetchImpl,
    });

    await jest.advanceTimersByTimeAsync(5000);
    await expect(resultPromise).resolves.toEqual({
      healthy: false,
      available: false,
    });
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });
});
