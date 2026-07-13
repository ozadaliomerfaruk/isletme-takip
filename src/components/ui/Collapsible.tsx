import { useState, type ReactNode } from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { Text } from './Text';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { upperTr } from '@/lib/turkishTextUtils';

interface CollapsibleProps {
  /** Başlık — "Detaylar" gibi. */
  title: string;
  /**
   * Açık mı başlasın. Formlarda GUARDRAIL: düzenleme modunda gizlenen alanlardan biri
   * doluysa açık başlamalı (kullanıcı verisini görmeden üstüne yazmasın). Değer YALNIZ
   * mount'ta okunur — çağıran, kaynağı hazırken (ör. yüklenmiş kayıt nesnesi) hesaplamalı.
   */
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * Form içi hafif "aç/kapa" disclosure'ı ("▸ Detaylar"). Nadir kullanılan opsiyonel
 * alanları sık-yoldan çıkarır, bilinçli olarak animasyonsuzdur (LayoutAnimation'ın
 * Fabric/Android footgun'ından kaçınmak için); chevron affordance yeterli.
 */
export function Collapsible({ title, defaultOpen = false, children }: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        {open ? (
          <ChevronDown size={18} color={colors.textMuted} />
        ) : (
          <ChevronRight size={18} color={colors.textMuted} />
        )}
        <Text variant="label" color="secondary" style={styles.title}>
          {upperTr(title)}
        </Text>
      </TouchableOpacity>
      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  title: {
    marginLeft: spacing.xs,
  },
  body: {
    marginTop: spacing.xs,
  },
});
