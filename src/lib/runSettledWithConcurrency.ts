export interface SettledProgress {
  completed: number;
  total: number;
}

/**
 * Promise.allSettled semantiğini koruyup aynı anda çalışan iş sayısını sınırlar.
 * Sonuçlar, işler farklı sırada bitse bile giriş sırasıyla döner.
 */
export async function runSettledWithConcurrency<T, TResult>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<TResult>,
  onProgress?: (progress: SettledProgress) => void,
): Promise<PromiseSettledResult<TResult>[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError('concurrency must be a positive integer');
  }

  if (items.length === 0) return [];

  const results = new Array<PromiseSettledResult<TResult>>(items.length);
  let nextIndex = 0;
  let completed = 0;

  const runWorker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;

      try {
        results[index] = {
          status: 'fulfilled',
          value: await worker(items[index], index),
        };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }

      completed += 1;
      onProgress?.({ completed, total: items.length });
    }
  };

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}
