import { runSettledWithConcurrency } from '../runSettledWithConcurrency';

describe('runSettledWithConcurrency', () => {
  it('eşzamanlı iş sayısını sınırlar ve sonuç sırasını korur', async () => {
    let active = 0;
    let maxActive = 0;
    const progress: number[] = [];

    const results = await runSettledWithConcurrency(
      [30, 5, 20, 1],
      2,
      async (delay) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, delay));
        active -= 1;
        return delay * 2;
      },
      ({ completed }) => progress.push(completed),
    );

    expect(maxActive).toBe(2);
    expect(results).toEqual([
      { status: 'fulfilled', value: 60 },
      { status: 'fulfilled', value: 10 },
      { status: 'fulfilled', value: 40 },
      { status: 'fulfilled', value: 2 },
    ]);
    expect(progress).toEqual([1, 2, 3, 4]);
  });

  it('tekil hatayı diğer işleri durdurmadan rejected olarak döndürür', async () => {
    const results = await runSettledWithConcurrency(
      [1, 2, 3],
      2,
      async (value) => {
        if (value === 2) throw new Error('failed');
        return value;
      },
    );

    expect(results[0]).toEqual({ status: 'fulfilled', value: 1 });
    expect(results[1]).toMatchObject({ status: 'rejected' });
    expect(results[2]).toEqual({ status: 'fulfilled', value: 3 });
  });

  it('geçersiz eşzamanlılık sınırını reddeder', async () => {
    await expect(
      runSettledWithConcurrency([1], 0, async (value) => value),
    ).rejects.toThrow(RangeError);
  });
});
