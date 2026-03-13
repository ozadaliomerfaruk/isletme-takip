import { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { Text, Input, Button, Card, CategoryPicker, UnitPicker } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useCreateUrun } from '@/hooks/useUrunler';
import { useCreateUrunHareket } from '@/hooks/useUrunHareketler';
import { BirimType, Currency, KdvOrani } from '@/types/database';
import { toErrorMessage } from '@/lib/errors';

const KDV_ORANLARI: KdvOrani[] = [0, 1, 10, 20];

export default function UrunEklePage() {
  const router = useRouter();
  const { t } = useTranslation(['products', 'common', 'errors', 'transactions']);
  const createUrun = useCreateUrun();
  const createUrunHareket = useCreateUrunHareket();

  const [ad, setAd] = useState('');
  const [kod, setKod] = useState('');
  const [birim, setBirim] = useState<BirimType>('adet');
  const [kdvOrani, setKdvOrani] = useState<KdvOrani>(0);
  const [alisFiyati, setAlisFiyati] = useState('');
  const [satisFiyati, setSatisFiyati] = useState('');
  const [baslangicMiktar, setBaslangicMiktar] = useState('');
  const [kategoriId, setKategoriId] = useState<string | null>(null);
  const [aciklama, setAciklama] = useState('');
  const [errors, setErrors] = useState<{ ad?: string }>({});

  const validate = () => {
    const newErrors: { ad?: string } = {};

    if (!ad.trim()) {
      newErrors.ad = t('products:validation.nameRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    const initialStockNum = baslangicMiktar ? parseFloat(baslangicMiktar.replace(',', '.')) : 0;
    const purchasePrice = alisFiyati ? parseFloat(alisFiyati.replace(',', '.')) : 0;

    try {
      // Create the product
      const urun = await createUrun.mutateAsync({
        ad: ad.trim(),
        kod: kod.trim() || null,
        birim,
        kdv_orani: kdvOrani,
        alis_fiyati: purchasePrice,
        satis_fiyati: satisFiyati ? parseFloat(satisFiyati.replace(',', '.')) : 0,
        kategori_id: kategoriId,
        aciklama: aciklama.trim() || null,
        currency: 'TRY' as Currency,
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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
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
              <UnitPicker
                value={birim}
                onChange={setBirim}
                label={t('products:form.unit')}
              />
            </View>

            {/* KDV Orani */}
            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                {t('products:form.vatRate')}
              </Text>
              <View style={styles.birimGrid}>
                {KDV_ORANLARI.map((k) => (
                  <TouchableOpacity
                    key={k}
                    style={[
                      styles.birimChip,
                      kdvOrani === k && styles.birimChipSelected,
                    ]}
                    onPress={() => setKdvOrani(k)}
                    activeOpacity={0.7}
                  >
                    <Text
                      variant="caption"
                      style={kdvOrani === k ? styles.birimTextSelected : undefined}
                    >
                      %{k}
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
                type="urun"
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

            {/* Başlangıç Miktarı */}
            <View style={styles.section}>
              <Input
                label={t('products:form.initialStock')}
                placeholder="0"
                value={baslangicMiktar}
                onChangeText={setBaslangicMiktar}
                keyboardType="decimal-pad"
              />
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
                loading={createUrun.isPending || createUrunHareket.isPending}
                onPress={handleSubmit}
                style={styles.button}
              >
                {t('common:buttons.add')}
              </Button>
            </View>
            </ScrollView>
          </TouchableWithoutFeedback>
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
