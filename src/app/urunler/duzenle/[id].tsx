import { useMemo } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text , Screen } from '@/components/ui';
import { UrunForm, type UrunFormValues } from '@/components/urun/UrunForm';
import { colors } from '@/constants/colors';
import { useUrun, useUpdateUrun } from '@/hooks/useUrunler';
import { toErrorMessage } from '@/lib/errors';
import { useSaveSuccessFeedback } from '@/hooks/useSaveSuccessFeedback';
import { parseCurrency } from '@/lib/currency';
import { normalizeProductBrand } from '@/lib/productBrand';
import { usePagePermission } from '@/hooks/usePagePermission';

export default function UrunDuzenlePage() {
  const router = useRouter();
  const notifySaved = useSaveSuccessFeedback();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation(['products', 'common', 'errors', 'navigation']);
  const { data: urun, isLoading } = useUrun(id);
  usePagePermission({ module: 'urunler', action: 'update', createdBy: urun?.created_by });
  const updateUrun = useUpdateUrun();

  // Mevcut ürünün form değerleri. urun referansına bağlı memoize → UrunForm effect'i
  // stabil bir bağımlılıkla bir kez doldurur (floating-label doğru animasyonu için).
  const initialValues = useMemo<Partial<UrunFormValues> | undefined>(
    () => (urun ? {
      ad: urun.ad,
      kod: urun.kod || '',
      marka: urun.marka || '',
      birim: urun.birim,
      kdvOrani: urun.kdv_orani || 0,
      alisFiyati: urun.alis_fiyati > 0 ? urun.alis_fiyati.toString() : '',
      satisFiyati: urun.satis_fiyati > 0 ? urun.satis_fiyati.toString() : '',
      kategoriId: urun.kategori_id || null,
      aciklama: urun.aciklama || '',
    } : undefined),
    [urun]
  );

  const handleSubmit = async (values: UrunFormValues) => {
    if (!id) return;

    try {
      await updateUrun.mutateAsync({
        id,
        ad: values.ad.trim(),
        kod: values.kod.trim() || null,
        marka: normalizeProductBrand(values.marka),
        birim: values.birim,
        kdv_orani: values.kdvOrani,
        alis_fiyati: values.alisFiyati ? parseCurrency(values.alisFiyati) : 0,
        satis_fiyati: values.satisFiyati ? parseCurrency(values.satisFiyati) : 0,
        kategori_id: values.kategoriId,
        aciklama: values.aciklama.trim() || null,
      });

      notifySaved(t('products:messages.updateSuccess'));
      router.back();
    } catch (error) {
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('errors:general.tryAgain'));
    }
  };

  const stackScreen = (
    <Stack.Screen
      options={{
        title: t('products:editProduct'),
        headerBackTitle: t('navigation:back.back'),
      }}
    />
  );

  if (isLoading) {
    return (
      <>
        {stackScreen}
        <Screen>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        </Screen>
      </>
    );
  }

  if (!urun) {
    return (
      <>
        {stackScreen}
        <Screen>
          <View style={styles.loadingContainer}>
            <Text color="secondary">{t('errors:product.notFound')}</Text>
          </View>
        </Screen>
      </>
    );
  }

  return (
    <>
      {stackScreen}
      <Screen>
        <UrunForm
          mode="edit"
          initialValues={initialValues}
          submitting={updateUrun.isPending}
          onSubmit={handleSubmit}
          onCancel={() => router.back()}
        />
      </Screen>
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
});
