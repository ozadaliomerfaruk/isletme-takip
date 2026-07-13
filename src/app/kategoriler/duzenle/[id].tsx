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
import { useTranslation } from 'react-i18next';
import { TrendingUp, TrendingDown, Package } from 'lucide-react-native';
import { Text, Input, Button, IconPicker, ColorPicker, ParentCategoryPicker, CategoryPicker } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { DEFAULT_CATEGORY_ICON, DEFAULT_CATEGORY_COLOR } from '@/constants/categoryIcons';
import { useKategoriler, useUpdateKategori } from '@/hooks/useKategoriler';
import { KategoriType } from '@/types/database';
import { toErrorMessage } from '@/lib/errors';
import { upperTr } from '@/lib/turkishTextUtils';
import { useSaveSuccessFeedback } from '@/hooks/useSaveSuccessFeedback';
import { usePagePermission } from '@/hooks/usePagePermission';

export default function KategoriDuzenlePage() {
  const router = useRouter();
  const notifySaved = useSaveSuccessFeedback();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation(['categories', 'common', 'errors']);
  const { data: kategoriler } = useKategoriler();
  const updateKategori = useUpdateKategori();

  const kategori = kategoriler?.find((k) => k.id === id);
  usePagePermission({ module: 'kategoriler', action: 'update', createdBy: kategori?.created_by });

  const [name, setName] = useState('');
  const [type, setType] = useState<KategoriType>('gelir');
  const [icon, setIcon] = useState<string>(DEFAULT_CATEGORY_ICON);
  const [color, setColor] = useState<string>(DEFAULT_CATEGORY_COLOR);
  const [parentId, setParentId] = useState<string | null>(null);
  const [mappedGelirKategoriId, setMappedGelirKategoriId] = useState<string | null>(null);
  const [mappedGiderKategoriId, setMappedGiderKategoriId] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ name?: string }>({});

  useEffect(() => {
    if (kategori) {
      setName(kategori.name);
      setType(kategori.type);
      setIcon(kategori.icon || DEFAULT_CATEGORY_ICON);
      setColor(kategori.color || DEFAULT_CATEGORY_COLOR);
      setParentId(kategori.parent_id);
      setMappedGelirKategoriId(kategori.mapped_gelir_kategori_id);
      setMappedGiderKategoriId(kategori.mapped_gider_kategori_id);
    }
  }, [kategori]);

  const validate = () => {
    const newErrors: { name?: string } = {};

    if (!name.trim()) {
      newErrors.name = t('categories:validation.nameRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !id) return;

    try {
      // Güncellemede işlem kategorisi (gelir/gider) BÜYÜK harf kaydedilir (kullanıcı
      // isteği); kullanıcı bir kategoriyi düzenlerse büyük harfe döner. Ürün hariç.
      await updateKategori.mutateAsync({
        id,
        name: type === 'urun' ? name.trim() : upperTr(name.trim()),
        type,
        icon,
        color,
        parent_id: parentId,
        mapped_gelir_kategori_id: type === 'urun' ? mappedGelirKategoriId : null,
        mapped_gider_kategori_id: type === 'urun' ? mappedGiderKategoriId : null,
      });

      notifySaved(t('categories:messages.updateSuccess'));
      router.back();
    } catch (error) {
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('errors:category.updateFailed'));
    }
  };

  // Tip değiştiğinde parent_id ve eşlemeleri sıfırla
  const handleTypeChange = (newType: KategoriType) => {
    setType(newType);
    setParentId(null);
    setMappedGelirKategoriId(null);
    setMappedGiderKategoriId(null);
  };

  if (!kategori) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <Text>{t('common:status.loading')}</Text>
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
            {/* Tip Seçimi */}
            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                {t('categories:form.categoryType')}
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
                    {t('categories:types.gelir')}
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
                    {t('categories:types.gider')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.typeCard,
                    type === 'urun' && styles.typeCardSelected,
                    type === 'urun' && { borderColor: colors.primary },
                  ]}
                  onPress={() => handleTypeChange('urun')}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.typeIcon,
                      { backgroundColor: colors.primaryLight + '30' },
                    ]}
                  >
                    <Package size={24} color={colors.primary} />
                  </View>
                  <Text
                    variant="body"
                    style={type === 'urun' && { color: colors.primary }}
                  >
                    {t('categories:types.urun')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Kategori Adı */}
            <View style={styles.section}>
              <Input
                label={t('categories:form.categoryName')}
                placeholder={type === 'urun' ? t('categories:form.categoryNamePlaceholderProduct') : t('categories:form.categoryNamePlaceholder')}
                value={name}
                onChangeText={setName}
                error={errors.name}
              />
            </View>

            {/* İkon ve Üst Kategori */}
            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                {t('categories:form.iconAndParent')}
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
                    excludeId={id}
                  />
                </View>
              </View>
            </View>

            {/* Renk Seçimi */}
            <View style={styles.section}>
              <ColorPicker
                label={t('categories:form.color')}
                value={color}
                onChange={setColor}
              />
            </View>

            {/* Ürün Kategorisi Eşleme */}
            {type === 'urun' && (
              <View style={styles.section}>
                <Text variant="label" style={styles.sectionTitle}>
                  {t('categories:form.categoryMapping')}
                </Text>
                <Text variant="caption" color="secondary" style={styles.mappingDescription}>
                  {t('categories:form.mappingDescription')}
                </Text>
                <View style={styles.mappingPickers}>
                  <CategoryPicker
                    value={mappedGiderKategoriId}
                    onChange={setMappedGiderKategoriId}
                    type="gider"
                    label={t('categories:form.mapToExpenseCategory')}
                    optional
                  />
                  <CategoryPicker
                    value={mappedGelirKategoriId}
                    onChange={setMappedGelirKategoriId}
                    type="gelir"
                    label={t('categories:form.mapToIncomeCategory')}
                    optional
                  />
                </View>
              </View>
            )}

            {/* Buttons */}
            <View style={styles.buttons}>
              <Button
                variant="outline"
                size="lg"
                onPress={() => router.back()}
                style={styles.button}
              >
                {t('common:buttons.cancel')}
              </Button>
              <Button
                variant="primary"
                size="lg"
                loading={updateKategori.isPending}
                onPress={handleSubmit}
                style={styles.button}
              >
                {t('common:buttons.update')}
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
  pickerRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  pickerItem: {
    flex: 1,
  },
  mappingDescription: {
    marginBottom: spacing.md,
  },
  mappingPickers: {
    gap: spacing.md,
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
