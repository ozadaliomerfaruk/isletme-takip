import { waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import {
  clearNotificationsForSignOut,
  finalizeNotificationsAfterSignOut,
  resumePushTokenRegistrationForUser,
  savePushToken,
  waitForNotificationCleanupBeforeSignOut,
} from '../notifications';
import { supabase } from '../supabase';

describe('push-token write queue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('true');
    resumePushTokenRegistrationForUser('user-a');
    resumePushTokenRegistrationForUser('user-b');
  });

  it('finishes A claim before B claim, so a late A response cannot retake B token', async () => {
    let activeUserId = 'user-a';
    (supabase.auth.getSession as jest.Mock).mockImplementation(async () => ({
      data: {
        session: {
          user: { id: activeUserId },
        },
      },
    }));

    let resolveAClaim:
      | ((value: { data: null; error: null }) => void)
      | undefined;
    const pendingAClaim = new Promise<{ data: null; error: null }>(
      (resolve) => {
        resolveAClaim = resolve;
      },
    );
    (supabase.rpc as jest.Mock)
      .mockImplementationOnce(() => pendingAClaim)
      .mockResolvedValueOnce({ data: null, error: null });

    const aSave = savePushToken(
      'user-a',
      'ExpoPushToken[token-a]',
    );
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledTimes(1));

    activeUserId = 'user-b';
    const bSave = savePushToken(
      'user-b',
      'ExpoPushToken[token-b]',
    );

    await Promise.resolve();
    expect(supabase.rpc).toHaveBeenCalledTimes(1);

    resolveAClaim?.({ data: null, error: null });
    await expect(aSave).resolves.toBe(true);
    await expect(bSave).resolves.toBe(true);
    expect(supabase.rpc).toHaveBeenCalledTimes(2);
    expect(supabase.auth.getSession).toHaveBeenCalledTimes(2);
  });

  it('rejects a token save that arrives after logout has fenced the user', async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: 'user-a' } } },
    });

    const cleanup = clearNotificationsForSignOut('user-a');
    const lateSave = savePushToken(
      'user-a',
      'ExpoPushToken[token-a-late]',
    );

    await cleanup;
    await expect(lateSave).resolves.toBe(false);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('completes the normal token cleanup path before its logout deadline', async () => {
    await expect(
      waitForNotificationCleanupBeforeSignOut('user-a', 100),
    ).resolves.toBe('completed');
    expect(
      Notifications.unregisterForNotificationsAsync,
    ).not.toHaveBeenCalled();

    await finalizeNotificationsAfterSignOut();
    expect(
      Notifications.unregisterForNotificationsAsync,
    ).toHaveBeenCalled();
  });
});
