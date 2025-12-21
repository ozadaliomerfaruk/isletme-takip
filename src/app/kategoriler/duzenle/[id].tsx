import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { TrendingUp, TrendingDown } from 'lucide-react-native';
import { Text, Input, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useKategoriler, useUpdateKategori } from '@/hooks/useKategoriler';
import { KategoriType } from '@/types/database';

export default function KategoriDuzenlePage() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: kategoriler } = useKategoriler();
  const updateKategori = useUpdateKategori();

  const kategori = kategoriler?.find((k) => k.id === id);

  const [name, setName] = useState('');
  const [type, setType] = useState<KategoriType>('gelir');
  const [errors, setErrors] = useState<{ name?: string }>({});

  useEffect(() => {
    if (kategori) {
      setName(kategori.name);
      setType(kategori.type);
    }
  }, [kategori]);

  const validate = () => {
    const newErrors: { name?: string } = {};

    if (!name.trim()) {
      newErrors.name = 'Kategori adi gerekli';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !id) return;

    try {
      await updateKategori.mutateAsync({
        id,
        name: name.trim(),
        type,
      });

      Alert.alert('Basarili', 'Kategori guncellendi', [
        { text: 'Tamam', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Kategori guncellenemedi');
    }
  };

  if (!kategori) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <Text>Yukleniyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Tip Secimi */}
            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                Kategori Tipi
              </Text>
              <View style={styles.typeGrid}>
                <TouchableOpacity
                  style={[
                    styles.typeCard,
                    type === 'gelir' && styles.typeCardSelected,
                    type === 'gelir' && { borderColor: colors.success },
                  ]}
                  onPress={() => setType('gelir')}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.typeIcon,
                      { backgroundColor: colors.successLight },
                    ]}
                  >
                    <TrendingUp size={24} color={colors.success} />
                  </View>
                  <Text
                    variant="body"
                    style={type === 'gelir' && { color: colors.success }}
                  >
                    Gelir
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.typeCard,
                    type === 'gider' && styles.typeCardSelected,
                    type === 'gider' && { borderColor: colors.error },
                  ]}
                  onPress={() => setType('gider')}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.typeIcon,
                      { backgroundColor: colors.errorLight },
                    ]}
                  >
                    <TrendingDown size={24} color={colors.error} />
                  </View>
                  <Text
                    variant="body"
                    style={type === 'gider' && { color: colors.error }}
                  >
                    Gider
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Kategori Adi */}
            <View style={styles.section}>
              <Input
                label="Kategori Adi"
                placeholder="Orn: Yemek, Ulasim, Kira..."
                value={name}
                onChangeText={setName}
                error={errors.name}
              />
            </View>

            {/* Buttons */}
            <View style={styles.buttons}>
              <Button
                variant="outline"
                size="lg"
                onPress={() => router.back()}
                style={styles.button}
              >
                Iptal
              </Button>
              <Button
                variant="primary"
                size="lg"
                loading={updateKategori.isPending}
                onPress={handleSubmit}
                style={styles.button}
              >
                Guncelle
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    marginBottom: spacing.md,
  },
  typeGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  typeCard: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  typeCardSelected: {
    borderWidth: 2,
  },
  typeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttons: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  button: {
    flex: 1,
  },
});
