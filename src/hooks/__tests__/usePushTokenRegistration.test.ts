import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  registerForPushNotificationsAsync,
  removePushToken,
  savePushToken,
} from '@/lib/notifications';
import {
  resolvePushTokenRegistrationUserId,
  usePushTokenRegistration,
} from '../usePushTokenRegistration';

jest.mock('@/lib/notifications', () => ({
  NOTIFICATIONS_ENABLED_KEY: '@defter_notifications_enabled',
  registerForPushNotificationsAsync: jest.fn(),
  removePushToken: jest.fn(),
  resumePushTokenRegistrationForUser: jest.fn(),
  savePushToken: jest.fn(),
}));
jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({
    device: 'connected',
    backend: 'reachable',
    status: 'connected',
  }),
}));

const mockRegister =
  registerForPushNotificationsAsync as jest.MockedFunction<
    typeof registerForPushNotificationsAsync
  >;
const mockSave = savePushToken as jest.MockedFunction<typeof savePushToken>;
const mockRemove = removePushToken as jest.MockedFunction<
  typeof removePushToken
>;

type HookProps = { userId: string | null };

describe('usePushTokenRegistration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    mockSave.mockResolvedValue(true);
    mockRemove.mockResolvedValue(undefined);
  });

  it('registers B after A logs out in the same app process', async () => {
    mockRegister
      .mockResolvedValueOnce('ExpoPushToken[token-a]')
      .mockResolvedValueOnce('ExpoPushToken[token-b]');

    const { rerender } = renderHook(
      ({ userId }: HookProps) => usePushTokenRegistration(userId),
      { initialProps: { userId: 'user-a' } },
    );

    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith(
        'user-a',
        'ExpoPushToken[token-a]',
      );
    });

    act(() => rerender({ userId: null }));
    act(() => rerender({ userId: 'user-b' }));

    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith(
        'user-b',
        'ExpoPushToken[token-b]',
      );
    });
    expect(mockRegister).toHaveBeenCalledTimes(2);
  });

  it('fails closed during account-deletion status bootstrap and pending deletion', () => {
    const base = {
      userId: 'user-a',
      ownIsletmeId: 'business-a',
      accountDeletionScheduledAt: null,
    };

    expect(resolvePushTokenRegistrationUserId({
      ...base,
      isletmeLoading: true,
    })).toBeNull();
    expect(resolvePushTokenRegistrationUserId({
      ...base,
      isletmeLoading: false,
      accountDeletionScheduledAt: '2026-08-07T00:00:00.000Z',
    })).toBeNull();
    expect(resolvePushTokenRegistrationUserId({
      ...base,
      ownIsletmeId: null,
      isletmeLoading: false,
    })).toBeNull();
    expect(resolvePushTokenRegistrationUserId({
      ...base,
      isletmeLoading: false,
    })).toBe('user-a');
  });

  it('cancels a late A token before B becomes active', async () => {
    let resolveAToken: ((token: string | null) => void) | undefined;
    const aToken = new Promise<string | null>((resolve) => {
      resolveAToken = resolve;
    });
    mockRegister
      .mockImplementationOnce(() => aToken)
      .mockResolvedValueOnce('ExpoPushToken[token-b]');

    const { rerender } = renderHook(
      ({ userId }: HookProps) => usePushTokenRegistration(userId),
      { initialProps: { userId: 'user-a' } },
    );

    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1));
    act(() => rerender({ userId: null }));
    act(() => rerender({ userId: 'user-b' }));

    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith(
        'user-b',
        'ExpoPushToken[token-b]',
      );
    });

    await act(async () => {
      resolveAToken?.('ExpoPushToken[token-a-late]');
      await aToken;
    });

    expect(mockSave).not.toHaveBeenCalledWith(
      'user-a',
      'ExpoPushToken[token-a-late]',
    );
  });

  it('keeps a disabled preference off and retries stale server-token removal', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('false');

    renderHook(() => usePushTokenRegistration('user-a'));

    await waitFor(() => {
      expect(mockRemove).toHaveBeenCalledWith('user-a');
    });
    expect(mockRegister).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });
});
