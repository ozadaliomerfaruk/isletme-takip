/**
 * PendingTransactionForm
 *
 * QuickTransactionBar-style form for editing pending (skipped) transactions from import.
 * Pre-fills detected values and shows "Algilanamadi" badge for missing required fields.
 *
 * Orchestrator component composing:
 * - usePendingFormState (all form state, animation, keyboard, entity data)
 * - usePendingFormSave (save/skip business logic)
 * - EntityPickerModal (reusable bottom-sheet picker)
 * - PendingTransactionForm.types (constants, types)
 */

import React, { useCallback } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Animated,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Platform,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Calendar,
  X,
  ChevronDown,
  Building2,
  Users,
  Wallet,
  UserCheck,
  ArrowRight,
  Check,
  AlertTriangle,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import DateTimePickerRN from '@react-native-community/datetimepicker';

import { Text, CategoryPicker } from '@/components/ui';
import { colors } from '@/constants/colors';
import { formatCurrency } from '@/lib/currency';
import { useDateFormat } from '@/hooks/useDateFormat';
import type { PendingIslem } from '@/types/database';

import { ISLEM_TYPES, getTypeColor, getTypeLabel } from './PendingTransactionForm.types';
import { usePendingFormState } from './usePendingFormState';
import { usePendingFormSave } from './usePendingFormSave';
import { EntityPickerModal, EntityPickerItem } from './EntityPickerModal';

export interface PendingTransactionFormProps {
  visible: boolean;
  onDismiss: () => void;
  pendingIslem: PendingIslem | null;
  onSuccess?: () => void;
}

export function PendingTransactionForm({
  visible,
  onDismiss,
  pendingIslem,
  onSuccess,
}: PendingTransactionFormProps) {
  const { t } = useTranslation(['transactions', 'common', 'settings', 'accounts', 'clients', 'staff']);
  const { formatDateMedium, locale } = useDateFormat();
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get('window').height;

  const form = usePendingFormState({ pendingIslem, visible, onDismiss });
  const { handleSave, handleSkip } = usePendingFormSave();

  // Save handler
  const onSave = useCallback(() => {
    handleSave({
      pendingIslem,
      type: form.type,
      amount: form.amount,
      description: form.description,
      safeDate: form.safeDate,
      hesapId: form.hesapId,
      hedefHesapId: form.hedefHesapId,
      kategoriId: form.kategoriId,
      cariId: form.cariId,
      personelId: form.personelId,
      setIsSaving: form.setIsSaving,
      handleDismiss: form.handleDismiss,
      onSuccess,
    });
  }, [handleSave, pendingIslem, form, onSuccess]);

  // Skip handler
  const onSkip = useCallback(() => {
    handleSkip(pendingIslem, form.handleDismiss, onSuccess);
  }, [handleSkip, pendingIslem, form.handleDismiss, onSuccess]);

  // Backdrop press with haptics
  const onBackdropPress = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    form.handleBackdropPress();
  }, [form]);

  // Build entity picker items
  const hesapItems: EntityPickerItem[] = (form.filteredHesaplar || []).map((h) => ({
    id: h.id,
    label: h.name,
    balance: formatCurrency(h.balance, h.currency),
  }));

  const hedefHesapItems: EntityPickerItem[] = (form.filteredHesaplar || [])
    .filter((h) => h.id !== form.hesapId)
    .map((h) => ({
      id: h.id,
      label: h.name,
      balance: formatCurrency(h.balance, h.currency),
    }));

  const cariItems: EntityPickerItem[] = (form.filteredCariler || []).map((c) => ({
    id: c.id,
    label: c.name,
    balance: formatCurrency(c.balance, c.currency),
  }));

  const personelItems: EntityPickerItem[] = (form.filteredPersonel || []).map((p) => ({
    id: p.id,
    label: `${p.first_name} ${p.last_name || ''}`.trim(),
  }));

  // Determine cari picker context
  const isCustomerType =
    ['cari_satis', 'cari_satis_iade', 'cari_tahsilat'].includes(form.type) ||
    (form.type === 'cari_alis' && form.isCustomerVariantSelected);

  if (!visible || !pendingIslem) return null;

  const buttonColor = getTypeColor(form.type, form.isCustomerVariantSelected);
  const cardBottom = form.keyboardHeight > 0 ? form.keyboardHeight : insets.bottom + 10;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={onBackdropPress}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      {/* Card */}
      <Animated.View
        style={[
          styles.card,
          {
            bottom: cardBottom,
            opacity: form.opacity,
            transform: [{ translateY: form.translateY }],
          },
        ]}
      >
        {/* Skip reason banner */}
        <View style={styles.skipReasonBanner}>
          <AlertTriangle size={14} color={colors.warning} />
          <Text style={styles.skipReasonText} numberOfLines={1}>
            {t('settings:dataImport.labels.row')} {pendingIslem.row_number}: {pendingIslem.skip_reason}
          </Text>
          <TouchableOpacity onPress={form.handleDismiss} style={styles.closeButton}>
            <X size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Row 1: Date + Type */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => form.setShowDatePicker(true)}
          >
            <Calendar size={18} color={colors.textMuted} />
            <Text style={styles.dateText}>{formatDateMedium(form.safeDate)}</Text>
            {!form.isDetected('date') && <NotDetectedBadge t={t} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.typeButton, { borderColor: buttonColor }]}
            onPress={() => form.setShowTypePicker(true)}
          >
            <Text style={[styles.typeText, { color: buttonColor }]}>
              {getTypeLabel(form.type, form.isCustomerVariantSelected, t)}
            </Text>
            <ChevronDown size={16} color={buttonColor} />
          </TouchableOpacity>
        </View>

        {/* Hesap Picker */}
        <TouchableOpacity
          style={[
            styles.pickerButton,
            form.needsCorrection.hesap && !form.hesapId && styles.pickerButtonWarning,
          ]}
          onPress={() => form.setShowHesapPicker(true)}
        >
          <Wallet size={18} color={form.selectedHesap ? colors.primary : colors.textMuted} />
          <Text style={[styles.pickerButtonText, !form.selectedHesap && { color: colors.textMuted }]}>
            {form.selectedHesap?.name || t('transactions:form.accountPlaceholder')}
          </Text>
          {form.needsCorrection.hesap && !form.hesapId && <NotDetectedBadge t={t} />}
          <ChevronDown size={18} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Hedef Hesap - only for transfer */}
        {form.type === 'transfer' && (
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => form.setShowHedefHesapPicker(true)}
          >
            <ArrowRight size={18} color={colors.info} />
            <Text style={[styles.pickerButtonText, !form.selectedHedefHesap && { color: colors.textMuted }]}>
              {form.selectedHedefHesap?.name || t('transactions:form.targetAccount')}
            </Text>
            <ChevronDown size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Cari Picker */}
        {['cari_odeme', 'cari_tahsilat', 'cari_alis', 'cari_satis', 'cari_alis_iade', 'cari_satis_iade', 'baslangic_bakiyesi'].includes(form.type) && (
          <TouchableOpacity
            style={[
              styles.pickerButton,
              form.needsCorrection.cari && !form.cariId && styles.pickerButtonWarning,
            ]}
            onPress={() => form.setShowCariPicker(true)}
          >
            {isCustomerType ? (
              <Users size={18} color={form.selectedCari ? colors.primary : colors.textMuted} />
            ) : (
              <Building2 size={18} color={form.selectedCari ? colors.orange : colors.textMuted} />
            )}
            <Text style={[styles.pickerButtonText, !form.selectedCari && { color: colors.textMuted }]}>
              {form.selectedCari?.name ||
                (isCustomerType
                  ? t('clients:transactionForm.selectCustomer')
                  : t('clients:transactionForm.selectSupplier'))}
            </Text>
            {form.needsCorrection.cari && !form.cariId && <NotDetectedBadge t={t} />}
            <ChevronDown size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Personel Picker */}
        {['personel_gider', 'personel_odeme', 'personel_tahsilat', 'personel_satis', 'baslangic_bakiyesi'].includes(form.type) && (
          <TouchableOpacity
            style={[
              styles.pickerButton,
              form.needsCorrection.personel && !form.personelId && styles.pickerButtonWarning,
            ]}
            onPress={() => form.setShowPersonelPicker(true)}
          >
            <UserCheck size={18} color={form.selectedPersonel ? colors.success : colors.textMuted} />
            <Text style={[styles.pickerButtonText, !form.selectedPersonel && { color: colors.textMuted }]}>
              {form.selectedPersonel
                ? `${form.selectedPersonel.first_name} ${form.selectedPersonel.last_name || ''}`.trim()
                : t('staff:transactionForm.selectPersonel')}
            </Text>
            {form.needsCorrection.personel && !form.personelId && <NotDetectedBadge t={t} />}
            <ChevronDown size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Category Picker */}
        {form.categoryType && (
          <View style={styles.categoryWrapper}>
            <CategoryPicker
              value={form.kategoriId}
              onChange={form.setKategoriId}
              type={form.categoryType}
              label=""
              placeholder={t('common:select.selectCategory')}
              open={form.categoryPickerOpen}
              onOpenChange={form.setCategoryPickerOpen}
            />
          </View>
        )}

        {/* Description */}
        <TextInput
          style={styles.descriptionInput}
          placeholder={t('common:placeholders.enterNote')}
          placeholderTextColor={colors.textMuted}
          value={form.description}
          onChangeText={form.setDescription}
          maxLength={500}
          multiline
          numberOfLines={2}
          textAlignVertical="top"
        />

        {/* Amount + Save */}
        <View style={styles.amountRow}>
          <TextInput
            ref={form.amountInputRef}
            style={styles.amountInput}
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            value={form.amount}
            onChangeText={form.handleAmountChange}
            keyboardType="decimal-pad"
            maxLength={15}
          />
          <TouchableOpacity style={styles.skipButtonSmall} onPress={onSkip}>
            <Text style={styles.skipButtonText}>{t('common:buttons.skip')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.saveButton,
              { backgroundColor: buttonColor },
              form.isSaving && styles.saveButtonDisabled,
            ]}
            onPress={onSave}
            disabled={form.isSaving}
          >
            <Text style={styles.saveButtonText}>
              {form.isSaving ? '...' : t('common:buttons.save')}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Date Picker Modal */}
      {form.showDatePicker && (
        <Modal visible transparent animationType="fade">
          <TouchableWithoutFeedback onPress={() => form.setShowDatePicker(false)}>
            <View style={styles.pickerBackdrop}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={styles.pickerContainer}>
                  <Text style={styles.pickerTitle}>{t('transactions:form.dateTime')}</Text>
                  <DateTimePickerRN
                    value={form.safeDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, selectedDate) => {
                      if (Platform.OS === 'android') {
                        form.setShowDatePicker(false);
                        if (event.type === 'set' && selectedDate) {
                          form.setDate(selectedDate);
                        }
                      } else if (selectedDate) {
                        form.setDate(selectedDate);
                      }
                    }}
                    locale={locale}
                    textColor={colors.text}
                    themeVariant="light"
                    style={styles.datePickerStyle}
                  />
                  <TouchableOpacity
                    style={styles.pickerDoneButton}
                    onPress={() => form.setShowDatePicker(false)}
                  >
                    <Text style={styles.pickerDoneText}>{t('common:buttons.done')}</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {/* Type Picker Modal */}
      {form.showTypePicker && (
        <TypePickerModal
          type={form.type}
          isCustomerVariantSelected={form.isCustomerVariantSelected}
          onSelect={(value, isCustomerVar) => {
            form.setType(value);
            form.setIsCustomerVariantSelected(isCustomerVar);
            form.setShowTypePicker(false);
          }}
          onClose={() => form.setShowTypePicker(false)}
          windowHeight={windowHeight}
          bottomInset={insets.bottom}
          t={t}
        />
      )}

      {/* Hesap Picker */}
      <EntityPickerModal
        visible={form.showHesapPicker}
        title={t('transactions:form.accountPlaceholder')}
        items={hesapItems}
        selectedId={form.hesapId}
        onSelect={(id) => {
          form.setHesapId(id);
          form.setShowHesapPicker(false);
          form.setHesapSearch('');
        }}
        onClose={() => { form.setShowHesapPicker(false); form.setHesapSearch(''); }}
        searchValue={form.hesapSearch}
        onSearchChange={form.setHesapSearch}
        renderIcon={(_item, _isSelected) => (
          <View style={[styles.bottomSheetItemIcon, { backgroundColor: colors.infoLight }]}>
            <Wallet size={20} color={colors.info} />
          </View>
        )}
        selectedColor={colors.info}
      />

      {/* Hedef Hesap Picker */}
      <EntityPickerModal
        visible={form.showHedefHesapPicker}
        title={t('transactions:form.targetAccount')}
        items={hedefHesapItems}
        selectedId={form.hedefHesapId}
        onSelect={(id) => {
          form.setHedefHesapId(id);
          form.setShowHedefHesapPicker(false);
          form.setHesapSearch('');
        }}
        onClose={() => { form.setShowHedefHesapPicker(false); form.setHesapSearch(''); }}
        searchValue={form.hesapSearch}
        onSearchChange={form.setHesapSearch}
        renderIcon={(_item, _isSelected) => (
          <View style={[styles.bottomSheetItemIcon, { backgroundColor: colors.infoLight }]}>
            <ArrowRight size={20} color={colors.info} />
          </View>
        )}
        selectedColor={colors.info}
      />

      {/* Cari Picker */}
      <EntityPickerModal
        visible={form.showCariPicker}
        title={
          isCustomerType
            ? t('clients:transactionForm.selectCustomer')
            : t('clients:transactionForm.selectSupplier')
        }
        items={cariItems}
        selectedId={form.cariId}
        onSelect={(id) => {
          form.setCariId(id);
          form.setShowCariPicker(false);
          form.setCariSearch('');
        }}
        onClose={() => { form.setShowCariPicker(false); form.setCariSearch(''); }}
        searchValue={form.cariSearch}
        onSearchChange={form.setCariSearch}
        renderIcon={(_item, _isSelected) => {
          const iconColor = isCustomerType ? colors.primary : colors.orange;
          const iconBgColor = isCustomerType ? colors.primaryLight : colors.orangeLight;
          return (
            <View style={[styles.bottomSheetItemIcon, { backgroundColor: iconBgColor }]}>
              {isCustomerType ? (
                <Users size={20} color={iconColor} />
              ) : (
                <Building2 size={20} color={iconColor} />
              )}
            </View>
          );
        }}
        selectedColor={isCustomerType ? colors.primary : colors.orange}
      />

      {/* Personel Picker */}
      <EntityPickerModal
        visible={form.showPersonelPicker}
        title={t('staff:transactionForm.selectPersonel')}
        items={personelItems}
        selectedId={form.personelId}
        onSelect={(id) => {
          form.setPersonelId(id);
          form.setShowPersonelPicker(false);
          form.setPersonelSearch('');
        }}
        onClose={() => { form.setShowPersonelPicker(false); form.setPersonelSearch(''); }}
        searchValue={form.personelSearch}
        onSearchChange={form.setPersonelSearch}
        renderIcon={(_item, _isSelected) => (
          <View style={[styles.bottomSheetItemIcon, { backgroundColor: colors.successLight }]}>
            <UserCheck size={20} color={colors.success} />
          </View>
        )}
        selectedColor={colors.success}
      />
    </Modal>
  );
}

// =====================================================
// NotDetectedBadge
// =====================================================

function NotDetectedBadge({ t }: { t: (key: string) => string }) {
  return (
    <View style={styles.notDetectedBadge}>
      <AlertTriangle size={10} color={colors.warning} />
      <Text style={styles.notDetectedText}>
        {t('settings:dataImport.pendingForm.notDetected')}
      </Text>
    </View>
  );
}

// =====================================================
// TypePickerModal (grouped type list with icons)
// =====================================================

interface TypePickerModalProps {
  type: string;
  isCustomerVariantSelected: boolean;
  onSelect: (value: any, isCustomerVar: boolean) => void;
  onClose: () => void;
  windowHeight: number;
  bottomInset: number;
  t: (key: string) => string;
}

function TypePickerModal({
  type,
  isCustomerVariantSelected,
  onSelect,
  onClose,
  windowHeight,
  bottomInset,
  t,
}: TypePickerModalProps) {
  const groups = [
    { key: 'basic', label: t('transactions:groups.basic'), Icon: null },
    { key: 'supplier', label: t('transactions:groups.supplier'), Icon: Building2 },
    { key: 'customer', label: t('transactions:groups.customer'), Icon: Users },
    { key: 'staff', label: t('transactions:groups.staff'), Icon: UserCheck },
  ];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.bottomSheetOverlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={[styles.bottomSheetContent, { height: windowHeight * 0.75, paddingBottom: bottomInset }]}>
              <View style={styles.bottomSheetHeader}>
                <Text style={styles.bottomSheetTitle}>{t('transactions:titles.selectType')}</Text>
                <TouchableOpacity onPress={onClose} style={styles.bottomSheetCloseBtn}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <ScrollView
                style={styles.bottomSheetList}
                contentContainerStyle={styles.typeListContent}
                showsVerticalScrollIndicator={false}
              >
                {groups.map((group) => (
                  <React.Fragment key={group.key}>
                    <Text style={styles.typeGroupHeader}>{group.label}</Text>
                    {ISLEM_TYPES.filter((item) => item.group === group.key).map((item, index) => {
                      const isSelected =
                        group.key === 'customer'
                          ? type === item.value && (item.isCustomerVariant === isCustomerVariantSelected || !item.isCustomerVariant)
                          : group.key === 'supplier'
                            ? type === item.value && !isCustomerVariantSelected
                            : type === item.value;

                      const GroupIcon = group.Icon;

                      return (
                        <TouchableOpacity
                          key={`${group.key}-${item.value}-${index}`}
                          style={[styles.typeItem, isSelected && styles.typeItemSelected]}
                          onPress={() => onSelect(item.value, item.isCustomerVariant === true)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.typeItemLeft}>
                            <View style={[styles.typeIconContainer, { backgroundColor: item.color + '20' }]}>
                              {GroupIcon ? (
                                <GroupIcon size={20} color={item.color} />
                              ) : (
                                <View style={[styles.typeIconDot, { backgroundColor: item.color }]} />
                              )}
                            </View>
                            <Text style={[styles.typeItemText, isSelected && { color: item.color, fontWeight: '600' }]}>
                              {t(item.labelKey)}
                            </Text>
                          </View>
                          {isSelected && (
                            <View style={[styles.checkIcon, { backgroundColor: item.color }]}>
                              <Check size={14} color="#FFFFFF" />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </React.Fragment>
                ))}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  card: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 16,
  },
  skipReasonBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningLight,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  skipReasonText: {
    flex: 1,
    fontSize: 12,
    color: colors.warning,
    fontWeight: '500',
  },
  closeButton: {
    padding: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  dateButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
  },
  dateText: {
    fontSize: 14,
    color: colors.text,
  },
  typeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
  },
  typeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    marginBottom: 8,
  },
  pickerButtonWarning: {
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.warningLight + '30',
  },
  pickerButtonText: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  notDetectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.warningLight,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  notDetectedText: {
    fontSize: 10,
    color: colors.warning,
    fontWeight: '600',
  },
  categoryWrapper: {
    marginBottom: 4,
  },
  descriptionInput: {
    fontSize: 15,
    color: colors.text,
    paddingVertical: 10,
    paddingHorizontal: 0,
    marginBottom: 8,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 56,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'left',
    paddingVertical: 8,
  },
  skipButtonSmall: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  skipButtonText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  saveButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Picker Modal Styles
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  datePickerStyle: {
    height: 150,
  },
  pickerDoneButton: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: 'center',
  },
  pickerDoneText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Bottom Sheet Styles (shared by TypePickerModal and entity icon rendering)
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheetContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  bottomSheetCloseBtn: {
    padding: 4,
  },
  bottomSheetList: {
    flex: 1,
  },
  bottomSheetItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Type Picker Styles
  typeListContent: {
    padding: 16,
    paddingBottom: 32,
  },
  typeGroupHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 4,
  },
  typeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: colors.surfaceLighter,
    borderRadius: 12,
    marginBottom: 8,
  },
  typeItemSelected: {
    backgroundColor: colors.primaryLight + '30',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  typeItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  typeIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  typeIconDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  typeItemText: {
    fontSize: 15,
    color: colors.text,
    flex: 1,
  },
});
