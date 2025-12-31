import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Mail, Lock } from 'lucide-react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import { Text, Input, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { useAuthContext } from '@/contexts/AuthContext';

// Google OAuth Client ID'leri - Supabase dashboard'dan alınacak
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';

export default function LoginPage() {
  const router = useRouter();
  const { signIn, signInWithApple, signInWithGoogle, isAppleSignInAvailable, loading } = useAuthContext();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [socialLoading, setSocialLoading] = useState<'apple' | 'google' | null>(null);

  // Google Auth Request
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
    webClientId: GOOGLE_WEB_CLIENT_ID,
  });

  // Response'un sadece bir kez işlenmesini sağla
  const lastProcessedResponse = useRef<string | null>(null);

  // Google auth response handler
  useEffect(() => {
    if (!response) return;

    // Aynı response'u tekrar işleme
    const responseKey = response.type + (response.type === 'success' ? response.params?.id_token : '');
    if (lastProcessedResponse.current === responseKey) return;
    lastProcessedResponse.current = responseKey;

    if (response.type === 'success') {
      const { id_token } = response.params;
      if (id_token) {
        (async () => {
          try {
            await signInWithGoogle(id_token);
          } catch (error: any) {
            Alert.alert('Hata', error.message || 'Google ile giriş başarısız oldu');
          } finally {
            setSocialLoading(null);
          }
        })();
      }
    } else if (response.type === 'error') {
      setSocialLoading(null);
      Alert.alert('Hata', 'Google ile giriş başarısız oldu');
    }
  }, [response, signInWithGoogle]);

  const handleAppleSignIn = async () => {
    try {
      setSocialLoading('apple');
      await signInWithApple();
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Apple ile giriş başarısız oldu');
    } finally {
      setSocialLoading(null);
    }
  };

  const handleGooglePress = async () => {
    setSocialLoading('google');
    await promptAsync();
  };

  const validate = () => {
    const newErrors: { email?: string; password?: string } = {};

    if (!email) {
      newErrors.email = 'E-posta gerekli';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Geçerli bir e-posta girin';
    }

    if (!password) {
      newErrors.password = 'Şifre gerekli';
    } else if (password.length < 6) {
      newErrors.password = 'Şifre en az 6 karakter olmalı';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;

    try {
      await signIn(email, password);
      // Auth context router'ı yönlendirecek
    } catch (error: any) {
      Alert.alert(
        'Giriş Hatası',
        error.message === 'Invalid login credentials'
          ? 'E-posta veya şifre hatalı'
          : error.message || 'Bir hata oluştu'
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo / Başlık */}
          <View style={styles.header}>
            <Text variant="h1" style={styles.logo}>
              İşletme Takip
            </Text>
            <Text variant="body" color="secondary" center>
              İşletmenizi kolayca yönetin
            </Text>
          </View>

          {/* Social Login Buttons */}
          <View style={styles.socialButtons}>
            {/* Apple Sign-In - Sadece iOS'ta göster */}
            {isAppleSignInAvailable && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={12}
                style={styles.appleButton}
                onPress={handleAppleSignIn}
              />
            )}

            {/* Google Sign-In */}
            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGooglePress}
              disabled={socialLoading === 'google' || !request}
            >
              {socialLoading === 'google' ? (
                <ActivityIndicator color="#757575" />
              ) : (
                <>
                  <View style={styles.googleIconContainer}>
                    <Text style={styles.googleIcon}>G</Text>
                  </View>
                  <Text style={styles.googleButtonText}>Google ile Giriş Yap</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>veya</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Email/Password Form */}
          <View style={styles.form}>
            <Input
              label="E-posta"
              placeholder="ornek@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
              error={errors.email}
              leftIcon={<Mail size={20} color={colors.textMuted} />}
            />

            <Input
              label="Şifre"
              placeholder="Şifrenizi girin"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              error={errors.password}
              leftIcon={<Lock size={20} color={colors.textMuted} />}
            />

            <Button
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
              onPress={handleLogin}
              style={styles.loginButton}
            >
              Giriş Yap
            </Button>
          </View>

          {/* Kayıt Ol */}
          <View style={styles.footer}>
            <Text variant="body" color="secondary">
              Hesabınız yok mu?{' '}
            </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
              <Text variant="body" style={{ color: colors.primary }}>
                Kayıt Ol
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logo: {
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  socialButtons: {
    marginBottom: spacing.lg,
  },
  appleButton: {
    width: '100%',
    height: 50,
    marginBottom: spacing.sm,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DADCE0',
    borderRadius: 12,
    height: 50,
    paddingHorizontal: spacing.lg,
  },
  googleIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4285F4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  googleIcon: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  googleButtonText: {
    color: '#757575',
    fontSize: 16,
    fontWeight: '500',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    color: colors.textMuted,
    paddingHorizontal: spacing.md,
    fontSize: 14,
  },
  form: {
    marginBottom: spacing.xl,
  },
  loginButton: {
    marginTop: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
