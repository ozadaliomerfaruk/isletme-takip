import { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text, Input, Button, CategoryPicker, UnitPicker } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { BirimType, KdvOrani } from '@/types/database';

const KDV_ORANLARI: KdvOrani[] = [0, 1, 10, 20];

/**
 * Ürün ekleme/düzenleme formunun ortak alanları.
 * Değerler ham (string) tutulur; parse + mutation çağıran ekranda yapılır
 * (ekle: createUrun + opsiyonel giriş hareketi, düzenle: updateUrun).
 */
export interface UrunFormValues {
  ad: string;
  kod: string;
  birim: BirimType;
  kdvOrani: KdvOrani;
  alisFiyati: string;
  satisFiyati: string;
  baslangicMiktar: string;
  kategoriId: string | null;
  aciklama: string;
}

const DEFAULT_VALUES: UrunFormValues = {
  ad: '',
  kod: '',
  birim: 'adet',
  kdvOrani: 0,
  alisFiyati: '',
  satisFiyati: '',
  baslangicMiktar: '',
  kategoriId: null,
  aciklama: '',
};

interface UrunFormProps {
  /** 'create' → Başlangıç Miktarı alanı + "Ekle"; 'edit' → alan gizli + "Kaydet" */
  mode: 'create' | 'edit';
  /** Düzenlemede mevcut ürünün eşlenmiş değerleri (mount anında bir kez okunur) */
  initialValues?: Partial<UrunFormValues>;
  submitting: boolean;
  onSubmit: (values: UrunFormValues) => void;
  onCancel: () => void;
}

export function UrunForm({ mode, initialValues, submitting, onSubmit, onCancel }: UrunFormProps) {
  const { t } = useTranslation(['products', 'common', 'transactions']);

  const [ad, setAd] = useState(DEFAULT_VALUES.ad);
  const [kod, setKod] = useState(DEFAULT_VALUES.kod);
  const [birim, setBirim] = useState<BirimType>(DEFAULT_VALUES.birim);
  const [kdvOrani, setKdvOrani] = useState<KdvOrani>(DEFAULT_VALUES.kdvOrani);
  const [alisFiyati, setAlisFiyati] = useState(DEFAULT_VALUES.alisFiyati);
  const [satisFiyati, setSatisFiyati] = useState(DEFAULT_VALUES.satisFiyati);
  const [baslangicMiktar, setBaslangicMiktar] = useState(DEFAULT_VALUES.baslangicMiktar);
  const [kategoriId, setKategoriId] = useState<string | null>(DEFAULT_VALUES.kategoriId);
  const [aciklama, setAciklama] = useState(DEFAULT_VALUES.aciklama);
  const [errors, setErrors] = useState<{ ad?: string }>({});

  // Düzenleme: mevcut değerleri mount SONRASI doldur. Değerleri useState initializer'da
  // mount anında vermek yerine effect ile sonradan set etmek, Input'un floating-label'ının
  // ('' → değer geçişinde) yukarı kaymasını tetikler — aksi halde etiket değerin üstüne biniyor.
  // Cari/hesap düzenleme formlarıyla aynı kanıtlı desen. Ref guard: yalnızca bir kez uygulanır,
  // arka plan refetch'i kullanıcının düzenlemesini ezmez. Ekleme modunda initialValues yok → no-op.
  const populatedRef = useRef(false);
  useEffect(() => {
    if (!initialValues || populatedRef.current) return;
    populatedRef.current = true;
    setAd(initialValues.ad ?? DEFAULT_VALUES.ad);
    setKod(initialValues.kod ?? DEFAULT_VALUES.kod);
    setBirim(initialValues.birim ?? DEFAULT_VALUES.birim);
    setKdvOrani(initialValues.kdvOrani ?? DEFAULT_VALUES.kdvOrani);
    setAlisFiyati(initialValues.alisFiyati ?? DEFAULT_VALUES.alisFiyati);
    setSatisFiyati(initialValues.satisFiyati ?? DEFAULT_VALUES.satisFiyati);
    setBaslangicMiktar(initialValues.baslangicMiktar ?? DEFAULT_VALUES.baslangicMiktar);
    setKategoriId(initialValues.kategoriId ?? DEFAULT_VALUES.kategoriId);
    setAciklama(initialValues.aciklama ?? DEFAULT_VALUES.aciklama);
  }, [initialValues]);

  const showInitialStock = mode === 'create';
  const submitLabel = mode === 'create' ? t('common:buttons.add') : t('common:buttons.save');

  const handleSubmit = () => {
    if (!ad.trim()) {
      setErrors({ ad: t('products:validation.nameRequired') });
      return;
    }
    setErrors({});
    onSubmit({ ad, kod, birim, kdvOrani, alisFiyati, satisFiyati, baslangicMiktar, kategoriId, aciklama });
  };

  return (
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
            <UnitPicker value={birim} onChange={setBirim} label={t('products:form.unit')} />
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
                  style={[styles.birimChip, kdvOrani === k && styles.birimChipSelected]}
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

          {/* Başlangıç Miktarı (sadece ürün eklemede) */}
          {showInitialStock && (
            <View style={styles.section}>
              <Input
                label={t('products:form.initialStock')}
                placeholder="0"
                value={baslangicMiktar}
                onChangeText={setBaslangicMiktar}
                keyboardType="decimal-pad"
              />
            </View>
          )}

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
            <Button variant="outline" size="lg" onPress={onCancel} style={styles.button}>
              {t('common:buttons.cancel')}
            </Button>
            <Button
              variant="primary"
              size="lg"
              loading={submitting}
              onPress={handleSubmit}
              style={styles.button}
            >
              {submitLabel}
            </Button>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
