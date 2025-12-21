import { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Mail, Lock, Building2 } from 'lucide-react-native';
import { Text, Input, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { useAuthContext } from '@/contexts/AuthContext';

export default function RegisterPage() {
  const router = useRouter();
  const { signUp, loading } = useAuthContext();

  const [isletmeName, setIsletmeName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [errors, setErrors] = useState<{
    isletmeName?: string;
    email?: string;
    password?: string;
    passwordConfirm?: string;
  }>({});

  const validate = () => {
    const newErrors: typeof errors = {};

    if (!isletmeName) {
      newErrors.isletmeName = 'İşletme adı gerekli';
    } else if (isletmeName.length < 2) {
      newErrors.isletmeName = 'İşletme adı en az 2 karakter olmalı';
    }

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

    if (!passwordConfirm) {
      newErrors.passwordConfirm = 'Şifre tekrarı gerekli';
    } else if (password !== passwordConfirm) {
      newErrors.passwordConfirm = 'Şifreler eşleşmiyor';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;

    try {
      await signUp(email, password, isletmeName);
      // Auth context router'ı yönlendirecek
    } catch (error: any) {
      Alert.alert(
        'Kayıt Hatası',
        error.message === 'User already registered'
          ? 'Bu e-posta zaten kayıtlı'
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
              Yeni hesap oluşturun
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Input
              label="İşletme Adı"
              placeholder="Örn: Cafe Merhaba"
              autoCapitalize="words"
              value={isletmeName}
              onChangeText={setIsletmeName}
              error={errors.isletmeName}
              leftIcon={<Building2 size={20} color={colors.textMuted} />}
            />

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
              placeholder="En az 6 karakter"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              error={errors.password}
              leftIcon={<Lock size={20} color={colors.textMuted} />}
            />

            <Input
              label="Şifre Tekrar"
              placeholder="Şifrenizi tekrar girin"
              secureTextEntry
              value={passwordConfirm}
              onChangeText={setPasswordConfirm}
              error={errors.passwordConfirm}
              leftIcon={<Lock size={20} color={colors.textMuted} />}
            />

            <Button
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
              onPress={handleRegister}
              style={styles.registerButton}
            >
              Kayıt Ol
            </Button>
          </View>

          {/* Giriş Yap */}
          <View style={styles.footer}>
            <Text variant="body" color="secondary">
              Zaten hesabınız var mı?{' '}
            </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
              <Text variant="body" style={{ color: colors.primary }}>
                Giriş Yap
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
    marginBottom: spacing['3xl'],
  },
  logo: {
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  form: {
    marginBottom: spacing.xl,
  },
  registerButton: {
    marginTop: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
