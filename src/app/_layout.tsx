import { useEffect, useState } from 'react';
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

const ONBOARDING_KEY = '@defter_onboarding_completed';

function RootLayoutNav() {
  const { user, loading, initialized } = useAuthContext();
  const segments = useSegments();
  const router = useRouter();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

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

  // Yukleniyor
  if (!initialized || loading || !onboardingChecked) {
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
            headerTitle: 'Islemi Duzenle',
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
            headerTitle: 'Kategori Duzenle',
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
            headerTitle: 'Isletme Bilgileri',
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
            headerTitle: 'Kullanim Kosullari',
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
            headerTitle: 'Gizlilik Politikasi',
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
            headerTitle: 'KVKK Aydinlatma Metni',
            headerShadowVisible: false,
          }}
        />
        {/* Duzenleme Sayfalari */}
        <Stack.Screen
          name="hesaplar/duzenle/[id]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitle: 'Hesap Duzenle',
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
            headerTitle: 'Cari Duzenle',
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
            headerTitle: 'Personel Duzenle',
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
