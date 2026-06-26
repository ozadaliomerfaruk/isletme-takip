import { StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { UrunForm, type UrunFormValues } from '@/components/urun/UrunForm';
import { colors } from '@/constants/colors';
import { useCreateUrun } from '@/hooks/useUrunler';
import { useCreateUrunHareket } from '@/hooks/useUrunHareketler';
import { useSettings } from '@/hooks/useSettings';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Currency } from '@/types/database';
import { toErrorMessage } from '@/lib/errors';
import { parseCurrency } from '@/lib/currency';
import { usePagePermission } from '@/hooks/usePagePermission';

export default function UrunEklePage() {
  const router = useRouter();
  const { t } = useTranslation(['products', 'common', 'errors', 'navigation']);
  usePagePermission({ module: 'urunler', action: 'create' });
  const createUrun = useCreateUrun();
  const createUrunHareket = useCreateUrunHareket();
  const { currency: userCurrency } = useSettings();
  const { isletme } = useAuthContext();

  const doCreate = async (values: UrunFormValues) => {
    const initialStockNum = values.baslangicMiktar ? parseCurrency(values.baslangicMiktar) : 0;
    const purchasePrice = values.alisFiyati ? parseCurrency(values.alisFiyati) : 0;

    try {
      // Create the product
      const urun = await createUrun.mutateAsync({
        ad: values.ad.trim(),
        kod: values.kod.trim() || null,
        birim: values.birim,
        kdv_orani: values.kdvOrani,
        alis_fiyati: purchasePrice,
        satis_fiyati: values.satisFiyati ? parseCurrency(values.satisFiyati) : 0,
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

  // #24: Mükerrer ürün adı kontrolü — engellemez, kullanıcı onayıyla yine de ekler.
  const handleSubmit = async (values: UrunFormValues) => {
    const name = values.ad.trim();
    if (isletme && name) {
      try {
        const { data: dupes } = await supabase
          .from('urunler')
          .select('id')
          .eq('isletme_id', isletme.id)
          .eq('is_active', true)
          .ilike('ad', name)
          .limit(1);
        if (dupes && dupes.length > 0) {
          Alert.alert(
            t('products:duplicate.title'),
            t('products:duplicate.message', { name }),
            [
              { text: t('common:buttons.cancel'), style: 'cancel' },
              { text: t('common:buttons.add'), onPress: () => doCreate(values) },
            ]
          );
          return;
        }
      } catch {
        // Kontrol başarısızsa akışı engelleme — normal oluşturmaya devam et
      }
    }
    await doCreate(values);
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
