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
import { Mail, ArrowLeft } from 'lucide-react-native';
import { Text, Input, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { supabase } from '@/lib/supabase';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const validate = () => {
    if (!email) {
      setError('E-posta gerekli');
      return false;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Gecerli bir e-posta girin');
      return false;
    }
    setError('');
    return true;
  };

  const handleResetPassword = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'isletmetakip://reset-password',
      });

      if (error) throw error;

      setSent(true);
    } catch (err: any) {
      Alert.alert('Hata', err.message || 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.sentContainer}>
          <Text variant="h2" center style={styles.sentTitle}>
            E-posta Gönderildi
          </Text>
          <Text variant="body" color="secondary" center style={styles.sentText}>
            Şifre sıfırlama bağlantısı {email} adresine gönderildi. Lütfen e-postanızı kontrol edin.
          </Text>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onPress={() => router.back()}
            style={styles.backButton}
          >
            Giriş Sayfasına Dön
          </Button>
        </View>
      </SafeAreaView>
    );
  }

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
          {/* Geri Butonu */}
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backArrow}
          >
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>

          {/* Başlık */}
          <View style={styles.header}>
            <Text variant="h1" style={styles.title}>
              Şifremi Unuttum
            </Text>
            <Text variant="body" color="secondary" center>
              E-posta adresinizi girin, size şifre sıfırlama bağlantısı gönderelim.
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Input
              label="E-posta"
              placeholder="ornek@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
              error={error}
              leftIcon={<Mail size={20} color={colors.textMuted} />}
            />

            <Button
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
              onPress={handleResetPassword}
              style={styles.submitButton}
            >
              Sıfırlama Bağlantısı Gönder
            </Button>
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
    padding: spacing.xl,
  },
  backArrow: {
    marginBottom: spacing.lg,
  },
  header: {
    marginBottom: spacing.xl,
  },
  title: {
    marginBottom: spacing.sm,
  },
  form: {
    marginBottom: spacing.xl,
  },
  submitButton: {
    marginTop: spacing.lg,
  },
  sentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  sentTitle: {
    marginBottom: spacing.md,
  },
  sentText: {
    marginBottom: spacing.xl,
  },
  backButton: {
    marginTop: spacing.lg,
  },
});
