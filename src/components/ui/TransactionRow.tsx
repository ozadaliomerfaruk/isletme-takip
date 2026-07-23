import React, { memo, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Image as ImageIcon, Package } from 'lucide-react-native';
import { Text } from './Text';
import { colors } from '@/constants/colors';
import { spacing, fontSize, fontWeight, HIT_SLOP } from '@/constants/spacing';
import { useTranslation } from 'react-i18next';
import { formatCurrency, toNumber, formatQuantity } from '@/lib/currency';
import { getTransactionColor, getTransactionPrefix } from '@/lib/transactionColors';
import { upperTr } from '@/lib/turkishTextUtils';
import { isLeaveType } from '@/constants/islemTypes';
import type { IslemType } from '@/types/database';

// ============================================================================
// TRANSACTION ROW — Presentational Component (sol accent-bar tasarımı)
// ============================================================================
// Yuvarlak ikon yerine SOL RENKLİ DİKEY BAR türü belli eder (transactionColors.ts
// showAccentBar/accent-bar notlarındaki baştan planlanmış dil). İki yerleşim:
//   • entityAsPrimary=true (Defter/hesap/kategori): 1. satır = KARŞI TARAF ADI,
//     tür 2. satırda küçük — karışık akışta "kim" öne çıkar.
//   • entityAsPrimary=false (cari detay): 1. satır = TÜR (renkli) · bağlam
//     (hesap ya da kategori) — tek-cari defterinde "ne oldu" öne çıkar.
// Tarih: gün üstteki ayraç başlığında; satırda SAAT (date prop) verilir.

// Vade renk durumu (cari detay). Soft pill: light zemin + dark metin.
export type VadeState = 'paid' | 'overdue' | 'soon' | 'future' | 'open';
const VADE_COLORS: Record<VadeState, { bg: string; fg: string }> = {
  paid:    { bg: colors.successLight, fg: colors.successDark },  // ödendi → yeşil
  overdue: { bg: colors.errorLight,   fg: colors.errorDark },    // bugün/geçmiş → kırmızı
  soon:    { bg: colors.orangeLight,  fg: colors.orangeDark },   // <1 hafta → turuncu
  future:  { bg: colors.warningLight, fg: colors.warningDark },  // >1 hafta → sarı
  open:    { bg: colors.surfaceLighter, fg: colors.textSecondary }, // vadesiz açık kalan → nötr
};

export interface TransactionRowProps {
  id: string;
  type: IslemType;
  amount: number | string;
  /** Satırda gösterilecek SAAT (ör. "14:30") — gün üstteki ayraçta olduğundan satırda
      yalnız saat verilir; verilmezse çizilmez (kategori raporu tam tarih geçebilir). */
  date?: string;
  typeLabel: string;
  /** Counterparty / entity adı (Defter: cari/personel adı · cari detay: hesap adı). */
  entityText?: string | null;
  /** true → entityText 1. satır (ad öne); false → tür 1. satır, entityText bağlam. */
  entityAsPrimary?: boolean;
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
  /** Vade/taksit etiketi ("Vade: … · Kalan: …" ya da "3/12 taksit … · Kalan: …"). */
  vadeText?: string | null;
  /** Vade renk durumu: paid=yeşil, overdue=kırmızı, soon=turuncu(<1hf), future=sarı(>1hf). */
  vadeState?: VadeState;
  /** Kapanmış fatura damgası: 'odendi' (alış ödendi) / 'tahsil' (satış tahsil edildi). */
  paidStamp?: 'odendi' | 'tahsil';
  /** Yürüyen bakiye: tutarın altında sağa dayalı "Bakiye X" (o işlemden SONRAKİ bakiye). */
  runningBalanceText?: string | null;
  /** Yürüyen bakiye borç yönünde mi (negatif) → kırmızı vurgusu. */
  runningBalanceNegative?: boolean;
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
  entityAsPrimary = true,
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
  paidStamp,
  runningBalanceText,
  runningBalanceNegative,
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

  // Yerleşim kararı: ad-öne mi tür-öne mi?
  const nameFirst = entityAsPrimary && !!entityText;
  // Tür-öne modunda 1. satır yanındaki bağlam: hesap adı (entityText) yoksa kategori.
  const inlineContext = !nameFirst ? (entityText ?? secondaryText ?? null) : null;
  const inlineIsCategory = !nameFirst && !entityText && !!secondaryText;
  // entityText 1. satır bağlamı olarak kullanıldıysa, kategori ayrı satıra düşer.
  const leftoverCategory = nameFirst
    ? secondaryText
    : (entityText ? secondaryText : null);

  // Tür ve kategori BÜYÜK harf (Türkçe-güvenli upperTr — textTransform 'i'→'I' bozar).
  const typeUpper = upperTr(typeLabel);
  const inlineDisplay = inlineContext
    ? (inlineIsCategory ? upperTr(inlineContext) : inlineContext)
    : null;
  const categoryUpper = leftoverCategory ? upperTr(leftoverCategory) : null;

  // Vade/taksit metni pill'de tek blok — çok satırlı taksit metnini ' · ' ile düzle.
  const vadePillText = vadeText ? vadeText.replace(/\s*\n\s*/g, ' · ') : null;
  const vc = VADE_COLORS[vadeState ?? 'future'];

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      onLongPress={handleLongPress}
      activeOpacity={0.7}
      delayLongPress={400}
    >
      {/* Sol accent bar — tür rengi (ikon yerine geçer) */}
      <View style={[styles.bar, { backgroundColor: txColor }]} />

      {/* Content */}
      <View style={styles.content}>
        {/* ---- 1. satır ---- */}
        {nameFirst ? (
          <Text style={styles.primaryName} numberOfLines={1}>
            {entityText}
          </Text>
        ) : (
          <View style={styles.l1}>
            <Text style={[styles.primaryType, { color: txColor }]} numberOfLines={1}>
              {typeUpper}
            </Text>
            {inlineDisplay ? (
              <>
                <Text style={styles.sep}>·</Text>
                <Text
                  style={inlineIsCategory ? styles.ctxCategory : styles.ctxEntity}
                  numberOfLines={1}
                >
                  {inlineDisplay}
                </Text>
              </>
            ) : null}
          </View>
        )}

        {/* ---- 2. satır: (ad-öne'de tür) + saat + oluşturan ---- */}
        {(nameFirst || date || creatorText) ? (
          <View style={styles.l2}>
            {nameFirst ? (
              <Text style={[styles.typeSmall, { color: txColor }]} numberOfLines={1}>
                {typeUpper}
              </Text>
            ) : null}
            {nameFirst && date ? <Text style={styles.sep}>·</Text> : null}
            {date ? <Text style={styles.dateText}>{date}</Text> : null}
            {creatorText ? (
              <>
                {(nameFirst || date) ? <Text style={styles.sep}>·</Text> : null}
                <Text style={styles.creatorText} numberOfLines={1}>{creatorText}</Text>
              </>
            ) : null}
          </View>
        ) : null}

        {/* ---- Vade / taksit rozeti (soft pill) ---- */}
        {vadePillText ? (
          <View style={styles.pillWrap}>
            <Text style={[styles.pill, { backgroundColor: vc.bg, color: vc.fg }]}>
              {vadePillText}
            </Text>
          </View>
        ) : null}

        {/* ---- Kategori (bağlamda kullanılmadıysa kendi satırında) ---- */}
        {categoryUpper ? (
          <Text style={styles.categoryLine} numberOfLines={1}>
            {categoryUpper}
          </Text>
        ) : null}

        {/* ---- Ürün kalemleri ---- */}
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

        {/* ---- Not (açıklama) ---- */}
        {tertiaryText ? (
          <Text style={styles.noteText}>
            {tertiaryText}
          </Text>
        ) : null}

        {/* ---- Opsiyonel bağlam (hesap adı) ---- */}
        {hesapText ? (
          <Text style={styles.noteText} numberOfLines={1}>
            {hesapText}
          </Text>
        ) : null}
      </View>

      {/* Ödendi / Tahsil edildi damgası — kapanmış fatura (kullanıcı isteği) */}
      {paidStamp ? (
        <View style={styles.stamp}>
          <Text style={styles.stampText} numberOfLines={2}>
            {paidStamp === 'tahsil'
              ? t('transactions:vade.tahsilDamga')
              : t('transactions:vade.odendiDamga')}
          </Text>
        </View>
      ) : null}

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
          <Text style={[styles.amountText, { color: txColor }, paidStamp ? styles.amountPaid : null]}>
            {prefix}{formattedAmount}
          </Text>
        </View>
        {subAmount && (
          <Text style={styles.subAmountText}>{subAmount}</Text>
        )}
        {runningBalanceText ? (
          <Text
            style={[styles.runningBalanceText, runningBalanceNegative ? styles.runningBalanceNeg : null]}
            numberOfLines={1}
          >
            {runningBalanceText}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}, (prev, next) => {
  return prev.id === next.id
    && prev.amount === next.amount
    && prev.type === next.type
    && prev.date === next.date
    && prev.entityAsPrimary === next.entityAsPrimary
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
    && prev.vadeState === next.vadeState
    && prev.paidStamp === next.paidStamp
    && prev.runningBalanceText === next.runningBalanceText
    && prev.runningBalanceNegative === next.runningBalanceNegative;
});

// ============================================================================
// DATE SECTION HEADER — gün ayracı (chip yok, sola dayalı, büyük punto)
// ============================================================================

export interface DateSectionHeaderProps {
  title: string;
}

export function DateSectionHeader({ title }: DateSectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const BAR_WIDTH = 4;

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingLeft: spacing.lg,       // içerik bar'dan sonra başlar
    paddingRight: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
    gap: spacing.md,
  },
  bar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: BAR_WIDTH,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  content: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },

  // 1. satır
  l1: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  primaryName: {
    fontSize: 15,
    fontWeight: fontWeight.bold,
    color: colors.text,
    letterSpacing: 0.1,
  },
  primaryType: {
    fontSize: 15,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.3,
    flexShrink: 0,
  },
  ctxEntity: {
    fontSize: 13.5,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    flexShrink: 1,
  },
  ctxCategory: {
    fontSize: 12.5,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  sep: {
    fontSize: 13,
    color: colors.textMuted,
    marginHorizontal: 5,
  },

  // 2. satır
  l2: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeSmall: {
    fontSize: 12.5,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.3,
    flexShrink: 0,
  },
  dateText: {
    fontSize: 13,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  creatorText: {
    fontSize: 12.5,
    fontWeight: fontWeight.medium,
    color: colors.primary,
    flexShrink: 1,
  },

  // vade/taksit pill
  pillWrap: {
    flexDirection: 'row',
    marginTop: 4,
  },
  pill: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
    letterSpacing: 0.1,
    flexShrink: 1,
  },

  // kategori / hesap satırı
  categoryLine: {
    fontSize: 12.5,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
  noteText: {
    fontSize: 12.5,
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

  // tutar
  // Ödendi/tahsil damgası — hafif eğik yeşil çerçeveli rozet (kauçuk damga hissi)
  stamp: {
    borderWidth: 1.5,
    borderColor: colors.success,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    transform: [{ rotate: '-8deg' }],
    opacity: 0.9,
    maxWidth: 92,
    alignSelf: 'center',
  },
  stampText: {
    fontSize: 10.5,
    fontWeight: fontWeight.bold,
    color: colors.success,
    letterSpacing: 0.8,
    textAlign: 'center',
    lineHeight: 13,
  },
  amountPaid: {
    opacity: 0.5,
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
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  subAmountText: {
    fontSize: 11,
    fontWeight: fontWeight.normal,
    color: colors.textMuted,
    marginTop: 1,
  },
  // Yürüyen bakiye — tutar altında, sağa dayalı, sakin gri (borç yönünde kırmızı)
  runningBalanceText: {
    fontSize: 11.5,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  runningBalanceNeg: {
    color: colors.error,
  },

  // Gün ayracı — chip yok, sola dayalı, 14px kalın (eskiden 11px pill içindeydi)
  sectionHeader: {
    paddingTop: 15,
    paddingBottom: 5,
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    letterSpacing: 0.2,
  },
});
