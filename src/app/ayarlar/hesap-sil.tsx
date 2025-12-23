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
      Alert.alert('Hata', 'Lutfen isletme adini dogru yazip tekrar deneyin.');
      return;
    }

    Alert.alert(
      'Hesap Silme Talebi',
      'Hesabiniz 7 gun icinde silinecektir. Bu sure icinde giris yaparak silme islemini iptal edebilirsiniz.\n\nDevam etmek istiyor musunuz?',
      [
        { text: 'Vazgec', style: 'cancel' },
        {
          text: 'Evet, Silme Talebi Olustur',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await deleteAccount();
              Alert.alert(
                'Talep Olusturuldu',
                'Hesabiniz 7 gun icinde silinecektir. Bu sure icinde giris yaparak iptal edebilirsiniz.'
              );
            } catch (error) {
              console.error('Delete account error:', error);
              setIsDeleting(false);
              Alert.alert('Hata', 'Hesap silme talebi olusturulurken bir hata olustu. Lutfen tekrar deneyin.');
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
            Hesabi Sil
          </Text>

          <Text variant="body" color="secondary" style={styles.description}>
            Hesabinizi silmek istediginizde 7 gunluk bekleme suresi baslar. Bu sure icinde giris yaparak vazgecebilirsiniz. 7 gun sonunda asagidaki tum verileriniz kalici olarak silinecektir:
          </Text>

          <Card style={styles.warningCard}>
            <View style={styles.warningItem}>
              <Text variant="body" color="error">• Tum islemleriniz (gelir, gider, transfer)</Text>
            </View>
            <View style={styles.warningItem}>
              <Text variant="body" color="error">• Tum hesaplariniz ve bakiyeler</Text>
            </View>
            <View style={styles.warningItem}>
              <Text variant="body" color="error">• Tum cari hesaplariniz</Text>
            </View>
            <View style={styles.warningItem}>
              <Text variant="body" color="error">• Tum personel kayitlariniz</Text>
            </View>
            <View style={styles.warningItem}>
              <Text variant="body" color="error">• Tum kategorileriniz</Text>
            </View>
            <View style={styles.warningItem}>
              <Text variant="body" color="error">• Isletme bilgileriniz</Text>
            </View>
          </Card>

          <Text variant="body" color="secondary" style={styles.confirmLabel}>
            Onaylamak icin isletme adinizi yazin:
          </Text>

          <Text variant="h3" color="primary" style={styles.isletmeAdi}>
            "{isletmeAdi}"
          </Text>

          <Input
            placeholder="Isletme adini yazin"
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
              Vazgec
            </Button>

            <Button
              variant="primary"
              onPress={handleDelete}
              disabled={!isConfirmValid || isDeleting}
              loading={isDeleting}
              style={[styles.deleteButton, { backgroundColor: isConfirmValid ? colors.error : colors.textMuted }]}
              icon={<Trash2 size={18} color={colors.surface} />}
            >
              Hesabi Sil
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
