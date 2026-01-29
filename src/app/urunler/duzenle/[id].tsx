import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { Text, Input, Button, CategoryPicker } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useUrun, useUpdateUrun } from '@/hooks/useUrunler';
import { BirimType, Currency } from '@/types/database';

const BIRIMLER: BirimType[] = ['adet', 'kg', 'lt', 'm', 'm2', 'paket', 'kutu'];

export default function UrunDuzenlePage() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation(['products', 'common', 'errors', 'navigation', 'transactions']);
  const { data: urun, isLoading } = useUrun(id);
  const updateUrun = useUpdateUrun();

  const [ad, setAd] = useState('');
  const [kod, setKod] = useState('');
  const [birim, setBirim] = useState<BirimType>('adet');
  const [alisFiyati, setAlisFiyati] = useState('');
  const [satisFiyati, setSatisFiyati] = useState('');
  const [kategoriId, setKategoriId] = useState<string | null>(null);
  const [aciklama, setAciklama] = useState('');
  const [errors, setErrors] = useState<{ ad?: string }>({});

  // Load existing data when urun loads
  useEffect(() => {
    if (urun) {
      setAd(urun.ad);
      setKod(urun.kod || '');
      setBirim(urun.birim);
      setAlisFiyati(urun.alis_fiyati > 0 ? urun.alis_fiyati.toString() : '');
      setSatisFiyati(urun.satis_fiyati > 0 ? urun.satis_fiyati.toString() : '');
      setKategoriId(urun.kategori_id || null);
      setAciklama(urun.aciklama || '');
    }
  }, [urun]);

  const validate = () => {
    const newErrors: { ad?: string } = {};

    if (!ad.trim()) {
      newErrors.ad = t('products:validation.nameRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !id) return;

    try {
      await updateUrun.mutateAsync({
        id,
        ad: ad.trim(),
        kod: kod.trim() || null,
        birim,
        alis_fiyati: alisFiyati ? parseFloat(alisFiyati.replace(',', '.')) : 0,
        satis_fiyati: satisFiyati ? parseFloat(satisFiyati.replace(',', '.')) : 0,
        kategori_id: kategoriId,
        aciklama: aciklama.trim() || null,
      });

      Alert.alert(t('common:status.success'), t('products:messages.updateSuccess'), [
        { text: t('common:buttons.ok'), onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert(t('common:status.error'), error.message || t('errors:general.tryAgain'));
    }
  };

  if (isLoading) {
    return (
      <>
        <Stack.Screen
          options={{
            title: t('products:editProduct'),
            headerBackTitle: t('navigation:back.back'),
          }}
        />
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        </SafeAreaView>
      </>
    );
  }

  if (!urun) {
    return (
      <>
        <Stack.Screen
          options={{
            title: t('products:editProduct'),
            headerBackTitle: t('navigation:back.back'),
          }}
        />
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <View style={styles.loadingContainer}>
            <Text color="secondary">{t('errors:general.notFound')}</Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: t('products:editProduct'),
          headerBackTitle: t('navigation:back.back'),
        }}
      />
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
            {/* Urun Adi */}
            <View style={styles.section}>
              <Input
                label={t('products:form.name')}
                placeholder={t('products:form.name')}
                value={ad}
                onChangeText={setAd}
                error={errors.ad}
              />
            </View>

            {/* Urun Kodu */}
            <View style={styles.section}>
              <Input
                label={t('products:form.code')}
                placeholder={t('products:form.code')}
                value={kod}
                onChangeText={setKod}
              />
            </View>

            {/* Birim Secimi */}
            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                {t('products:form.unit')}
              </Text>
              <View style={styles.birimGrid}>
                {BIRIMLER.map((b) => (
                  <TouchableOpacity
                    key={b}
                    style={[
                      styles.birimChip,
                      birim === b && styles.birimChipSelected,
                    ]}
                    onPress={() => setBirim(b)}
                    activeOpacity={0.7}
                  >
                    <Text
                      variant="caption"
                      style={birim === b ? styles.birimTextSelected : undefined}
                    >
                      {t(`products:units.${b}`)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Kategori */}
            <View style={styles.section}>
              <CategoryPicker
                value={kategoriId}
                onChange={setKategoriId}
                label={t('transactions:form.category')}
                optional
              />
            </View>

            {/* Fiyatlar */}
            <View style={styles.section}>
              <View style={styles.priceRow}>
                <View style={styles.priceItem}>
                  <Input
                    label={t('products:form.purchasePrice')}
                    placeholder="0.00"
                    value={alisFiyati}
                    onChangeText={setAlisFiyati}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.priceItem}>
                  <Input
                    label={t('products:form.salePrice')}
                    placeholder="0.00"
                    value={satisFiyati}
                    onChangeText={setSatisFiyati}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
            </View>

            {/* Aciklama */}
            <View style={styles.section}>
              <Input
                label={t('products:form.description')}
                placeholder={t('products:form.description')}
                value={aciklama}
                onChangeText={setAciklama}
                multiline
                numberOfLines={3}
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
                {t('common:buttons.cancel')}
              </Button>
              <Button
                variant="primary"
                size="lg"
                loading={updateUrun.isPending}
                onPress={handleSubmit}
                style={styles.button}
              >
                {t('common:buttons.save')}
              </Button>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  birimGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  birimChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  birimChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  birimTextSelected: {
    color: colors.white,
  },
  priceRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  priceItem: {
    flex: 1,
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
