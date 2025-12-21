# Restoran Hesap Kitap - Expo SDK 54+ Setup Rehberi

**Son Güncelleme:** 18 Aralık 2024  
**Versiyon:** 1.1  
**Strateji:** Core Layout + Enhancement Layer (Dene, beğenirsen kullan)

---

## 📋 İçindekiler

1. [Hızlı Başlangıç](#1-hızlı-başlangıç)
2. [Detaylı Kurulum](#2-detaylı-kurulum)
3. [Paket Kurulumu](#3-paket-kurulumu)
4. [Lottie Animasyonları](#4-lottie-animasyonları)
5. [UI Test Ekranı](#5-ui-test-ekranı)
6. [Karar Matrisi](#6-karar-matrisi)
7. [Sorun Giderme](#7-sorun-giderme)

---

## 1. Hızlı Başlangıç

### 1.1 Kopyala-Yapıştır Komutları

```bash
# ════════════════════════════════════════════
# 1. YENİ PROJE OLUŞTUR
# ════════════════════════════════════════════
npx create-expo-app@latest restoran-hesap-kitap --template tabs
cd restoran-hesap-kitap

# ════════════════════════════════════════════
# 2. SDK 54'E GÜNCELLE
# ════════════════════════════════════════════
npm install expo@^54.0.0
npx expo install --fix

# ════════════════════════════════════════════
# 3. CORE PAKETLER (Zorunlu)
# ════════════════════════════════════════════
npx expo install react-native-reanimated
npx expo install lottie-react-native
npx expo install expo-blur
npx expo install @react-native-async-storage/async-storage
npx expo install react-native-safe-area-context
npm install lucide-react-native

# ════════════════════════════════════════════
# 4. ENHANCEMENT PAKETLER (Opsiyonel - Test için)
# ════════════════════════════════════════════
npx expo install expo-glass-effect

# ════════════════════════════════════════════
# 5. KONTROL VE BAŞLAT
# ════════════════════════════════════════════
npx expo-doctor
npx expo start
```

### 1.2 Node.js Gereksinimi

```bash
# Node versiyonunu kontrol et
node -v
# Çıktı: v20.x.x olmalı (minimum 20.19.4)

# Güncelleme gerekiyorsa:
# macOS/Linux
nvm install 20
nvm use 20

# Windows: https://nodejs.org/ adresinden indir
```

---

## 2. Detaylı Kurulum

### 2.1 Yeni Proje Oluşturma

```bash
# En son Expo template ile
npx create-expo-app@latest restoran-hesap-kitap --template tabs

# Proje klasörüne gir
cd restoran-hesap-kitap

# Git başlat (opsiyonel)
git init
git add .
git commit -m "Initial commit"
```

### 2.2 SDK 54 Güncelleme

```bash
# expo paketini güncelle
npm install expo@^54.0.0

# Tüm bağımlılıkları SDK 54'e uyumlu hale getir
npx expo install --fix

# Sağlık kontrolü
npx expo-doctor

# Olası uyarıları düzelt
# Doktor komutunun önerilerini takip et
```

### 2.3 Doğrulama

```bash
# package.json kontrol
cat package.json | grep '"expo"'
# Beklenen: "expo": "^54.x.x"

# React Native versiyonu
cat package.json | grep '"react-native"'
# Beklenen: "react-native": "0.81.x"

# Başlat ve test et
npx expo start
```

---

## 3. Paket Kurulumu

### 3.1 Core Paketler (Zorunlu)

Bu paketler **her platformda çalışır** ve production-ready'dir.

```bash
# ════════════════════════════════════════════
# ANİMASYONLAR
# ════════════════════════════════════════════
# Reanimated v4 - entry/exit animasyonları, spring physics
npx expo install react-native-reanimated

# Lottie - JSON animasyonları
npx expo install lottie-react-native

# ════════════════════════════════════════════
# UI BİLEŞENLERİ
# ════════════════════════════════════════════
# Blur Effect - iOS blur, Android fallback
npx expo install expo-blur

# Safe Area - notch/gesture bar desteği
npx expo install react-native-safe-area-context

# Icons - Lucide icon seti
npm install lucide-react-native

# ════════════════════════════════════════════
# STORAGE
# ════════════════════════════════════════════
# Async Storage - onboarding state için
npx expo install @react-native-async-storage/async-storage
```

### 3.2 Enhancement Paketler (Opsiyonel)

Bu paketler **deneyseldir** ve sadece test/deneme için kurulmalı.

```bash
# ════════════════════════════════════════════
# LIQUID GLASS (iOS 26+ only)
# ════════════════════════════════════════════
# ⚠️ Deneysel - API değişebilir
# ⚠️ Sadece iOS 26+ cihazlarda görünür
# ⚠️ Layout buna bağımlı OLMAMALI

npx expo install expo-glass-effect
```

### 3.3 babel.config.js

```javascript
// babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // ⚠️ Reanimated MUTLAKA en sonda olmalı!
      'react-native-reanimated/plugin',
    ],
  };
};
```

### 3.4 app.json

```json
{
  "expo": {
    "name": "Restoran Hesap Kitap",
    "slug": "restoran-hesap-kitap",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "scheme": "restoranhesapkitap",
    "userInterfaceStyle": "light",
    "newArchEnabled": true,
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.yourname.restoranhesapkitap",
      "infoPlist": {
        "UIViewControllerBasedStatusBarAppearance": true
      }
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/adaptive-icon.png",
        "backgroundColor": "#1a1a2e"
      },
      "package": "com.yourname.restoranhesapkitap"
    },
    "plugins": [
      "expo-router",
      [
        "expo-build-properties",
        {
          "ios": {
            "deploymentTarget": "15.0"
          },
          "android": {
            "compileSdkVersion": 35,
            "targetSdkVersion": 35,
            "minSdkVersion": 24
          }
        }
      ]
    ],
    "experiments": {
      "typedRoutes": true
    }
  }
}
```

---

## 4. Lottie Animasyonları

### 4.1 Ücretsiz Kaynaklar

| Site | URL | Özellik |
|------|-----|---------|
| **LottieFiles** | lottiefiles.com | En büyük kaynak |
| **LordIcon** | lordicon.com | Animasyonlu ikonlar |
| **UseAnimations** | useanimations.com | Micro interactions |
| **IconScout** | iconscout.com/lottie | Çeşitli animasyonlar |

### 4.2 Arama Terimleri

```
Onboarding için:
├── "welcome" / "hello" / "wave" / "greeting"
├── "money" / "finance" / "wallet" / "cash" / "payment"
├── "handshake" / "partnership" / "team" / "business"
├── "chart" / "analytics" / "graph" / "report" / "statistics"
└── "success" / "checkmark" / "done" / "complete"

Restaurant için:
├── "restaurant" / "food" / "kitchen" / "chef"
├── "receipt" / "invoice" / "bill"
└── "calculator" / "accounting"
```

### 4.3 Dosya Yapısı

```
assets/
├── animations/
│   ├── welcome.json      # Hoş geldin (~50-100KB)
│   ├── kasa.json         # Para/kasa (~50-100KB)
│   ├── cari.json         # İş birliği (~50-100KB)
│   ├── rapor.json        # Grafik/analiz (~50-100KB)
│   └── success.json      # Tamamlandı (~30-50KB)
│
└── images/
    ├── icon.png
    └── adaptive-icon.png
```

### 4.4 İndirme İpuçları

```
✅ DOĞRU SEÇİM:
├── Dosya boyutu < 100KB
├── Basit, temiz animasyonlar
├── Loop için uygun
├── Beyaz/şeffaf arka plan
└── MIT/ücretsiz lisans

❌ KAÇIN:
├── Çok karmaşık animasyonlar (>200KB)
├── 3D efektler (performans)
├── Çok fazla layer
└── Ticari kısıtlamalı lisanslar
```

---

## 5. UI Test Ekranı

### 5.1 Test Ekranı Oluşturma

Bu ekranı oluşturup tüm modern UI özelliklerini test edin.

```tsx
// app/ui-test.tsx
import { useState } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  StyleSheet, 
  Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import Animated, { 
  FadeInDown, 
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

// ════════════════════════════════════════════
// ENHANCEMENT - Liquid Glass (Opsiyonel)
// ════════════════════════════════════════════
let GlassView: any = null;
let isGlassSupported = false;

try {
  const glass = require('expo-glass-effect');
  GlassView = glass.GlassView;
  isGlassSupported = Platform.OS === 'ios' && parseInt(Platform.Version as string) >= 26;
} catch (e) {
  // expo-glass-effect yüklü değil - sorun yok
}

export default function UITestScreen() {
  const [testResults, setTestResults] = useState<string[]>([]);
  
  const addResult = (result: string) => {
    setTestResults(prev => [...prev, `✅ ${result}`]);
  };

  // Animated button
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        
        {/* ════════════════════════════════════════════ */}
        {/* HEADER */}
        {/* ════════════════════════════════════════════ */}
        <Animated.View entering={FadeInDown.duration(600)}>
          <Text style={styles.title}>🧪 UI Test Ekranı</Text>
          <Text style={styles.subtitle}>Core + Enhancement Test</Text>
        </Animated.View>

        {/* ════════════════════════════════════════════ */}
        {/* PLATFORM INFO */}
        {/* ════════════════════════════════════════════ */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📱 Platform Bilgisi</Text>
          <Text style={styles.info}>OS: {Platform.OS}</Text>
          <Text style={styles.info}>Version: {Platform.Version}</Text>
          <Text style={styles.info}>
            Liquid Glass: {isGlassSupported ? '✅ Destekleniyor' : '❌ Desteklenmiyor (iOS 26 gerekli)'}
          </Text>
        </View>

        {/* ════════════════════════════════════════════ */}
        {/* CORE: REANIMATED TEST */}
        {/* ════════════════════════════════════════════ */}
        <Animated.View 
          entering={FadeInUp.delay(200).duration(600)}
          style={styles.card}
        >
          <Text style={styles.cardTitle}>✨ Core: Reanimated v4</Text>
          <Text style={styles.info}>Entry animasyonu çalıştı ✅</Text>
          
          <Animated.View style={animatedStyle}>
            <Pressable
              style={styles.testButton}
              onPressIn={() => {
                scale.value = withSpring(0.95);
              }}
              onPressOut={() => {
                scale.value = withSpring(1);
                addResult('Reanimated spring çalışıyor');
              }}
            >
              <Text style={styles.buttonText}>Spring Test</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>

        {/* ════════════════════════════════════════════ */}
        {/* CORE: BLUR TEST */}
        {/* ════════════════════════════════════════════ */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🌫️ Core: Blur Effect</Text>
          <View style={styles.blurContainer}>
            <View style={styles.colorfulBg}>
              <Text style={styles.bgText}>Arka Plan</Text>
            </View>
            <BlurView intensity={50} style={styles.blurOverlay}>
              <Text style={styles.blurText}>Blur Overlay</Text>
            </BlurView>
          </View>
          <Pressable 
            style={styles.testButton}
            onPress={() => addResult('BlurView çalışıyor')}
          >
            <Text style={styles.buttonText}>Blur Test</Text>
          </Pressable>
        </View>

        {/* ════════════════════════════════════════════ */}
        {/* ENHANCEMENT: LIQUID GLASS (iOS 26+) */}
        {/* ════════════════════════════════════════════ */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🔮 Enhancement: Liquid Glass</Text>
          
          {isGlassSupported && GlassView ? (
            <>
              <View style={styles.glassContainer}>
                <View style={[styles.colorfulBg, { backgroundColor: '#667eea' }]} />
                <GlassView style={styles.glassOverlay}>
                  <Text style={styles.glassText}>Liquid Glass! ✨</Text>
                </GlassView>
              </View>
              <Pressable 
                style={[styles.testButton, { backgroundColor: '#667eea' }]}
                onPress={() => addResult('Liquid Glass çalışıyor')}
              >
                <Text style={styles.buttonText}>Glass Test</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.notSupported}>
              <Text style={styles.notSupportedText}>
                ⚠️ Liquid Glass bu cihazda desteklenmiyor
              </Text>
              <Text style={styles.notSupportedSubtext}>
                iOS 26+ gerekli. Bu normal - Core layout kullanılacak.
              </Text>
            </View>
          )}
        </View>

        {/* ════════════════════════════════════════════ */}
        {/* LOTTIE PLACEHOLDER */}
        {/* ════════════════════════════════════════════ */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🎬 Core: Lottie</Text>
          <Text style={styles.info}>
            Lottie test için animation dosyası ekleyin:
          </Text>
          <View style={styles.codeBlock}>
            <Text style={styles.code}>assets/animations/test.json</Text>
          </View>
          <Text style={styles.infoSmall}>
            Sonra bu komponenti aktif edin:
          </Text>
          <View style={styles.codeBlock}>
            <Text style={styles.code}>{`<LottieView
  source={require('@/assets/animations/test.json')}
  autoPlay
  loop
  style={{ width: 150, height: 150 }}
/>`}</Text>
          </View>
        </View>

        {/* ════════════════════════════════════════════ */}
        {/* TEST RESULTS */}
        {/* ════════════════════════════════════════════ */}
        {testResults.length > 0 && (
          <View style={styles.resultsCard}>
            <Text style={styles.cardTitle}>📋 Test Sonuçları</Text>
            {testResults.map((result, index) => (
              <Text key={index} style={styles.result}>{result}</Text>
            ))}
          </View>
        )}

        {/* ════════════════════════════════════════════ */}
        {/* SUMMARY */}
        {/* ════════════════════════════════════════════ */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>📊 Mimari Özet</Text>
          <Text style={styles.summaryText}>
            <Text style={styles.bold}>CORE (Her yerde çalışır):</Text>{'\n'}
            • Reanimated v4 ✅{'\n'}
            • BlurView ✅{'\n'}
            • Lottie ✅{'\n'}
            • Solid colors + Shadow ✅{'\n\n'}
            
            <Text style={styles.bold}>ENHANCEMENT (iOS 26+ bonus):</Text>{'\n'}
            • Liquid Glass {isGlassSupported ? '✅' : '❌'}{'\n\n'}
            
            <Text style={styles.bold}>Strateji:</Text>{'\n'}
            Core layout'a güven, Enhancement sadece bonus.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  content: {
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  info: {
    fontSize: 14,
    color: '#aaa',
  },
  infoSmall: {
    fontSize: 12,
    color: '#888',
    marginTop: 8,
  },
  codeBlock: {
    backgroundColor: '#0d0d15',
    padding: 12,
    borderRadius: 8,
  },
  code: {
    fontSize: 11,
    color: '#4ecdc4',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  testButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  blurContainer: {
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  colorfulBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ff6b6b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bgText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  blurOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  blurText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  glassContainer: {
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  glassOverlay: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    bottom: 20,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glassText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  notSupported: {
    backgroundColor: '#2a2a3e',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  notSupportedText: {
    color: '#ffa500',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  notSupportedSubtext: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  resultsCard: {
    backgroundColor: '#1a3a1a',
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  result: {
    fontSize: 14,
    color: '#4ecdc4',
  },
  summaryCard: {
    backgroundColor: '#2a2a4e',
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  summaryText: {
    fontSize: 14,
    color: '#ccc',
    lineHeight: 22,
  },
  bold: {
    fontWeight: '700',
    color: '#fff',
  },
});
```

### 5.2 Test Ekranını Aktif Etme

```tsx
// app/_layout.tsx içine ekle
<Stack.Screen 
  name="ui-test" 
  options={{ 
    headerTitle: 'UI Test',
    presentation: 'modal',
  }} 
/>
```

---

## 6. Karar Matrisi

### 6.1 Test Sonrası Karar

```
┌─────────────────────────────────────────────────────────────────┐
│  MVP SONRASI KARAR                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ✅ MODERN UI KULLAN (Core + Enhancement) eğer:                 │
│  ├── Core animasyonlar 60fps koşuyorsa                          │
│  ├── Lottie dosyaları uygun bulunduysa                          │
│  ├── BlurView iOS'ta güzel görünüyorsa                          │
│  ├── Android fallback kabul edilebilir görünüyorsa              │
│  └── Geliştirme süresi kabul edilebilirse                       │
│                                                                 │
│  ⚠️ SADECE CORE KULLAN (Enhancement olmadan) eğer:              │
│  ├── Liquid Glass API değişkenliği endişe veriyorsa             │
│  ├── iOS 26 test cihazı yoksa                                   │
│  └── Daha basit yaklaşım isteniyorsa                            │
│                                                                 │
│  ❌ STANDART UI'A DÖN eğer:                                     │
│  ├── Performans sorunları varsa                                 │
│  ├── Development build çok karmaşıksa                           │
│  ├── Uygun Lottie animasyonları bulunamadıysa                   │
│  └── Zaman kısıtlaması çok sıkıysa                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Standart UI Alternatifi

Beğenmezsen bu basit ama şık alternatif:

```tsx
// Standart Kart (animasyonsuz)
const SimpleCard = ({ children, style }: any) => (
  <View style={[{
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  }, style]}>
    {children}
  </View>
);

// Standart Buton (animasyonsuz)
const SimpleButton = ({ title, onPress }: any) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => ({
      backgroundColor: pressed ? '#0056b3' : '#007AFF',
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderRadius: 10,
      alignItems: 'center',
    })}
  >
    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>
      {title}
    </Text>
  </Pressable>
);

// Standart Onboarding
// Sadece statik resimler + FlatList pagination
// Lottie yerine PNG/SVG kullan
```

---

## 7. Sorun Giderme

### 7.1 Sık Karşılaşılan Hatalar

| Hata | Çözüm |
|------|-------|
| `react-native-worklets not installed` | `npx expo install react-native-worklets` |
| Reanimated plugin duplicate | babel.config.js'de tek plugin bırak |
| Blur çalışmıyor | `expo-blur` kurulu mu kontrol et |
| Icons square görünüyor | Asset boyutları square olmalı |
| Metro bundler cache | `npx expo start -c` ile temizle |

### 7.2 Performans İpuçları

```
✅ YAPIN:
├── Lottie dosyalarını küçük tutun (<100KB)
├── Animasyonları useNativeDriver ile çalıştırın
├── Liste itemlarında animasyon kullanmayın
├── Gereksiz re-render'ları önleyin (memo)
└── Production build'de test edin

❌ YAPMAYIN:
├── Her komponente animasyon eklemeyin
├── Çok karmaşık Lottie kullanmayın
├── Nested blur/glass kullanmayın
├── Layout animasyonunu aşırı kullanmayın
└── Debug modda performans ölçmeyin
```

### 7.3 Test Checklist

```
□ Node.js 20+ kurulu
□ expo@^54 yüklü
□ npx expo-doctor temiz
□ Reanimated çalışıyor (entry animations)
□ BlurView iOS'ta görünüyor
□ Android'de shadow/elevation görünüyor
□ Lottie animasyon çalışıyor
□ Enhancement test edildi (iOS 26 varsa)
□ Gerçek cihazda test edildi
□ Production build test edildi
```

---

## Önemli Notlar

### ⚠️ Dikkat Edilecekler

1. **Expo Go vs Development Build**
   ```
   Expo Go'da çalışır:
   ├── Reanimated ✅
   ├── Lottie ✅
   ├── BlurView ✅
   └── AsyncStorage ✅
   
   Development Build gerektirir:
   └── expo-glass-effect (Liquid Glass)
   ```

2. **iOS 26 Henüz Yaygın Değil**
   - Liquid Glass'ı "bonus" olarak düşün
   - Asıl odak: Core layout (Blur + Solid)

3. **Lottie Dosya Boyutu**
   - Küçük animasyonlar seç (<100KB)
   - Çok karmaşık animasyonlardan kaçın

4. **Test Cihazları**
   - Gerçek cihazda test et
   - Düşük-orta seviye Android'de kontrol et

---

## Changelog

| Tarih | Versiyon | Değişiklik |
|-------|----------|------------|
| 18.12.2024 | 1.0 | İlk versiyon |
| 18.12.2024 | 1.1 | Core vs Enhancement mimarisi |
