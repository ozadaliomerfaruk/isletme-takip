import { useRef } from 'react';
import { View, TextInput, TouchableOpacity } from 'react-native';
import { Bell } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text, CategoryPicker } from '@/components/ui';
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
  photoLoading,
  isScheduled,
  isSaving,
  buttonColor,
  buttonLabel,
  onSave,
  type,
  onTypeChange,
  tabMode,
}: AmountInputSectionProps) {
  const { t } = useTranslation(['common']);
  const localAmountRef = useRef<TextInput>(null);
  const inputRef = amountInputRef || localAmountRef;

  return (
    <>
      {/* Category Picker - tüm işlem tiplerinde */}
      {categoryType && (
        <View style={styles.categoryWrapper}>
          <CategoryPicker
            value={kategoriId}
            onChange={onKategoriChange}
            type={categoryType}
            label=""
            placeholder={t('common:select.selectCategory')}
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
        maxLength={100}
      />

      {/* Amount + Save */}
      <View style={styles.amountRow}>
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

        {/* Photo Button */}
        <PhotoButton
          hasPhoto={hasPhoto}
          onPickImage={onPickImage}
          onTakePhoto={onTakePhoto}
          onRemovePhoto={onRemovePhoto}
          loading={photoLoading}
          disabled={isSaving}
          size="small"
        />

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
    </>
  );
}
