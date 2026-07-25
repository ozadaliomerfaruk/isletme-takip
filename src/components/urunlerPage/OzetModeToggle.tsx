import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, HIT_SLOP } from '@/constants/spacing';
import { upperTr } from '@/lib/turkishTextUtils';

export type OzetMode = 'miktar' | 'tutar';

/**
 * MİKTAR / TUTAR geçişi — ürün LİSTESİ ve ürün DETAYI için TEK bileşen.
 *
 * NEDEN PAYLAŞILDI — aynı kontrol iki sayfada iki kopyaydı ve görsel olarak ayrışmıştı:
 * listede 12pt/700/letterSpacing 0.3 + upperTr'li etiketler, detayda 14pt/600 +
 * normal harf. Detaydaki kod yorumu ise "liste sayfasındaki toggle ile aynı görünüm"
 * diyordu — niyet tutarlılık, sonuç değil. Ölçüleri eşitlemek yetmez: iki kopya
 * kaldığı sürece bir sonraki dokunuş yine ayrıştırır. Punto/padding/harf-durumu ve
 * dokunma hedefi artık TEK yerde.
 *
 * Dokunma hedefi: buton yüksekliği ~26px (padding 5 + 12pt satır) — 44px eşiğinin
 * altında, bu yüzden HIT_SLOP.sm zorunlu (iki kopyanın ikisinde de yoktu).
 */
export function OzetModeToggle({
  mode,
  onChange,
  onPressFeedback,
}: {
  mode: OzetMode;
  onChange: (mode: OzetMode) => void;
  /** Haptik vb. yan etki — liste sayfası haptics.light() veriyor, detay vermiyordu. */
  onPressFeedback?: () => void;
}) {
  const { t } = useTranslation('products');

  const renderButton = (value: OzetMode, labelKey: string) => (
    <TouchableOpacity
      style={[styles.btn, mode === value && styles.btnActive]}
      onPress={() => {
        onPressFeedback?.();
        onChange(value);
      }}
      activeOpacity={0.8}
      hitSlop={HIT_SLOP.sm}
      accessibilityRole="button"
      accessibilityState={{ selected: mode === value }}
    >
      <Text style={[styles.txt, mode === value && styles.txtActive]}>
        {upperTr(t(labelKey))}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.toggle}>
      {renderButton('miktar', 'products:stock.quantity')}
      {renderButton('tutar', 'products:stock.amount')}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.full,
    padding: 2,
  },
  btn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
  },
  btnActive: {
    backgroundColor: colors.primary,
  },
  txt: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: colors.textSecondary,
  },
  txtActive: {
    color: colors.white,
  },
});
