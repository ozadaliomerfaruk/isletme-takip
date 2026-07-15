import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { AlertTriangle } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { logEvent } from '@/lib/appEvents';
import i18n from '@/i18n';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Uygulama genelinde render-time hatalarını yakalayan güvenlik ağı.
 *
 * Bir ekran render sırasında beklenmedik şekilde patlarsa (ör. bozuk cache'ten
 * gelen veri, tanımsız alan erişimi), tüm uygulamanın boş/donuk ekrana gitmesi
 * yerine kullanıcıya kurtarma seçeneği sunar ve hatayı telemetriye kaydeder.
 *
 * NOT: Fallback bilinçli olarak context'e (i18n hook, tema provider) bağımlı
 * DEĞİL — i18n modülü ve colors sabiti doğrudan kullanılır; böylece provider
 * seviyesinde bir hata olsa bile fallback güvenle çizilir.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Hatayı kaydet (loglama bile patlarsa yut — fallback her zaman gösterilmeli).
    try {
      logEvent('app_error', {
        message: String(error?.message ?? error).slice(0, 500),
        stack: String(error?.stack ?? '').slice(0, 1500),
        component_stack: String(info?.componentStack ?? '').slice(0, 1500),
      });
    } catch {
      // yut
    }
  }

  handleReset = () => {
    this.setState({ hasError: false });
    // Bilinen-iyi bir ekrana dön (aynı ekran tekrar patlarsa döngüye girmesin diye
    // kullanıcıyı ana sayfaya taşı). Navigasyon da patlarsa sessiz geç; state reset yeter.
    try {
      router.replace('/(tabs)');
    } catch {
      // yut
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <AlertTriangle size={40} color={colors.error} />
        </View>
        <Text style={styles.title}>{i18n.t('common:errorBoundary.title')}</Text>
        <Text style={styles.message}>{i18n.t('common:errorBoundary.message')}</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={this.handleReset}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{i18n.t('common:errorBoundary.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.errorLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  message: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
});
