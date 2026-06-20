import { StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { UrunForm, type UrunFormValues } from '@/components/urun/UrunForm';
import { colors } from '@/constants/colors';
import { useCreateUrun } from '@/hooks/useUrunler';
import { useCreateUrunHareket } from '@/hooks/useUrunHareketler';
import { useSettings } from '@/hooks/useSettings';
import { Currency } from '@/types/database';
import { toErrorMessage } from '@/lib/errors';
import { usePagePermission } from '@/hooks/usePagePermission';

export default function UrunEklePage() {
  const router = useRouter();
  const { t } = useTranslation(['products', 'common', 'errors', 'navigation']);
  usePagePermission({ module: 'urunler', action: 'create' });
  const createUrun = useCreateUrun();
  const createUrunHareket = useCreateUrunHareket();
  const { currency: userCurrency } = useSettings();

  const handleSubmit = async (values: UrunFormValues) => {
    const initialStockNum = values.baslangicMiktar ? parseFloat(values.baslangicMiktar.replace(',', '.')) : 0;
    const purchasePrice = values.alisFiyati ? parseFloat(values.alisFiyati.replace(',', '.')) : 0;

    try {
      // Create the product
      const urun = await createUrun.mutateAsync({
        ad: values.ad.trim(),
        kod: values.kod.trim() || null,
        birim: values.birim,
        kdv_orani: values.kdvOrani,
        alis_fiyati: purchasePrice,
        satis_fiyati: values.satisFiyati ? parseFloat(values.satisFiyati.replace(',', '.')) : 0,
        kategori_id: values.kategoriId,
        aciklama: values.aciklama.trim() || null,
        currency: userCurrency as Currency,
      });

      // Create initial urun movement if initial stock > 0
      if (initialStockNum > 0) {
        await createUrunHareket.mutateAsync({
          urun_id: urun.id,
          hareket_tipi: 'giris',
          miktar: initialStockNum,
          birim_fiyat: purchasePrice > 0 ? purchasePrice : null,
          aciklama: t('products:form.initialStock'),
        });
      }

      Alert.alert(t('common:status.success'), t('products:messages.createSuccess'), [
        { text: t('common:buttons.ok'), onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('errors:general.tryAgain'));
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: t('products:addProduct'),
          headerBackTitle: t('navigation:back.back'),
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <UrunForm
          mode="create"
          submitting={createUrun.isPending || createUrunHareket.isPending}
          onSubmit={handleSubmit}
          onCancel={() => router.back()}
        />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
