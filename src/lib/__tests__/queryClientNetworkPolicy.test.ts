import { onlineManager } from '@tanstack/react-query';
import { neverDehydrateMutation, queryClient } from '@/lib/queryClient';

describe('queryClient network policy', () => {
  afterEach(() => {
    onlineManager.setOnline(true);
    queryClient.getMutationCache().clear();
  });

  it('okumaları reconnect için online moda bağlar', () => {
    expect(queryClient.getDefaultOptions().queries).toMatchObject({
      networkMode: 'online',
      refetchOnReconnect: true,
    });
  });

  it('yazmaları otomatik retry veya reconnect kuyruğuna bırakmaz', () => {
    expect(queryClient.getDefaultOptions().mutations).toMatchObject({
      retry: false,
      networkMode: 'always',
    });
    expect(neverDehydrateMutation()).toBe(false);
  });

  it('offline yazıyı reconnect kuyruğuna almaz ve yalnız bir kez çalıştırır', async () => {
    const mutationFn = jest.fn(async () => {
      throw new Error('offline request failed');
    });
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationKey: ['network-policy-test'],
      gcTime: 0,
      mutationFn,
    });

    onlineManager.setOnline(false);
    await expect(mutation.execute(undefined)).rejects.toThrow('offline request failed');
    expect(mutationFn).toHaveBeenCalledTimes(1);

    onlineManager.setOnline(true);
    await Promise.resolve();
    expect(mutationFn).toHaveBeenCalledTimes(1);
  });
});
