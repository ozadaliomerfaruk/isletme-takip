import { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CheckCircle, AlertTriangle, PlusCircle, Trash2, ChevronDown, ChevronUp, List, Tag } from 'lucide-react-native';
import { Text, Card, CategoryPicker } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, HIT_SLOP } from '@/constants/spacing';
import { OcrParsedItem, MatchTier } from '@/types/ocrImport';
import { Urun } from '@/types/database';
import { formatCurrency, formatQuantity, parseCurrency } from '@/lib/currency';

interface OcrReviewItemProps {
  item: OcrParsedItem;
  index: number;
  onUpdate: (index: number, item: OcrParsedItem) => void;
  onRemove: (index: number) => void;
  onChangeProduct: (index: number) => void;
  matchedProduct: Urun | undefined;
  matchedKategoriName: string | null;
}

function MatchBadge({ tier }: { tier: MatchTier }) {
  const { t } = useTranslation('ocrImport');

  const config = {
    exact: { icon: CheckCircle, color: colors.success, bg: colors.successLight, label: t('review.matchBadge.exact') },
    suggestion: { icon: AlertTriangle, color: colors.warning, bg: colors.warningLight, label: t('review.matchBadge.suggestion') },
    new: { icon: PlusCircle, color: colors.info, bg: colors.infoLight, label: t('review.matchBadge.new') },
  }[tier];

  const Icon = config.icon;

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Icon size={12} color={config.color} />
      <Text variant="caption" style={{ color: config.color }}>{config.label}</Text>
    </View>
  );
}

export function OcrReviewItem({ item, index, onUpdate, onRemove, onChangeProduct, matchedProduct, matchedKategoriName }: OcrReviewItemProps) {
  const { t } = useTranslation(['ocrImport', 'products', 'transactions', 'common']);
  const [showRawLine, setShowRawLine] = useState(false);

  const [quantityText, setQuantityText] = useState(item.quantity ? item.quantity.toString().replace('.', ',') : '');
  const [unitPriceText, setUnitPriceText] = useState(item.unitPrice ? item.unitPrice.toString().replace('.', ',') : '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dışarıdan gelen değer değişince (ör: OCR yeniden parse) text'i güncelle
  useEffect(() => {
    setQuantityText(item.quantity ? item.quantity.toString().replace('.', ',') : '');
  }, [item.quantity]);
  useEffect(() => {
    setUnitPriceText(item.unitPrice ? item.unitPrice.toString().replace('.', ',') : '');
  }, [item.unitPrice]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const debouncedUpdate = useCallback((updated: OcrParsedItem) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onUpdate(index, updated);
    }, 300);
  }, [onUpdate, index]);

  const handleFieldChange = (field: keyof OcrParsedItem, value: string) => {
    // Locale-duyarlı parse (hem virgül hem nokta, binlik ayracı dahil)
    const numValue = parseCurrency(value) || 0;
    let updated = { ...item, userEdited: true };

    switch (field) {
      case 'name':
        updated = { ...updated, name: value };
        onUpdate(index, updated); // İsim değişikliği hemen yansımalı (ürün eşleştirme için)
        return;
      case 'quantity':
        setQuantityText(value);
        updated = { ...updated, quantity: numValue, totalPrice: numValue * item.unitPrice };
        break;
      case 'unitPrice':
        setUnitPriceText(value);
        updated = { ...updated, unitPrice: numValue, totalPrice: item.quantity * numValue };
        break;
    }

    debouncedUpdate(updated);
  };

  const isNewProduct = item.matchTier === 'new' || !item.matchedUrunId;

  return (
    <Card style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <Text variant="caption" color="secondary">#{index + 1}</Text>
        <MatchBadge tier={item.matchTier} />
        <TouchableOpacity onPress={() => onRemove(index)} hitSlop={HIT_SLOP.md}>
          <Trash2 size={16} color={colors.error} />
        </TouchableOpacity>
      </View>

      {/* Product name + Liste button */}
      <View style={styles.nameRow}>
        <TextInput
          style={styles.nameInput}
          value={item.name}
          onChangeText={(val) => handleFieldChange('name', val)}
          placeholder={t('products:stock.productName')}
          placeholderTextColor={colors.textMuted}
        />
        <TouchableOpacity style={styles.listButton} onPress={() => onChangeProduct(index)}>
          <List size={14} color={colors.primary} />
          <Text variant="caption" color="primary">{t('ocrImport:review.listButton')}</Text>
        </TouchableOpacity>
      </View>

      {/* Matched product info */}
      {matchedProduct && (
        <Text variant="caption" color="success" style={styles.matchInfo}>
          → {matchedProduct.ad} ({formatQuantity(matchedProduct.miktar)} {t(`products:units.${matchedProduct.birim}`)})
        </Text>
      )}

      {/* Category */}
      {isNewProduct ? (
        <View style={styles.categoryRow}>
          <CategoryPicker
            value={item.kategoriId}
            onChange={(kategoriId) => onUpdate(index, { ...item, kategoriId, userEdited: true })}
            label={t('ocrImport:review.category')}
            optional
          />
        </View>
      ) : matchedKategoriName ? (
        <View style={styles.categoryReadonly}>
          <Tag size={12} color={colors.textMuted} />
          <Text variant="caption" color="secondary">{matchedKategoriName}</Text>
        </View>
      ) : null}

      {/* Quantity, Unit Price, Total */}
      <View style={styles.inputsRow}>
        <View style={styles.inputGroup}>
          <Text variant="caption" color="secondary">{t('products:stock.quantity')}</Text>
          <TextInput
            style={styles.compactInput}
            value={quantityText}
            onChangeText={(val) => handleFieldChange('quantity', val)}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <View style={styles.inputGroup}>
          <Text variant="caption" color="secondary">{t('products:stock.unitPrice')}</Text>
          <TextInput
            style={styles.compactInput}
            value={unitPriceText}
            onChangeText={(val) => handleFieldChange('unitPrice', val)}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <View style={styles.inputGroup}>
          <Text variant="caption" color="secondary">{t('ocrImport:review.lineTotal')}</Text>
          <Text variant="body" style={styles.totalText}>
            {formatCurrency(item.totalPrice)}
          </Text>
        </View>
      </View>

      {/* Unit + VAT */}
      <View style={styles.metaRow}>
        {item.unitRaw ? (
          <Text variant="caption" color="secondary">
            {t('products:form.unit')}: {item.unitRaw}
          </Text>
        ) : null}
        {item.vatRate !== null && (
          <Text variant="caption" color="secondary">
            {t('common:tax.vat')}: %{item.vatRate}
          </Text>
        )}
      </View>

      {/* Raw OCR line toggle */}
      <TouchableOpacity
        style={styles.rawLineToggle}
        onPress={() => setShowRawLine(!showRawLine)}
      >
        <Text variant="caption" color="muted">OCR</Text>
        {showRawLine ? (
          <ChevronUp size={14} color={colors.textMuted} />
        ) : (
          <ChevronDown size={14} color={colors.textMuted} />
        )}
      </TouchableOpacity>
      {showRawLine && (
        <Text variant="caption" color="muted" style={styles.rawLine}>
          {item.rawLine}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  nameInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
  listButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  matchInfo: {
    marginBottom: spacing.sm,
    paddingLeft: spacing.sm,
  },
  categoryRow: {
    marginBottom: spacing.sm,
  },
  categoryReadonly: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
    paddingLeft: spacing.sm,
  },
  inputsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  inputGroup: {
    flex: 1,
    gap: 2,
  },
  compactInput: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    fontSize: 14,
    color: colors.text,
    textAlign: 'center',
  },
  totalText: {
    textAlign: 'center',
    fontWeight: '600',
    paddingVertical: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.xs,
  },
  rawLineToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rawLine: {
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
});
