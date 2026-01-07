import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

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
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token: string | null = null;

  // Fiziksel cihaz kontrolü
  if (!Device.isDevice) {
    console.log('Push notifications sadece fiziksel cihazlarda çalışır');
    return null;
  }

  // Android için channel oluştur
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Varsayılan',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0D5C4D',
    });

    await Notifications.setNotificationChannelAsync('scheduled-transactions', {
      name: 'İleri Tarihli İşlemler',
      description: 'İleri tarihli işlem hatırlatmaları',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#F59E0B',
    });
  }

  // İzin kontrolü
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Bildirim izni alınamadı');
    return null;
  }

  // Expo push token al
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;

    if (!projectId) {
      console.error('EAS project ID bulunamadı');
      return null;
    }

    const pushToken = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    token = pushToken.data;
    console.log('Push token alındı:', token);
  } catch (error) {
    console.error('Push token alınamadı:', error);
    return null;
  }

  return token;
}

// Push token'ı veritabanına kaydet
export async function savePushToken(userId: string, token: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        {
          user_id: userId,
          token: token,
          platform: Platform.OS,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id',
        }
      );

    if (error) {
      console.error('Push token kaydetme hatası:', error);
    } else {
      console.log('Push token kaydedildi');
    }
  } catch (error) {
    console.error('Push token kaydetme hatası:', error);
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
      console.error('Push token silme hatası:', error);
    }
  } catch (error) {
    console.error('Push token silme hatası:', error);
  }
}

// Bildirim dinleyicileri ekle
export function addNotificationListeners(
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationResponse?: (response: Notifications.NotificationResponse) => void
) {
  const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
    console.log('Bildirim alındı:', notification);
    onNotificationReceived?.(notification);
  });

  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    console.log('Bildirime tıklandı:', response);
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
    // Geçmiş tarih kontrolü
    if (triggerDate <= new Date()) {
      console.log('Hatırlatma tarihi geçmiş, bildirim planlanmadı');
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

    console.log(`Hatırlatma planlandı: ${transactionId} -> ${notificationId} (${triggerDate.toISOString()})`);
    return notificationId;
  } catch (error) {
    console.error('Hatırlatma planlama hatası:', error);
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
      console.log(`Hatırlatma iptal edildi: ${transactionId}`);
    }
  } catch (error) {
    console.error('Hatırlatma iptal hatası:', error);
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
