import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { toErrorMessage } from '@/lib/errors';
import i18n from '@/i18n';

// Reminder storage key prefix
const REMINDER_STORAGE_KEY = 'reminder_';
export const NOTIFICATIONS_ENABLED_KEY = '@defter_notifications_enabled';

// Aynı JS sürecindeki token yazılarını sırala. A kullanıcısının yavaş RPC'si B
// girişinden sonra tamamlanıp tokenı tekrar A'ya taşıyamaz; B her zaman A'nın
// tamamlanmasının ardından claim eder.
let pushTokenWriteTail: Promise<void> = Promise.resolve();
let pushTokenWritesSuppressed = false;
const blockedPushTokenUserIds = new Set<string>();

function enqueuePushTokenWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = pushTokenWriteTail.then(operation, operation);
  pushTokenWriteTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function setNotificationsEnabledPreference(
  enabled: boolean,
): Promise<void> {
  if (!enabled) pushTokenWritesSuppressed = true;
  await AsyncStorage.setItem(
    NOTIFICATIONS_ENABLED_KEY,
    enabled ? 'true' : 'false',
  );
  if (enabled) pushTokenWritesSuppressed = false;
}

/**
 * A completed login (and only that) reopens token writes for the user. Logout
 * closes the fence synchronously before any asynchronous token cleanup starts.
 */
export function resumePushTokenRegistrationForUser(userId: string): void {
  blockedPushTokenUserIds.delete(userId);
}

/**
 * A failed auth sign-out leaves the current session active after its server
 * push-token row may already have been removed. Reconcile that row immediately
 * without prompting for permission. If the network is also unavailable, the
 * root registration hook retries when connectivity changes.
 */
export async function restorePushTokenAfterFailedSignOut(
  userId: string,
): Promise<void> {
  resumePushTokenRegistrationForUser(userId);

  try {
    const preference = await AsyncStorage.getItem(
      NOTIFICATIONS_ENABLED_KEY,
    );
    if (preference === 'false') return;

    const token = await registerForPushNotificationsAsync({
      promptIfNeeded: false,
    });
    if (!token) return;

    await savePushToken(userId, token);
  } catch (error) {
    if (__DEV__) {
      console.warn(
        'Başarısız çıkış sonrası push token yenilenemedi:',
        toErrorMessage(error),
      );
    }
  }
}

// Bildirim ayarları
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Push token al
// promptIfNeeded=false: sistem izni İSTEMEZ; yalnızca izin zaten verilmişse token alır.
// (v1.5: izin isteme, app açılışından kurulum-sonu kutlama ekranındaki pre-prompt'a taşındı.
// Mevcut kullanıcılar izni zaten vermişse token yenileme davranışı değişmez.)
export async function registerForPushNotificationsAsync(
  options?: { promptIfNeeded?: boolean }
): Promise<string | null> {
  const promptIfNeeded = options?.promptIfNeeded ?? true;
  let token: string | null = null;

  // Fiziksel cihaz kontrolü
  if (!Device.isDevice) {
    if (__DEV__) {
      console.log('Push notifications sadece fiziksel cihazlarda çalışır');
    }
    return null;
  }

  // Android için channel oluştur.
  // name/description Android SİSTEM AYARLARINDA kullanıcıya gösterilir (Ayarlar >
  // Uygulamalar > Bildirimler) — sabit İngilizce yazılmışlardı, Türk kullanıcı orada
  // "Scheduled Transactions" görüyordu (aynı dosyada bildirim GÖVDELERİ i18n'den
  // geliyor). Kanal metadata'sı aynı channelId ile tekrar çağrıldığında yenilenir,
  // yani mevcut kullanıcılarda da bir sonraki açılışta düzelir.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: i18n.t('common:notifications.channels.defaultName'),
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0D5C4D',
    });

    await Notifications.setNotificationChannelAsync('scheduled-transactions', {
      name: i18n.t('common:notifications.channels.scheduledName'),
      description: i18n.t('common:notifications.channels.scheduledDescription'),
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#F59E0B',
    });
  }

  // İzin kontrolü
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    if (!promptIfNeeded) {
      // Sessiz mod: izin yoksa sormadan çık (izin pre-prompt ile ayrıca istenir)
      return null;
    }
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    if (__DEV__) {
      console.log('Bildirim izni alınamadı');
    }
    return null;
  }

  // Expo push token al
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;

    if (!projectId) {
      if (__DEV__) {
        console.error('EAS project ID bulunamadı');
      }
      return null;
    }

    const pushToken = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    token = pushToken.data;
    if (__DEV__) {
      console.log('Push token alındı:', token);
    }
  } catch (error) {
    if (__DEV__) {
      console.error('Push token alınamadı:', error);
    }
    return null;
  }

  return token;
}

function isMissingPushClaimRpc(error: { code?: string } | null): boolean {
  return error?.code === 'PGRST202' || error?.code === '42883';
}

// Push token'ı veritabanına kaydet. Yeni istemci atomik claim RPC'siyle aynı
// cihaz token'ının eski kullanıcı satırını da temizler. RPC henüz deploy edilmemiş
// kısa rollout penceresinde yalnız "fonksiyon yok" hatası legacy upsert'e düşer.
async function persistPushToken(userId: string, token: string): Promise<boolean> {
  try {
    // Geç kalan A-kullanıcısı effect'i B oturumunda A adına kayıt yazamasın.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || session.user.id !== userId) {
      if (__DEV__) {
        console.log('Push token kaydedilmedi: kullanıcı oturumu eşleşmiyor');
      }
      return false;
    }

    const locale = i18n.language?.startsWith('en') ? 'en' : 'tr';
    const { error: claimError } = await supabase.rpc('claim_push_token_v1', {
      p_token: token,
      p_platform: Platform.OS,
      p_locale: locale,
    });

    if (!claimError) {
      if (__DEV__) {
        console.log('Push token kaydedildi');
      }
      return true;
    }

    if (!isMissingPushClaimRpc(claimError)) {
      if (__DEV__) {
        console.warn('Push token claim hatası:', toErrorMessage(claimError));
      }
      return false;
    }

    // Migration ile uygulama rollout'u arasındaki kısa süre için geriye uyum.
    // Güvenlik/validasyon hatalarında buraya düşülmez; yalnız RPC yoksa eski 1.5.x
    // davranışı sürdürülür.
    const { error: legacyError } = await supabase
      .from('push_tokens')
      .upsert(
        {
          user_id: userId,
          token,
          platform: Platform.OS,
          locale,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );

    if (legacyError) {
      if (__DEV__) {
        console.warn('Push token kaydetme hatası:', toErrorMessage(legacyError));
      }
      return false;
    }

    return true;
  } catch (error) {
    if (__DEV__) {
      console.warn('Push token kaydetme hatası:', toErrorMessage(error));
    }
    return false;
  }
}

export function savePushToken(
  userId: string,
  token: string,
): Promise<boolean> {
  return enqueuePushTokenWrite(async () => {
    try {
      if (blockedPushTokenUserIds.has(userId)) return false;
      const preference = await AsyncStorage.getItem(
        NOTIFICATIONS_ENABLED_KEY,
      );
      if (
        blockedPushTokenUserIds.has(userId)
        || pushTokenWritesSuppressed
        || preference === 'false'
      ) {
        return false;
      }
      return await persistPushToken(userId, token);
    } catch (error) {
      if (__DEV__) {
        console.warn('Push token tercihi okunamadı:', toErrorMessage(error));
      }
      return false;
    }
  });
}

// Push token'ı sil (logout sırasında)
export async function removePushToken(userId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', userId);

    if (error) {
      if (__DEV__) {
        console.error('Push token silme hatası:', error);
      }
    }
  } catch (error) {
    if (__DEV__) {
      console.error('Push token silme hatası:', error);
    }
  }
}

/**
 * Kullanıcı bildirim anahtarını kapattığında önce yeni claim'leri bastır, daha
 * önce başlamış claim kuyruğunun bitmesini bekle ve EN SON token/yerel
 * bildirimleri temizle. Böylece geç bir claim silinen tokenı geri koyamaz.
 */
export async function disableNotificationsForUser(
  userId: string | null,
): Promise<void> {
  await setNotificationsEnabledPreference(false);
  await pushTokenWriteTail;

  await Promise.allSettled([
    userId ? removePushToken(userId) : Promise.resolve(),
    Notifications.unregisterForNotificationsAsync(),
    Notifications.cancelAllScheduledNotificationsAsync(),
    Notifications.dismissAllNotificationsAsync(),
  ]);
}

/**
 * Oturum kapanırken sunucu token'ı ile cihaz içi planlı/gösterilmiş bildirimleri
 * paralel temizle. Her adım best-effort'tur:
 * bildirim altyapısındaki bir hata kullanıcının çıkış yapmasını engellemez.
 */
export async function clearNotificationsForSignOut(userId: string): Promise<void> {
  // Synchronous fence: token acquisition that finishes after logout began may
  // enqueue a save later, but that late operation can no longer recreate the
  // row after this user's queued removal.
  blockedPushTokenUserIds.add(userId);
  const queuedRemoval = enqueuePushTokenWrite(async () => {
    await removePushToken(userId);
  });

  await Promise.allSettled([
    queuedRemoval,
    Notifications.cancelAllScheduledNotificationsAsync(),
    Notifications.dismissAllNotificationsAsync(),
  ]);
}

/**
 * Gives the authenticated RLS delete a short head start before auth.signOut()
 * invalidates the local session. Logout is still bounded: a stalled network
 * cannot hold the user on screen indefinitely.
 */
export async function waitForNotificationCleanupBeforeSignOut(
  userId: string,
  timeoutMs = 2_500,
): Promise<'completed' | 'timeout'> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timeoutHandle = setTimeout(() => resolve('timeout'), timeoutMs);
  });

  try {
    return await Promise.race([
      clearNotificationsForSignOut(userId).then(
        (): 'completed' => 'completed',
      ),
      timeout,
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

/**
 * Native APNs/FCM kaydını yalnız auth çıkışı gerçekten tamamlandıktan sonra
 * kaldır. Böylece başarısız bir signOut, açık kalan oturumun bildirimlerini
 * sessizce kesmez.
 */
export async function finalizeNotificationsAfterSignOut(): Promise<void> {
  await Promise.allSettled([
    Notifications.unregisterForNotificationsAsync(),
  ]);
}

// Bildirim dinleyicileri ekle
export function addNotificationListeners(
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationResponse?: (response: Notifications.NotificationResponse) => void
) {
  const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
    if (__DEV__) {
      console.log('Bildirim alındı:', notification);
    }
    onNotificationReceived?.(notification);
  });

  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    if (__DEV__) {
      console.log('Bildirime tıklandı:', response);
    }
    onNotificationResponse?.(response);
  });

  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}

// İleri tarihli işlem için local notification planla
export async function scheduleTransactionReminder(
  transactionId: string,
  title: string,
  body: string,
  triggerDate: Date,
  data: {
    type: string;
    transaction_id: string;
    hesap_id?: string | null;
    cari_id?: string | null;
    personel_id?: string | null;
  }
): Promise<string | null> {
  try {
    // Global bildirim ayarı kontrolü
    const notifEnabled = await AsyncStorage.getItem('@defter_notifications_enabled');
    if (notifEnabled === 'false') {
      if (__DEV__) {
        console.log('Bildirimler kapalı, bildirim planlanmadı');
      }
      return null;
    }

    // Geçmiş tarih kontrolü
    if (triggerDate < new Date()) {
      if (__DEV__) {
        console.log('Hatırlatma tarihi geçmiş, bildirim planlanmadı');
      }
      return null;
    }

    // Mevcut hatırlatmayı iptal et (varsa)
    await cancelTransactionReminder(transactionId);

    // Yeni bildirim planla
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        channelId: 'scheduled-transactions',
      },
    });

    // Notification ID'yi AsyncStorage'a kaydet
    await AsyncStorage.setItem(
      `${REMINDER_STORAGE_KEY}${transactionId}`,
      notificationId
    );

    if (__DEV__) {
      console.log(`Hatırlatma planlandı: ${transactionId} -> ${notificationId} (${triggerDate.toISOString()})`);
    }
    return notificationId;
  } catch (error) {
    if (__DEV__) {
      console.error('Hatırlatma planlama hatası:', error);
    }
    return null;
  }
}

// İşlem için planlanmış hatırlatmayı iptal et
export async function cancelTransactionReminder(transactionId: string): Promise<void> {
  try {
    const storageKey = `${REMINDER_STORAGE_KEY}${transactionId}`;
    const notificationId = await AsyncStorage.getItem(storageKey);

    if (notificationId) {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      await AsyncStorage.removeItem(storageKey);
      if (__DEV__) {
        console.log(`Hatırlatma iptal edildi: ${transactionId}`);
      }
    }
  } catch (error) {
    if (__DEV__) {
      console.error('Hatırlatma iptal hatası:', error);
    }
  }
}

// Not (note) için local notification planla
const NOTE_REMINDER_STORAGE_KEY = 'note_reminder_';

export async function scheduleNoteReminder(
  noteId: string,
  title: string,
  body: string,
  triggerDate: Date,
  data: {
    type: 'note_reminder';
    note_id: string;
    entity_type: string;
    entity_id?: string | null;
  }
): Promise<string | null> {
  try {
    const notifEnabled = await AsyncStorage.getItem('@defter_notifications_enabled');
    if (notifEnabled === 'false') return null;

    if (triggerDate < new Date()) return null;

    await cancelNoteReminder(noteId);

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        channelId: 'scheduled-transactions',
      },
    });

    await AsyncStorage.setItem(
      `${NOTE_REMINDER_STORAGE_KEY}${noteId}`,
      notificationId
    );

    return notificationId;
  } catch {
    return null;
  }
}

export async function cancelNoteReminder(noteId: string): Promise<void> {
  try {
    const storageKey = `${NOTE_REMINDER_STORAGE_KEY}${noteId}`;
    const notificationId = await AsyncStorage.getItem(storageKey);

    if (notificationId) {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      await AsyncStorage.removeItem(storageKey);
    }
  } catch {
    // silently ignore
  }
}

// Hatırlatma tarihini hesapla
export function calculateReminderDate(
  scheduledDate: string,
  daysBefore: number,
  time: string
): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date(scheduledDate + 'T00:00:00');
  date.setDate(date.getDate() - daysBefore);
  date.setHours(hours, minutes, 0, 0);
  return date;
}
