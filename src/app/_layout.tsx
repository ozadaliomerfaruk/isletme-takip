import { useEffect, useState, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider, useAuthContext } from '@/contexts/AuthContext';
import { colors } from '@/constants/colors';
import {
  registerForPushNotificationsAsync,
  savePushToken,
  addNotificationListeners,
} from '@/lib/notifications';

const ONBOARDING_KEY = '@defter_onboarding_completed';

function RootLayoutNav() {
  const { user, initialized } = useAuthContext();
  const segments = useSegments();
  const router = useRouter();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const pushTokenRegistered = useRef(false);

  // Onboarding durumunu kontrol et
  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const completed = await AsyncStorage.getItem(ONBOARDING_KEY);
        setShowOnboarding(completed !== 'true');
      } catch (error) {
        setShowOnboarding(false);
      }
      setOnboardingChecked(true);
    };
    checkOnboarding();
  }, []);

  // Push notification ayarları
  useEffect(() => {
    if (!user || pushTokenRegistered.current) return;

    const setupPushNotifications = async () => {
      const token = await registerForPushNotificationsAsync();
      if (token) {
        await savePushToken(user.id, token);
        pushTokenRegistered.current = true;
      }
    };

    setupPushNotifications();
  }, [user]);

  // Bildirim dinleyicileri
  useEffect(() => {
    const cleanup = addNotificationListeners(
      (notification) => {
        // Bildirim alındığında (uygulama açıkken)
        console.log('Bildirim alındı:', notification.request.content.title);
      },
      (response) => {
        // Bildirime tıklandığında
        const data = response.notification.request.content.data;
        if (data?.screen) {
          router.push(data.screen as any);
        }
      }
    );

    return cleanup;
  }, [router]);

  useEffect(() => {
    if (!initialized || !onboardingChecked) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';

    if (!user && !inAuthGroup) {
      // Kullanici giris yapmamis, login'e yonlendir
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      // Kullanici giris yapmis
      if (showOnboarding) {
        // Onboarding gosterilmemis, onboarding'e yonlendir
        router.replace('/onboarding');
      } else {
        // Ana sayfaya yonlendir
        router.replace('/(tabs)');
      }
    }
  }, [user, segments, initialized, onboardingChecked, showOnboarding]);

  // Yukleniyor - sadece initialized ve onboardingChecked kontrol et
  // loading'i burada kontrol etmiyoruz çünkü login/logout sırasında da true oluyor
  if (!initialized || !onboardingChecked) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
          headerBackTitle: 'Geri',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen
          name="hesaplar/[id]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'Hesap Hareketleri',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="cariler/[id]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'Cari Hareketleri',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="personel/[id]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'Personel Hareketleri',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="islemler/index"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'Tüm İşlemler',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="hesaplar/ekle"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'Hesap Ekle',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="cariler/ekle"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'Cari Ekle',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="personel/ekle"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'Personel Ekle',
            headerShadowVisible: false,
          }}
        />
        {/* İşlem Formları */}
        <Stack.Screen
          name="islemler/gelir"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'Gelir Ekle',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="islemler/gider"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'Gider Ekle',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="islemler/transfer"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'Hesaplar Arası Transfer',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="islemler/cariAlis"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'Tedarikçiden Alış',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="islemler/cariOdeme"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'Tedarikçiye Ödeme',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="islemler/cariSatis"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'Müşteriye Satış',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="islemler/cariTahsilat"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'Müşteriden Tahsilat',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="islemler/personelGider"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'Personel Gideri',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="islemler/personelOdeme"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'Personel Ödemesi',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="islemler/duzenle/[id]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'İşlemi Düzenle',
            headerShadowVisible: false,
          }}
        />
        {/* Raporlar */}
        <Stack.Screen
          name="raporlar/index"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'Raporlar',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="raporlar/kategori/[id]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'Kategori Detayı',
            headerShadowVisible: false,
          }}
        />
        {/* Kategoriler */}
        <Stack.Screen
          name="kategoriler/index"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'Kategoriler',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="kategoriler/ekle"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'Kategori Ekle',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="kategoriler/duzenle/[id]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'Kategori Düzenle',
            headerShadowVisible: false,
          }}
        />
        {/* Ayarlar */}
        <Stack.Screen
          name="ayarlar/isletme"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'İşletme Bilgileri',
            headerShadowVisible: false,
          }}
        />
        {/* Yasal */}
        <Stack.Screen
          name="yasal/kullanim-kosullari"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'Kullanım Koşulları',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="yasal/gizlilik-politikasi"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'Gizlilik Politikası',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="yasal/kvkk"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'KVKK Aydınlatma Metni',
            headerShadowVisible: false,
          }}
        />
        {/* Düzenleme Sayfaları */}
        <Stack.Screen
          name="hesaplar/duzenle/[id]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'Hesap Düzenle',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="cariler/duzenle/[id]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'Cari Düzenle',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="personel/duzenle/[id]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'Personel Düzenle',
            headerShadowVisible: false,
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RootLayoutNav />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});
