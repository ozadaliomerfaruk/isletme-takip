import { useEffect, useState, useRef } from 'react';
import { Stack, useRouter, useSegments, Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider, useAuthContext } from '@/contexts/AuthContext';
import { colors } from '@/constants/colors';
import {
  registerForPushNotificationsAsync,
  savePushToken,
  addNotificationListeners,
} from '@/lib/notifications';

// Initialize i18n
import '@/i18n';
import { loadSavedLanguage } from '@/i18n';

const ONBOARDING_KEY = '@defter_onboarding_completed';

function RootLayoutNav() {
  const { user, initialized } = useAuthContext();
  const segments = useSegments();
  const router = useRouter();
  const { t } = useTranslation(['navigation', 'common', 'transactions', 'accounts', 'clients', 'staff', 'reports', 'categories', 'settings']);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const pushTokenRegistered = useRef(false);

  // Onboarding durumunu kontrol et ve dil tercihini yükle
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

    // Load saved language preference
    loadSavedLanguage();

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
        if (__DEV__) {
          console.log('Bildirim alındı:', notification.request.content.title);
        }
      },
      (response) => {
        // Bildirime tıklandığında
        const data = response.notification.request.content.data as {
          type?: string;
          screen?: string;
          transaction_id?: string;
          hesap_id?: string;
          cari_id?: string;
          personel_id?: string;
        };

        // İleri tarihli işlem hatırlatması
        if (data?.type === 'scheduled_transaction_reminder') {
          if (data.hesap_id) {
            router.push(`/hesaplar/${data.hesap_id}` as Href);
          } else if (data.cari_id) {
            router.push(`/cariler/${data.cari_id}` as Href);
          } else if (data.personel_id) {
            router.push(`/personel/${data.personel_id}` as Href);
          } else {
            // Varsayılan olarak ana sayfaya git
            router.push('/(tabs)' as Href);
          }
        } else if (data?.screen) {
          router.push(data.screen as Href);
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
          headerBackTitle: t('common:buttons.back'),
          headerBackVisible: true,
          headerBackButtonDisplayMode: 'minimal',
          headerTintColor: colors.text,
          headerStyle: { backgroundColor: colors.surface },
          headerShadowVisible: false,
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
            headerTitle: t('accounts:titles.accountTransactions'),
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
            headerTitle: t('clients:titles.clientTransactions'),
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
            headerTitle: t('staff:titles.personnelTransactions'),
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
            headerTitle: t('transactions:titles.allTransactions'),
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
            headerTitle: t('accounts:titles.addAccount'),
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
            headerTitle: t('clients:titles.addClient'),
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
            headerTitle: t('staff:titles.addPersonnel'),
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
            headerTitle: t('transactions:titles.addIncome'),
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
            headerTitle: t('transactions:titles.addExpense'),
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
            headerTitle: t('transactions:titles.transferBetweenAccounts'),
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
            headerTitle: t('transactions:types.cari_alis'),
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
            headerTitle: t('transactions:types.cari_odeme'),
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
            headerTitle: t('transactions:types.cari_satis'),
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
            headerTitle: t('transactions:types.cari_tahsilat'),
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
            headerTitle: t('transactions:types.personel_gider'),
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
            headerTitle: t('transactions:types.personel_odeme'),
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
            headerTitle: t('transactions:titles.editTransaction'),
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
            headerTitle: t('reports:titles.reports'),
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
            headerTitle: t('reports:titles.categoryDetail'),
            headerShadowVisible: false,
          }}
        />
        {/* Nakit Akışı */}
        <Stack.Screen
          name="nakit-akisi/index"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: t('common:dashboard.cashFlow'),
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
            headerTitle: t('categories:titles.categories'),
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
            headerTitle: t('categories:titles.addCategory'),
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
            headerTitle: t('categories:titles.editCategory'),
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
            headerTitle: t('settings:business.title'),
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
            headerTitle: t('navigation:menu.termsOfService'),
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
            headerTitle: t('navigation:menu.privacyPolicy'),
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
            headerTitle: t('navigation:menu.kvkk'),
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
            headerTitle: t('accounts:titles.editAccount'),
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="hesaplar/nakit-avanslar/[id]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: t('accounts:nakitAvans.title'),
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
            headerTitle: t('clients:titles.editClient'),
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
            headerTitle: t('staff:titles.editPersonnel'),
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="personel/toplu-gider"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: t('staff:bulkSalary.title'),
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="personel/toplu-odeme"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: t('staff:bulkPayment.title'),
            headerShadowVisible: false,
          }}
        />
        {/* Hesap Silme */}
        <Stack.Screen
          name="ayarlar/hesap-sil"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: t('settings:account.deleteAccount'),
            headerShadowVisible: false,
          }}
        />
        {/* Veri İçe Aktar */}
        <Stack.Screen
          name="ayarlar/data-import/index"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: t('settings:dataImport.title', { defaultValue: 'Veri İçe Aktar' }),
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
