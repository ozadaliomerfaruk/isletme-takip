import React, { memo, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Image as ImageIcon, Package } from 'lucide-react-native';
import { Text } from './Text';
import { TransactionIcon } from './TransactionIcon';
import { colors } from '@/constants/colors';
import { spacing, fontSize, fontWeight, borderRadius, HIT_SLOP } from '@/constants/spacing';
import { useTranslation } from 'react-i18next';
import { formatCurrency, toNumber, formatQuantity } from '@/lib/currency';
import { getTransactionColor, getTransactionPrefix } from '@/lib/transactionColors';
import { isLeaveType } from '@/constants/islemTypes';
import type { IslemType } from '@/types/database';

// ============================================================================
// TRANSACTION ROW — Presentational Component (Modernized)
// ============================================================================

// Vade renk durumu (cari detay). Açık zeminde okunur: Light zemin + Dark metin
// (salt warning/orange açık zeminde soluk — colors.ts notu).
export type VadeState = 'paid' | 'overdue' | 'soon' | 'future';
const VADE_COLORS: Record<VadeState, { bg: string; fg: string }> = {
  paid:    { bg: colors.successLight, fg: colors.successDark },  // ödendi → yeşil
  overdue: { bg: colors.errorLight,   fg: colors.errorDark },    // bugün/geçmiş → kırmızı
  soon:    { bg: colors.orangeLight,  fg: colors.orangeDark },   // <1 hafta → turuncu
  future:  { bg: colors.warningLight, fg: colors.warningDark },  // >1 hafta → sarı
};

export interface TransactionRowProps {
  id: string;
  type: IslemType;
  amount: number | string;
  date: string;
  typeLabel: string;
  /** Counterparty / entity name — rendered prominently */
  entityText?: string | null;
  secondaryText?: string | null;
  tertiaryText?: string | null;
  /** Opsiyonel ek bağlam satırı (ör. hesap adı) — İşlemler geçmez; kategori raporu geçer. */
  hesapText?: string | null;
  subAmount?: string | null;
  hasPhoto?: boolean;
  hasUrunler?: boolean;
  urunCount?: number;
  /** İşleme bağlı ürün kalemleri (satırda kompakt liste: ad · miktar × birim fiyat). */
  urunItems?: { ad: string; miktar: number; birim_fiyat: number | null; birim: string }[];
  /** Satırda gösterilecek azami kalem sayısı (varsayılan 3); fazlası "+X daha". */
  maxUrunItems?: number;
  currency?: string;
  /** Override the default color derived from type */
  overrideColor?: string;
  /** Override the default prefix derived from type */
  overridePrefix?: string;
  /** Creator name shown as a small badge (multi-user mode) */
  creatorText?: string | null;
  /** Vade etiketi "Vade: GG.AA.YYYY" (vadeli işlemde gösterilir). */
  vadeText?: string | null;
  /** Vade renk durumu: paid=yeşil, overdue=kırmızı, soon=turuncu(<1hf), future=sarı(>1hf). */
  vadeState?: VadeState;
  onPress?: (id: string) => void;
  onLongPress?: (id: string) => void;
  onPhotoPress?: (id: string) => void;
}

export const TransactionRow = memo(function TransactionRow({
  id,
  type,
  amount,
  date,
  typeLabel,
  entityText,
  secondaryText,
  tertiaryText,
  hesapText,
  subAmount,
  hasPhoto,
  hasUrunler,
  urunCount,
  urunItems,
  maxUrunItems = 3,
  currency,
  overrideColor,
  overridePrefix,
  creatorText,
  vadeText,
  vadeState,
  onPress,
  onLongPress,
  onPhotoPress,
}: TransactionRowProps) {
  const handlePress = useCallback(() => onPress?.(id), [onPress, id]);
  const handleLongPress = useCallback(() => onLongPress?.(id), [onLongPress, id]);
  const handlePhotoPress = useCallback(() => onPhotoPress?.(id), [onPhotoPress, id]);

  const { t } = useTranslation(['staff', 'transactions']);
  const txColor = overrideColor ?? getTransactionColor(type);
  const prefix = overridePrefix ?? getTransactionPrefix(type);
  const numAmount = typeof amount === 'string' ? toNumber(amount) : amount;
  const isLeave = isLeaveType(type);
  const formattedAmount = isLeave
    ? `${Math.abs(numAmount)} ${t('staff:leave.days')}`
    : formatCurrency(Math.abs(numAmount), currency);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      onLongPress={handleLongPress}
      activeOpacity={0.7}
      delayLongPress={400}
    >
      {/* Transaction Icon Circle */}
      <TransactionIcon type={type} size={40} />

      {/* Content */}
      <View style={styles.content}>
        {/* Line 1: Entity name (most prominent) */}
        {entityText ? (
          <Text style={styles.entityText} numberOfLines={1}>
            {entityText}
          </Text>
        ) : (
          <Text style={[styles.typeTextPrimary, { color: txColor }]} numberOfLines={1}>
            {typeLabel}
          </Text>
        )}

        {/* Line 2: Type label + date + creator */}
        <View style={styles.line2}>
          {entityText ? (
            <Text style={[styles.typeTextSmall, { color: txColor }]} numberOfLines={1}>
              {typeLabel}
            </Text>
          ) : null}
          {entityText && <Text style={styles.dot}> · </Text>}
          <Text style={styles.dateText}>{date}</Text>
          {creatorText ? (
            <>
              <Text style={styles.dot}> · </Text>
              <Text style={styles.creatorText} numberOfLines={1}>{creatorText}</Text>
            </>
          ) : null}
          {vadeText ? (
            <View style={[styles.vadePill, { backgroundColor: VADE_COLORS[vadeState ?? 'future'].bg }]}>
              <Text style={[styles.vadePillText, { color: VADE_COLORS[vadeState ?? 'future'].fg }]} numberOfLines={1}>
                {vadeText}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Line 3: Secondary (category) */}
        {secondaryText ? (
          <Text style={styles.secondaryText} numberOfLines={1}>
            {secondaryText}
          </Text>
        ) : null}
        {/* Line 3.5: Ürün kalemleri (ad · miktar × birim fiyat) */}
        {urunItems && urunItems.length > 0 ? (
          <View style={styles.urunList}>
            {urunItems.slice(0, maxUrunItems).map((it, i) => (
              <Text key={i} style={styles.urunItemText} numberOfLines={1}>
                {it.ad}  {formatQuantity(it.miktar)}
                {it.birim_fiyat != null ? ` × ${formatCurrency(it.birim_fiyat, currency)}` : ''}
              </Text>
            ))}
            {urunItems.length > maxUrunItems ? (
              <Text style={styles.urunMoreText}>
                {t('transactions:productItems.more', { count: urunItems.length - maxUrunItems })}
              </Text>
            ) : null}
          </View>
        ) : null}
        {/* Line 4: Tertiary (note) — no line limit */}
        {tertiaryText ? (
          <Text style={styles.tertiaryText}>
            {tertiaryText}
          </Text>
        ) : null}
        {/* Line 5: Opsiyonel bağlam (hesap adı) — yalnız geçildiğinde */}
        {hesapText ? (
          <Text style={styles.secondaryText} numberOfLines={1}>
            {hesapText}
          </Text>
        ) : null}
      </View>

      {/* Amount */}
      <View style={styles.amountContainer}>
        <View style={styles.amountRow}>
          {hasUrunler && (
            <View style={styles.urunBadge}>
              <Package size={17} color={colors.primary} />
              {(urunCount ?? 0) > 0 && (
                <Text style={styles.urunCountText}>{urunCount}</Text>
              )}
            </View>
          )}
          {hasPhoto && (
            <TouchableOpacity onPress={handlePhotoPress} hitSlop={HIT_SLOP.sm}>
              <ImageIcon size={14} color={colors.primary} style={styles.photoIcon} />
            </TouchableOpacity>
          )}
          <Text style={[styles.amountText, { color: txColor }]}>
            {prefix}{formattedAmount}
          </Text>
        </View>
        {subAmount && (
          <Text style={styles.subAmountText}>{subAmount}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}, (prev, next) => {
  return prev.id === next.id
    && prev.amount === next.amount
    && prev.type === next.type
    && prev.date === next.date
    && prev.hasPhoto === next.hasPhoto
    && prev.hasUrunler === next.hasUrunler
    && prev.urunCount === next.urunCount
    && prev.urunItems === next.urunItems
    && prev.maxUrunItems === next.maxUrunItems
    && prev.entityText === next.entityText
    && prev.secondaryText === next.secondaryText
    && prev.tertiaryText === next.tertiaryText
    && prev.hesapText === next.hesapText
    && prev.subAmount === next.subAmount
    && prev.overrideColor === next.overrideColor
    && prev.overridePrefix === next.overridePrefix
    && prev.creatorText === next.creatorText
    && prev.vadeText === next.vadeText
    && prev.vadeState === next.vadeState;
});

// ============================================================================
// DATE SECTION HEADER — Pill style (WhatsApp inspired)
// ============================================================================

export interface DateSectionHeaderProps {
  title: string;
}

export function DateSectionHeader({ title }: DateSectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.pill}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
    gap: spacing.md,
  },
  content: {
    flex: 1,
    gap: 2,
  },
  entityText: {
    fontSize: 15,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  typeTextPrimary: {
    fontSize: 15,
    fontWeight: fontWeight.semibold,
  },
  line2: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeTextSmall: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
  dot: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  dateText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.normal,
    color: colors.textMuted,
  },
  creatorText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.primary,
    flexShrink: 1,
  },
  vadePill: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: borderRadius.full,
  },
  vadePillText: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
  },
  line3: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  secondaryText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.normal,
    color: colors.textMuted,
  },
  tertiaryText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.normal,
    color: colors.textMuted,
  },
  urunList: {
    gap: 1,
    marginTop: 1,
  },
  urunItemText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.normal,
    color: colors.textSecondary,
  },
  urunMoreText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.primary,
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  urunBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 1,
  },
  urunCountText: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  photoIcon: {
    marginTop: 1,
  },
  amountText: {
    fontSize: 18,
    fontWeight: fontWeight.bold,
  },
  subAmountText: {
    fontSize: 11,
    fontWeight: fontWeight.normal,
    color: colors.textMuted,
    marginTop: 1,
  },
  // Pill-style section header (WhatsApp inspired)
  sectionHeader: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  pill: {
    backgroundColor: colors.surfaceLighter,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
});
