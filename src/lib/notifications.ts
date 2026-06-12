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

  // Android için channel oluştur
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0D5C4D',
    });

    await Notifications.setNotificationChannelAsync('scheduled-transactions', {
      name: 'Scheduled Transactions',
      description: 'Reminders for scheduled transactions',
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

// Push token'ı veritabanına kaydet
export async function savePushToken(userId: string, token: string): Promise<void> {
  try {
    // Verify active session before attempting to save
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      if (__DEV__) {
        console.log('Push token kaydedilmedi: aktif oturum yok');
      }
      return;
    }

    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        {
          user_id: userId,
          token: token,
          platform: Platform.OS,
          // Edge function'lar (notify-linked-users) bildirim dilini bu alandan okur
          locale: i18n.language?.startsWith('en') ? 'en' : 'tr',
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id',
        }
      );

    if (error) {
      if (__DEV__) {
        console.warn('Push token kaydetme hatası:', toErrorMessage(error));
      }
    } else {
      if (__DEV__) {
        console.log('Push token kaydedildi');
      }
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('Push token kaydetme hatası:', toErrorMessage(error));
    }
  }
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
