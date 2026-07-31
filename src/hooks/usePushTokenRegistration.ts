import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  NOTIFICATIONS_ENABLED_KEY,
  registerForPushNotificationsAsync,
  removePushToken,
  resumePushTokenRegistrationForUser,
  savePushToken,
} from '@/lib/notifications';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { toErrorMessage } from '@/lib/errors';

interface PushRegistrationGate {
  userId: string | null;
  ownIsletmeId: string | null;
  isletmeLoading: boolean;
  accountDeletionScheduledAt: string | null;
}

export function resolvePushTokenRegistrationUserId({
  userId,
  ownIsletmeId,
  isletmeLoading,
  accountDeletionScheduledAt,
}: PushRegistrationGate): string | null {
  if (
    !userId
    || !ownIsletmeId
    || isletmeLoading
    || accountDeletionScheduledAt
  ) {
    return null;
  }
  return userId;
}

/**
 * Push kaydını kullanıcı kimliğine bağlar.
 *
 * Aynı uygulama sürecinde A çıkış yaptıktan sonra B giriş yaparsa boolean bir
 * "bir kez kaydettim" kapısı B'yi sessizce atlıyordu. Ayrıca A'nın token alma
 * isteği geç dönerse B oturumunda A adına kayıt denenebilirdi. User-id kapısı ve
 * effect cleanup bu iki yarışı birlikte kapatır.
 */
export function usePushTokenRegistration(userId: string | null): void {
  const { device: deviceConnection } = useNetworkStatus();

  useEffect(() => {
    if (!userId) return;
    resumePushTokenRegistrationForUser(userId);

    let cancelled = false;

    const setupPushNotifications = async () => {
      try {
        const preference = await AsyncStorage.getItem(
          NOTIFICATIONS_ENABLED_KEY,
        );
        if (cancelled) return;
        if (preference === 'false') {
          // Önceki kapatma çevrimdışıyken sunucuya ulaşamadıysa, kalıcı "false"
          // tercihi aynı zamanda açılışta ve ağ geri geldiğinde revoke retry
          // işaretidir.
          await removePushToken(userId);
          return;
        }

        // Açılışta sistem izni istenmez; yalnız önceden izin verilmiş cihazın
        // token'ı yenilenir. İlk izin isteme kurulum sonu akışında kalır.
        const token = await registerForPushNotificationsAsync({
          promptIfNeeded: false,
        });
        if (cancelled || !token) return;

        await savePushToken(userId, token);
      } catch (error) {
        if (__DEV__) {
          console.warn(
            'Push token uzlaşımı tamamlanamadı:',
            toErrorMessage(error),
          );
        }
      }
    };

    void setupPushNotifications();

    return () => {
      cancelled = true;
    };
  }, [deviceConnection, userId]);
}
