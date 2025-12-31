import { useState } from 'react';
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
import { useRouter } from 'expo-router';
import { TrendingUp, TrendingDown } from 'lucide-react-native';
import { Text, Input, Button, Card, IconPicker, ColorPicker, ParentCategoryPicker } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { DEFAULT_CATEGORY_ICON, DEFAULT_CATEGORY_COLOR } from '@/constants/categoryIcons';
import { useCreateKategori } from '@/hooks/useKategoriler';
import { KategoriType } from '@/types/database';

export default function KategoriEklePage() {
  const router = useRouter();
  const createKategori = useCreateKategori();

  const [name, setName] = useState('');
  const [type, setType] = useState<KategoriType>('gelir');
  const [icon, setIcon] = useState<string>(DEFAULT_CATEGORY_ICON);
  const [color, setColor] = useState<string>(DEFAULT_CATEGORY_COLOR);
  const [parentId, setParentId] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ name?: string }>({});

  const validate = () => {
    const newErrors: { name?: string } = {};

    if (!name.trim()) {
      newErrors.name = 'Kategori adi gerekli';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      await createKategori.mutateAsync({
        name: name.trim(),
        type,
        icon,
        color,
        parent_id: parentId,
      });

      Alert.alert('Basarili', 'Kategori eklendi', [
        { text: 'Tamam', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Kategori eklenemedi');
    }
  };

  // Tip değiştiğinde parent_id'yi sıfırla (farklı tipteki kategoriye alt kategori eklenemez)
  const handleTypeChange = (newType: KategoriType) => {
    setType(newType);
    setParentId(null);
  };

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
                  onPress={() => handleTypeChange('gelir')}
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
                  onPress={() => handleTypeChange('gider')}
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

            {/* İkon ve Üst Kategori */}
            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                İkon ve Üst Kategori
              </Text>
              <View style={styles.pickerRow}>
                <View style={styles.pickerItem}>
                  <IconPicker
                    value={icon}
                    onChange={setIcon}
                    color={color}
                  />
                </View>
                <View style={styles.pickerItem}>
                  <ParentCategoryPicker
                    value={parentId}
                    onChange={setParentId}
                    type={type}
                  />
                </View>
              </View>
            </View>

            {/* Renk Seçimi */}
            <View style={styles.section}>
              <ColorPicker
                label="Renk"
                value={color}
                onChange={setColor}
              />
            </View>

            {/* Ornek Kategoriler */}
            <View style={styles.section}>
              <Text variant="label" color="secondary" style={styles.sectionTitle}>
                Ornek Kategoriler
              </Text>
              <Card>
                <View style={styles.examplesGrid}>
                  {(type === 'gelir'
                    ? ['Satis', 'Hizmet', 'Faiz', 'Kira Geliri', 'Diger Gelir']
                    : ['Kira', 'Maas', 'Fatura', 'Malzeme', 'Ulasim', 'Yemek', 'Reklam', 'Diger Gider']
                  ).map((example) => (
                    <TouchableOpacity
                      key={example}
                      style={styles.exampleChip}
                      onPress={() => setName(example)}
                    >
                      <Text variant="caption" color="primary">
                        {example}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Card>
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
                loading={createKategori.isPending}
                onPress={handleSubmit}
                style={styles.button}
              >
                Ekle
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
  pickerRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  pickerItem: {
    flex: 1,
  },
  examplesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  exampleChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primaryLight + '30',
    borderRadius: borderRadius.full,
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
