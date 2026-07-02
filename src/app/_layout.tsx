import { useEffect, useState, useRef, useCallback, useMemo, useSyncExternalStore } from 'react';
import { Stack, useRouter, useSegments, Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, ActivityIndicator, StyleSheet, Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider, useAuthContext } from '@/contexts/AuthContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { ReviewProvider } from '@/contexts/ReviewContext';
import { ToastContainer, Text } from '@/components/ui';
import { ChangePasswordModal } from '@/components/auth';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { WifiOff } from 'lucide-react-native';
import { PersistentTabBar } from '@/components/ui/PersistentTabBar';
import { colors } from '@/constants/colors';
import {
  registerForPushNotificationsAsync,
  savePushToken,
  addNotificationListeners,
} from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { logEvent } from '@/lib/appEvents';

// Initialize i18n
import '@/i18n';
import { loadSavedLanguage } from '@/i18n';
import { subscribeNeedsSetup, getNeedsSetupSync, loadNeedsSetup } from '@/lib/setupFlow';

const ONBOARDING_KEY = '@defter_onboarding_completed';

function RootLayoutNav() {
  const { user, initialized, needsPasswordReset, clearPasswordReset } = useAuthContext();
  const segments = useSegments();
  const router = useRouter();
  const { t } = useTranslation(['navigation', 'common', 'transactions', 'accounts', 'clients', 'staff', 'reports', 'categories', 'settings', 'products', 'ocrImport', 'errors']);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  // Kurulum akışı (v1.5): yalnızca YENİ işletme oluşturulduğunda true olur (setupFlow).
  // useSyncExternalStore → kurulum tamamlanınca kapı anında kapanır, geri sıçrama olmaz.
  const needsSetup = useSyncExternalStore(subscribeNeedsSetup, getNeedsSetupSync);
  const pushTokenRegistered = useRef(false);
  const insets = useSafeAreaInsets();
  const modifiedInsets = useMemo(() => ({ ...insets, bottom: 0 }), [insets]);
  const isOffline = useNetworkStatus();

  // Session tracking: Türkiye saatine göre günde 1 kez kayıt
  const SESSION_DATE_KEY = '@defter_last_session_date';

  const trackSession = useCallback(async (userId: string) => {
    try {
      // Türkiye saatine göre bugünün tarihini al
      const todayTR = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }); // "2026-03-05"
      const lastDate = await AsyncStorage.getItem(SESSION_DATE_KEY);
      if (lastDate === todayTR) return; // Bugün zaten kaydedildi

      const { error } = await supabase
        .from('app_sessions')
        .insert({ user_id: userId, platform: Platform.OS });

      if (error) {
        if (__DEV__) console.warn('Session tracking:', error.message);
        return;
      }
      await AsyncStorage.setItem(SESSION_DATE_KEY, todayTR);
    } catch (e) {
      if (__DEV__) console.warn('Session tracking error:', e);
    }
  }, []);

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
    // Kurulum bayrağını AsyncStorage'dan yükle (yeni işletme oluşturulmuşsa true)
    loadNeedsSetup();
  }, []);

  // Push notification ayarları
  useEffect(() => {
    if (!user || pushTokenRegistered.current) return;

    const setupPushNotifications = async () => {
      // promptIfNeeded:false — açılışta sistem izni İSTENMEZ; yalnızca izni zaten
      // vermiş kullanıcıların token'ı tazelenir. Yeni kullanıcıya izin, ilk işlem
      // sonrası kutlama ekranındaki pre-prompt ile sorulur (kurulum-tamam.tsx).
      const token = await registerForPushNotificationsAsync({ promptIfNeeded: false });
      if (token) {
        await savePushToken(user.id, token);
        pushTokenRegistered.current = true;
      }
    };

    setupPushNotifications();
  }, [user]);

  // Session tracking: cold start + her foreground'da kontrol
  useEffect(() => {
    if (!user) return;

    // Cold start
    trackSession(user.id);

    // Background → foreground (arka plandan geri gelince)
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        trackSession(user.id);
      }
    });

    return () => sub.remove();
  }, [user, trackSession]);

  // Ekran görüntüleme izleme: her route değişiminde tek olay (ateşle-unut).
  // Bağımlılık user NESNESİ değil user.id olmalı: TOKEN_REFRESHED her seferinde
  // yeni user nesnesi set ediyor; nesne bağımlılığı kullanıcı gezinmeden mükerrer
  // screen_view üretiyordu (uygulama açıkken ~saatte bir + her foreground dönüşü).
  const screenPath = segments.join('/');
  const userId = user?.id;
  useEffect(() => {
    if (!userId || !screenPath) return;
    logEvent('screen_view', { screen: screenPath });
  }, [userId, screenPath]);

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
    const inVerify = segments[0] === 'verify';
    const inKurulum = segments[0]?.startsWith('kurulum') ?? false;
    // Kurulum sırasında "ekle" ekranlarına (cari/personel/hesap) gidilebilsin —
    // rehberli oluşturma adımı buraya yönlendirir; guard başa atmamalı.
    const inSetupCreate =
      (segments[0] === 'cariler' || segments[0] === 'personel' || segments[0] === 'hesaplar') &&
      (segments as readonly string[])[1] === 'ekle';

    if (!user && !inAuthGroup && !inOnboarding && !inVerify) {
      // Kullanici giris yapmamis, login'e yonlendir
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup && !needsPasswordReset) {
      // Kullanici giris yapmis ve sifre sifirlama modunda degil
      if (showOnboarding) {
        // Onboarding gosterilmemis, onboarding'e yonlendir
        router.replace('/onboarding');
      } else if (needsSetup) {
        // Yeni isletme: kurulum akisi (sektor -> ilk kayit -> kutlama)
        router.replace('/kurulum');
      } else {
        // Ana sayfaya yonlendir
        router.replace('/(tabs)');
      }
    } else if (user && needsSetup && !inKurulum && !inSetupCreate && !inOnboarding && !inAuthGroup && !inVerify && !needsPasswordReset) {
      // Kurulum yarim kaldiysa (uygulama kapatilip acildi vb.) kuruluma geri getir.
      // Bayrak yalnizca yeni isletmede set edildigi icin mevcut kullanicilar buraya hic girmez.
      // inSetupCreate: kurulumun "ekle" adimlari haric (oraya gidebilmeli).
      router.replace('/kurulum');
    }
  }, [user, segments, initialized, onboardingChecked, showOnboarding, needsSetup, needsPasswordReset, router]);

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
      <ToastContainer />
      {isOffline && (
        <View style={[layoutStyles.offlineBanner, { paddingTop: insets.top }]}>
          <WifiOff size={14} color={colors.white} />
          <Text style={layoutStyles.offlineText}>{t('errors:network.noConnection')}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
      <SafeAreaInsetsContext.Provider value={modifiedInsets}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
          gestureEnabled: true,
          headerBackTitle: t('common:buttons.back'),
          headerBackVisible: true,
          headerBackButtonDisplayMode: 'minimal',
          headerTintColor: colors.text,
          headerStyle: { backgroundColor: colors.surface },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="arama" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="kurulum" options={{ headerShown: false, animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="kurulum-tabela" options={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: false }} />
        <Stack.Screen name="kurulum-ilk-kayit" options={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: false }} />
        <Stack.Screen name="kurulum-tamam" options={{ headerShown: false, animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="verify" options={{ headerShown: false, animation: 'fade' }} />
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
          name="notlar/index"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: t('navigation:screens.notes'),
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
        <Stack.Screen
          name="islemler/ileri-tarihli/duzenle/[id]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: t('transactions:scheduled.title'),
            headerShadowVisible: false,
          }}
        />
        {/* Raporlar */}
        <Stack.Screen
          name="raporlar/index"
          options={{
            presentation: 'card',
            headerShown: true,
            headerBackVisible: true,
            gestureEnabled: true,
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
            headerBackVisible: true,
            gestureEnabled: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: t('reports:titles.categoryDetail'),
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="raporlar/genel"
          options={{
            presentation: 'card',
            headerShown: true,
            headerBackVisible: true,
            gestureEnabled: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: t('reports:titles.overview'),
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="raporlar/gelir-gider"
          options={{
            presentation: 'card',
            headerShown: true,
            headerBackVisible: true,
            gestureEnabled: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: t('reports:titles.categoryDistribution'),
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="raporlar/cari"
          options={{
            presentation: 'card',
            headerShown: true,
            headerBackVisible: true,
            gestureEnabled: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: t('reports:titles.clientReport'),
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="raporlar/personel"
          options={{
            presentation: 'card',
            headerShown: true,
            headerBackVisible: true,
            gestureEnabled: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: t('reports:titles.personnelReport'),
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="raporlar/karsilastirma"
          options={{
            presentation: 'card',
            headerShown: true,
            headerBackVisible: true,
            gestureEnabled: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: t('reports:titles.comparison'),
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="raporlar/alis-satis"
          options={{
            presentation: 'card',
            headerShown: true,
            headerBackVisible: true,
            gestureEnabled: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: t('reports:titles.purchaseSales'),
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
        <Stack.Screen
          name="personel/izin-gecmisi/[id]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: t('staff:leave.leaveHistory'),
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
            headerTitle: t('settings:dataImport.title'),
            headerShadowVisible: false,
          }}
        />
        {/* Mutabakat */}
        <Stack.Screen
          name="mutabakat/[cariId]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: t('mutabakat:title'),
            headerShadowVisible: false,
          }}
        />
        {/* Arşiv */}
        <Stack.Screen
          name="arsiv/index"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: t('common:archive.title'),
            headerShadowVisible: false,
          }}
        />
        {/* Ürünler */}
        <Stack.Screen
          name="urunler/index"
          options={{
            presentation: 'card',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="urunler/[id]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: t('products:stock.movements'),
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="urunler/ekle"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: t('products:addProduct'),
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="urunler/duzenle/[id]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: t('products:editProduct'),
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="urunler/toplu-giris"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: t('products:bulk.stockIn'),
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="urunler/toplu-cikis"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: t('products:bulk.stockOut'),
            headerShadowVisible: false,
          }}
        />
        {/* Kullanıcı Yönetimi */}
        <Stack.Screen
          name="ayarlar/kullanici-yonetimi"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="ayarlar/davet-olustur"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="ayarlar/paylasilan-isletmeler"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="ayarlar/islem-gecmisi"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="foto-import"
          options={{
            headerShown: false,
          }}
        />
      </Stack>
      </SafeAreaInsetsContext.Provider>
      <PersistentTabBar />
      </View>

      {/* Şifre değiştirme modal'ı - şifremi unuttum akışı sonrası gösterilir */}
      {/* OTP doğrulandıktan veya deep link'ten geldikten sonra kullanıcı /(tabs)'a yönlendirilir ve modal burada gösterilir */}
      <ChangePasswordModal
        visible={!!user && needsPasswordReset && segments[0] !== 'verify' && !['forgot-password', 'reset-password'].includes((segments as string[])[1])}
        onSuccess={clearPasswordReset}
        onClose={clearPasswordReset}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ToastProvider>
              <ReviewProvider>
                <RootLayoutNav />
              </ReviewProvider>
            </ToastProvider>
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

const layoutStyles = StyleSheet.create({
  offlineBanner: {
    backgroundColor: colors.error,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 6,
  },
  offlineText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '600',
  },
});
