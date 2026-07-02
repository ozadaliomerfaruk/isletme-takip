import { useRef, useState, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Bell, Package, Calculator } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text, CategoryPicker } from '@/components/ui';
import { parseCurrency, roundCurrency, formatAmountForInput } from '@/lib/currency';
import { useHaptics } from '@/hooks/useHaptics';
import { TransactionTypeTabs } from '../../TransactionTypeTabs';
import { PhotoButton } from '../../PhotoButton';
import { colors } from '@/constants/colors';
import { styles } from '../styles';
import type { TransactionType, TransactionTabMode } from '../types';

export interface AmountInputSectionProps {
  // Amount
  amount: string;
  onAmountChange: (value: string) => void;
  amountInputRef?: React.RefObject<TextInput | null>;
  // Description
  description: string;
  onDescriptionChange: (value: string) => void;
  // Category
  kategoriId: string | null;
  onKategoriChange: (id: string | null) => void;
  categoryType: 'gelir' | 'gider' | null;
  categoryPickerOpen: boolean;
  onCategoryPickerOpenChange: (open: boolean) => void;
  onNavigateAway: () => void;
  // Photo
  hasPhoto: boolean;
  onPickImage: () => void;
  onTakePhoto: () => void;
  onRemovePhoto: () => void;
  onViewPhoto?: () => void;
  photoLoading?: boolean;
  // Scheduled
  isScheduled: boolean;
  // Save
  isSaving: boolean;
  buttonColor: string;
  buttonLabel: string;
  onSave: () => void;
  // Transaction type tabs
  type: TransactionType;
  onTypeChange: (type: TransactionType) => void;
  tabMode: TransactionTabMode;
  // Urun
  showUrunButton?: boolean;
  urunItemCount?: number;
  onUrunButtonPress?: () => void;
}

export function AmountInputSection({
  amount,
  onAmountChange,
  amountInputRef,
  description,
  onDescriptionChange,
  kategoriId,
  onKategoriChange,
  categoryType,
  categoryPickerOpen,
  onCategoryPickerOpenChange,
  onNavigateAway,
  hasPhoto,
  onPickImage,
  onTakePhoto,
  onRemovePhoto,
  onViewPhoto,
  photoLoading,
  isScheduled,
  isSaving,
  buttonColor,
  buttonLabel,
  onSave,
  type,
  onTypeChange,
  tabMode,
  showUrunButton,
  urunItemCount = 0,
  onUrunButtonPress,
}: AmountInputSectionProps) {
  const { t } = useTranslation(['common', 'transactions']);
  const localAmountRef = useRef<TextInput>(null);
  const inputRef = amountInputRef || localAmountRef;
  const haptics = useHaptics();

  // Hızlı hesap makinesi — tutar üzerinde zincirleme +/−/×/÷ (self-contained, parent'a dokunmaz).
  const [calcOpen, setCalcOpen] = useState(false);
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<'+' | '-' | '*' | '/' | null>(null);
  // pressOperator'ın kendi yaptığı temizlemeyi, dışarıdan (form reset) gelen temizlemeden ayır.
  const clearedByOpRef = useRef(false);

  // Tutar DIŞARIDAN temizlenirse (form reset vb.) bekleyen hesabı da sıfırla.
  useEffect(() => {
    if (amount === '') {
      if (clearedByOpRef.current) clearedByOpRef.current = false;
      else {
        setAcc(null);
        setOp(null);
      }
    }
  }, [amount]);

  const parseAmt = (s: string) => {
    const n = parseCurrency(s);
    return Number.isFinite(n) ? n : 0;
  };
  const applyOp = (a: number, o: '+' | '-' | '*' | '/', b: number) => {
    let r: number;
    if (o === '+') r = a + b;
    else if (o === '-') r = a - b;
    else if (o === '*') r = a * b;
    else r = b === 0 ? a : a / b; // sıfıra bölme: mevcut değeri koru
    return roundCurrency(Number.isFinite(r) ? r : 0);
  };
  const opSymbol = (o: '+' | '-' | '*' | '/') =>
    o === '+' ? '+' : o === '-' ? '−' : o === '*' ? '×' : '÷';

  const pressOperator = (nextOp: '+' | '-' | '*' | '/') => {
    haptics.light();
    const cur = parseAmt(amount);
    let newAcc: number;
    if (op !== null && acc !== null && amount.trim() !== '') {
      newAcc = applyOp(acc, op, cur); // zincir: bekleyeni önce hesapla
    } else if (acc === null) {
      newAcc = cur;
    } else {
      newAcc = acc; // alan boş: sadece operatörü değiştir
    }
    setAcc(newAcc);
    setOp(nextOp);
    clearedByOpRef.current = true;
    onAmountChange(''); // sonraki operand için tutar alanını temizle
  };

  const pressEquals = () => {
    if (op === null || acc === null) return;
    haptics.light();
    const cur = amount.trim() === '' ? acc : parseAmt(amount);
    onAmountChange(formatAmountForInput(applyOp(acc, op, cur)));
    setAcc(null);
    setOp(null);
  };

  const clearCalc = () => {
    haptics.light();
    setAcc(null);
    setOp(null);
    clearedByOpRef.current = true;
    onAmountChange('');
  };

  const toggleCalc = () => {
    setCalcOpen((v) => !v);
    setAcc(null); // aç/kapa'da bekleyen hesabı sıfırla (temiz başlangıç)
    setOp(null);
    inputRef.current?.focus();
  };

  return (
    <>
      {/* Category Picker - tüm işlem tiplerinde */}
      {categoryType && (
        <View style={styles.categoryWrapper}>
          <CategoryPicker
            value={urunItemCount > 0 ? null : kategoriId}
            onChange={onKategoriChange}
            type={categoryType}
            label=""
            placeholder={t('common:select.selectCategory')}
            disabled={urunItemCount > 0}
            disabledMessage={t('transactions:stock.categoryDisabledByProducts')}
            onNavigateAway={onNavigateAway}
            open={categoryPickerOpen}
            onOpenChange={onCategoryPickerOpenChange}
          />
        </View>
      )}

      {/* Description */}
      <TextInput
        style={styles.descriptionInput}
        placeholder={t('common:placeholders.enterNote')}
        placeholderTextColor={colors.textMuted}
        value={description}
        onChangeText={onDescriptionChange}
        maxLength={500}
        multiline
        numberOfLines={2}
        textAlignVertical="top"
      />

      {/* Amount + Save */}
      <View style={styles.amountRow}>
        {/* Hızlı hesap makinesi aç/kapa ikonu */}
        <TouchableOpacity
          style={[localStyles.calcToggle, calcOpen && localStyles.calcToggleActive]}
          onPress={toggleCalc}
          disabled={isSaving}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
        >
          <Calculator size={20} color={calcOpen ? colors.success : colors.textMuted} />
        </TouchableOpacity>

        <TextInput
          ref={inputRef}
          style={styles.amountInput}
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          value={amount}
          onChangeText={onAmountChange}
          keyboardType="decimal-pad"
          maxLength={15}
        />

        {isScheduled && (
          <View style={styles.scheduledBellIcon}>
            <Bell size={20} color={colors.warning} />
          </View>
        )}

        <PhotoButton
          hasPhoto={hasPhoto}
          onPickImage={onPickImage}
          onTakePhoto={onTakePhoto}
          onRemovePhoto={onRemovePhoto}
          onViewPhoto={onViewPhoto}
          loading={photoLoading}
          disabled={isSaving}
          size="small"
        />

        {/* Urun Button - only show when hasUrunler and type is alis/satis/alis_iade/satis_iade */}
        {showUrunButton && onUrunButtonPress && (
          <TouchableOpacity
            style={localStyles.urunButton}
            onPress={onUrunButtonPress}
            disabled={isSaving}
          >
            <Package size={18} color={colors.primary} />
            <Text style={localStyles.urunButtonText}>
              {t('transactions:stock.stockButton')}
            </Text>
            {urunItemCount > 0 && (
              <View style={localStyles.urunBadge}>
                <Text style={localStyles.urunBadgeText}>{urunItemCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[
            styles.saveButton,
            { backgroundColor: buttonColor },
            isSaving && styles.saveButtonDisabled,
          ]}
          onPress={onSave}
          disabled={isSaving}
        >
          <Text style={styles.saveButtonText}>{isSaving ? '...' : buttonLabel}</Text>
        </TouchableOpacity>
      </View>

      {/* Type Tabs */}
      <TransactionTypeTabs value={type} onChange={onTypeChange} mode={tabMode} />

      {/* Hızlı hesap makinesi operatör satırı (ikonla açılır) — tutar üzerinde zincirleme işlem */}
      {calcOpen && (
        <View style={localStyles.calcWrap}>
          {op !== null && acc !== null && (
            <Text style={localStyles.calcHint}>
              {formatAmountForInput(acc)} {opSymbol(op)}
            </Text>
          )}
          <View style={localStyles.calcRow}>
            <TouchableOpacity style={localStyles.calcBtn} onPress={clearCalc} accessibilityRole="button">
              <Text style={localStyles.calcBtnText}>C</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[localStyles.calcBtn, op === '+' && localStyles.calcBtnActive]}
              onPress={() => pressOperator('+')}
              accessibilityRole="button"
            >
              <Text style={localStyles.calcBtnText}>+</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[localStyles.calcBtn, op === '-' && localStyles.calcBtnActive]}
              onPress={() => pressOperator('-')}
              accessibilityRole="button"
            >
              <Text style={localStyles.calcBtnText}>−</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[localStyles.calcBtn, op === '*' && localStyles.calcBtnActive]}
              onPress={() => pressOperator('*')}
              accessibilityRole="button"
            >
              <Text style={localStyles.calcBtnText}>×</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[localStyles.calcBtn, op === '/' && localStyles.calcBtnActive]}
              onPress={() => pressOperator('/')}
              accessibilityRole="button"
            >
              <Text style={localStyles.calcBtnText}>÷</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[localStyles.calcBtn, localStyles.calcEquals]}
              onPress={pressEquals}
              accessibilityRole="button"
            >
              <Text style={localStyles.calcBtnText}>=</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </>
  );
}

const localStyles = StyleSheet.create({
  calcToggle: {
    padding: 6,
    borderRadius: 8,
  },
  calcToggleActive: {
    backgroundColor: colors.primaryLight,
  },
  calcWrap: {
    marginTop: 8,
  },
  calcHint: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'right',
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  calcRow: {
    flexDirection: 'row',
    backgroundColor: colors.success,
    borderRadius: 12,
    overflow: 'hidden',
  },
  calcBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.18)',
  },
  calcBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  calcEquals: {
    borderRightWidth: 0,
    backgroundColor: 'rgba(0,0,0,0.14)',
  },
  calcBtnText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  urunButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  urunButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  urunBadge: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: 2,
  },
  urunBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
