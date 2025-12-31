import { useState } from 'react';
import { View, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Trash2, AlertTriangle, Clock } from 'lucide-react-native';
import { Text, Button, Input, Card } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { useAuthContext } from '@/contexts/AuthContext';

export default function HesapSilPage() {
  const router = useRouter();
  const { isletme, deleteAccount, loading } = useAuthContext();
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const isletmeAdi = isletme?.name || '';
  const isConfirmValid = confirmText.trim().toLowerCase() === isletmeAdi.trim().toLowerCase();

  const handleDelete = async () => {
    if (!isConfirmValid) {
      Alert.alert('Hata', 'Lütfen işletme adını doğru yazıp tekrar deneyin.');
      return;
    }

    Alert.alert(
      'Hesap Silme Talebi',
      'Hesabınız 7 gün içinde silinecektir. Bu süre içinde giriş yaparak silme işlemini iptal edebilirsiniz.\n\nDevam etmek istiyor musunuz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, Silme Talebi Oluştur',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await deleteAccount();
              Alert.alert(
                'Talep Oluşturuldu',
                'Hesabınız 7 gün içinde silinecektir. Bu süre içinde giriş yaparak iptal edebilirsiniz.'
              );
            } catch (error) {
              console.error('Delete account error:', error);
              setIsDeleting(false);
              Alert.alert('Hata', 'Hesap silme talebi oluşturulurken bir hata oluştu. Lütfen tekrar deneyin.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <AlertTriangle size={64} color={colors.error} />
          </View>

          <Text variant="h2" style={styles.title}>
            Hesabı Sil
          </Text>

          <Text variant="body" color="secondary" style={styles.description}>
            Hesabınızı silmek istediğinizde 7 günlük bekleme süresi başlar. Bu süre içinde giriş yaparak vazgeçebilirsiniz. 7 gün sonunda aşağıdaki tüm verileriniz kalıcı olarak silinecektir:
          </Text>

          <Card style={styles.warningCard}>
            <View style={styles.warningItem}>
              <Text variant="body" color="error">• Tüm işlemleriniz (gelir, gider, transfer)</Text>
            </View>
            <View style={styles.warningItem}>
              <Text variant="body" color="error">• Tüm hesaplarınız ve bakiyeler</Text>
            </View>
            <View style={styles.warningItem}>
              <Text variant="body" color="error">• Tüm cari hesaplarınız</Text>
            </View>
            <View style={styles.warningItem}>
              <Text variant="body" color="error">• Tüm personel kayıtlarınız</Text>
            </View>
            <View style={styles.warningItem}>
              <Text variant="body" color="error">• Tüm kategorileriniz</Text>
            </View>
            <View style={styles.warningItem}>
              <Text variant="body" color="error">• İşletme bilgileriniz</Text>
            </View>
          </Card>

          <Text variant="body" color="secondary" style={styles.confirmLabel}>
            Onaylamak için işletme adınızı yazın:
          </Text>

          <Text variant="h3" color="primary" style={styles.isletmeAdi}>
            "{isletmeAdi}"
          </Text>

          <Input
            placeholder="İşletme adını yazın"
            value={confirmText}
            onChangeText={setConfirmText}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.buttonContainer}>
            <Button
              variant="outline"
              onPress={() => router.back()}
              style={styles.cancelButton}
              disabled={isDeleting}
            >
              Vazgeç
            </Button>

            <Button
              variant="primary"
              onPress={handleDelete}
              disabled={!isConfirmValid || isDeleting}
              loading={isDeleting}
              style={[styles.deleteButton, { backgroundColor: isConfirmValid ? colors.error : colors.textMuted }]}
              icon={<Trash2 size={18} color={colors.surface} />}
            >
              Hesabı Sil
            </Button>
          </View>
        </View>
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
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  description: {
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  warningCard: {
    backgroundColor: colors.errorLight,
    marginBottom: spacing.xl,
  },
  warningItem: {
    marginBottom: spacing.xs,
  },
  confirmLabel: {
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  isletmeAdi: {
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  cancelButton: {
    flex: 1,
  },
  deleteButton: {
    flex: 1,
  },
});
