import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ArrowUp, ArrowDown, ChevronRight, ChevronDown, X } from 'lucide-react-native';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontWeight } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import type { TransactionType, PeekCari } from '../types';

interface CariPeekSectionProps {
  cari: PeekCari;
  /** Yön seçildi mi — true ise kompakt başlık (form açık). */
  directionChosen: boolean;
  /** Büyük yön butonuna basınca (satis/tahsilat/alis/odeme). */
  onSelectDirection: (type: TransactionType) => void;
  /** "Diğer işlemler" — kalan tipleri göster (form + tam tab şeridi). */
  onOther: () => void;
  onClose: () => void;
  onHistory: () => void;
  /** view-only linkli / izinsiz → yalnız peek, buton yok. */
  peekOnly?: boolean;
  /** full-izinli linkli cari → tek büyük buton (viewer tab seti). */
  singleButton?: boolean;
}

/**
 * Cari peek-sheet üst bloğu (#5, Varyant A): bakiye + yön butonları.
 * Kontrast HESAPLANMIŞ token'larla (successDark/errorDark, *Light zemin + *Dark metin);
 * durum etiketi i18n'de ELLE büyük yazılı (textTransform RN'de i→I bug'ı).
 */
export function CariPeekSection({
  cari,
  directionChosen,
  onSelectDirection,
  onOther,
  onClose,
  onHistory,
  peekOnly,
  singleButton,
}: CariPeekSectionProps) {
  const { t } = useTranslation(['clients']);
  const isMusteri = cari.type === 'musteri';

  // Bakiye durumu (cariler listesiyle aynı mantık). Etiketler i18n'de BÜYÜK.
  const statusKey =
    cari.balance === 0
      ? 'noBalance'
      : isMusteri
        ? cari.balance > 0 ? 'theyOwe' : 'weOwe'
        : cari.balance < 0 ? 'weOwe' : 'theyOwe';
  const balanceColor =
    cari.balance === 0 ? colors.textSecondary : cari.balance > 0 ? colors.successDark : colors.errorDark;
  const signPrefix = cari.balance > 0 ? '+' : cari.balance < 0 ? '−' : '';

  // Kompakt (form açık): tek satır isim + durum + bakiye
  if (directionChosen) {
    return (
      <View style={[styles.compactRow, isMusteri ? styles.stripMusteri : styles.stripTedarikci]}>
        <Text style={styles.compactName} numberOfLines={1}>{cari.name}</Text>
        <Text style={[styles.compactBalance, { color: balanceColor }]} numberOfLines={1}>
          {t(`clients:peek.status.${statusKey}`)} {signPrefix}{formatCurrency(Math.abs(cari.balance), cari.currency)}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Başlık: isim + Hareketler chip + kapat */}
      <View style={styles.headerRow}>
        <Text style={styles.name} numberOfLines={1}>{cari.name}</Text>
        <TouchableOpacity style={styles.historyChip} onPress={onHistory} accessibilityRole="button">
          <Text style={styles.historyChipText}>{t('clients:peek.history')}</Text>
          <ChevronRight size={16} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel={t('clients:peek.close')}>
          <X size={22} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Durum + bakiye (beyaz zemin, koyu ton) */}
      <Text style={styles.statusLabel}>{t(`clients:peek.status.${statusKey}`)}</Text>
      <Text
        style={[styles.balance, { color: balanceColor }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {signPrefix}{formatCurrency(Math.abs(cari.balance), cari.currency)}
      </Text>

      {/* Tip şeridi */}
      <View style={[styles.typeStrip, isMusteri ? styles.stripMusteri : styles.stripTedarikci]} />

      {peekOnly ? (
        <Text style={styles.peekOnlyNote}>{t('clients:peek.noPermission')}</Text>
      ) : (
        <>
          <View style={styles.buttonRow}>
            {/* Birincil yön: müşteri=Satış(borç yazar), tedarikçi=Alış(borç alır) */}
            <DirectionButton
              icon={<ArrowUp size={20} color={isMusteri ? colors.successDark : colors.orangeDark} />}
              label={isMusteri ? t('clients:peek.buttons.saleTitle') : t('clients:peek.buttons.purchaseTitle')}
              subtitle={isMusteri ? t('clients:peek.buttons.saleSub') : t('clients:peek.buttons.purchaseSub')}
              bg={isMusteri ? colors.successLight : colors.orangeLight}
              fg={isMusteri ? colors.successDark : colors.orangeDark}
              onPress={() => onSelectDirection(isMusteri ? 'satis' : 'alis')}
            />
            {/* İkincil yön yalnız tek-buton değilse: müşteri=Tahsilat, tedarikçi=Ödeme */}
            {!singleButton && (
              <DirectionButton
                icon={<ArrowDown size={20} color={colors.primary} />}
                label={isMusteri ? t('clients:peek.buttons.collectTitle') : t('clients:peek.buttons.payTitle')}
                subtitle={isMusteri ? t('clients:peek.buttons.collectSub') : t('clients:peek.buttons.paySub')}
                bg={colors.primaryLight}
                fg={colors.primary}
                onPress={() => onSelectDirection(isMusteri ? 'tahsilat' : 'odeme')}
              />
            )}
          </View>

          {/* Diğer işlemler */}
          <TouchableOpacity style={styles.otherRow} onPress={onOther} accessibilityRole="button">
            <Text style={styles.otherText}>{t('clients:peek.other')}</Text>
            <ChevronDown size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

function DirectionButton({
  icon, label, subtitle, bg, fg, onPress,
}: {
  icon: React.ReactNode; label: string; subtitle: string; bg: string; fg: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.dirButton, { backgroundColor: bg }]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityHint={subtitle}
    >
      {icon}
      <Text style={[styles.dirLabel, { color: fg }]} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
      <Text style={[styles.dirSub, { color: fg }]} numberOfLines={1}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    flex: 1,
    fontSize: 18,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  historyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  historyChipText: {
    fontSize: 14,
    fontWeight: fontWeight.medium,
    color: colors.primary,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  balance: {
    fontSize: 28,
    fontWeight: fontWeight.bold,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  typeStrip: {
    height: 3,
    borderRadius: 2,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  stripMusteri: { backgroundColor: colors.primaryLight },
  stripTedarikci: { backgroundColor: colors.orangeLight },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  dirButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    gap: 2,
  },
  dirLabel: {
    fontSize: 16,
    fontWeight: fontWeight.semibold,
  },
  dirSub: {
    fontSize: 12,
    opacity: 0.9,
  },
  otherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 44,
    marginTop: spacing.xs,
  },
  otherText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  peekOnlyNote: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  // Kompakt (form açık)
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  compactName: {
    flex: 1,
    fontSize: 15,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  compactBalance: {
    fontSize: 15,
    fontWeight: fontWeight.bold,
    fontVariant: ['tabular-nums'],
  },
});
