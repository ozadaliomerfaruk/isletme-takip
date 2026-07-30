import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import * as Contacts from 'expo-contacts';
import { ContactRound, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Modal, Text } from '@/components/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { borderRadius, HIT_SLOP, spacing } from '@/constants/spacing';
import {
  getPhoneValidationMessageKey,
  normalizePhoneForStorage,
} from '@/lib/phone';

export interface DeviceContactSelection {
  phone: string;
  name: string;
  company: string;
  firstName: string;
  lastName: string;
}

interface PhoneChoice {
  label: string;
  rawNumber: string;
}

interface DeviceContactPickerButtonProps {
  onSelect: (selection: DeviceContactSelection) => void;
  disabled?: boolean;
}

function toMinimalContact(contact: Contacts.ExistingContact): Omit<DeviceContactSelection, 'phone'> {
  return {
    name: contact.name?.trim() ?? '',
    company: contact.company?.trim() ?? '',
    firstName: contact.firstName?.trim() ?? '',
    lastName: contact.lastName?.trim() ?? '',
  };
}

function getPhoneChoices(contact: Contacts.ExistingContact): PhoneChoice[] {
  const seen = new Set<string>();
  const choices: PhoneChoice[] = [];

  for (const phone of contact.phoneNumbers ?? []) {
    const rawNumber = (phone.number ?? phone.digits ?? '').trim();
    if (!rawNumber) continue;
    const normalized = normalizePhoneForStorage(rawNumber);
    const comparisonKey = normalized.ok && normalized.value
      ? normalized.value
      : rawNumber;
    if (seen.has(comparisonKey)) continue;
    seen.add(comparisonKey);
    choices.push({
      rawNumber,
      label: phone.label?.trim() ?? '',
    });
  }

  return choices;
}

function PhoneChoiceSheetContent({
  choices,
  onChoose,
  onClose,
}: {
  choices: PhoneChoice[];
  onChoose: (choice: PhoneChoice) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('common');
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.sheetRoot}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('buttons.close')}
      />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text variant="h3" style={styles.sheetTitle}>
            {t('contactPicker.chooseNumber')}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={HIT_SLOP.md}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel={t('buttons.close')}
          >
            <X size={22} color={colors.textMuted} />
          </Pressable>
        </View>
        <ScrollView
          style={styles.choiceList}
          contentContainerStyle={styles.choiceListContent}
          showsVerticalScrollIndicator
        >
          {choices.map((choice, index) => (
            <Pressable
              key={`${choice.rawNumber}-${index}`}
              onPress={() => onChoose(choice)}
              style={({ pressed }) => [
                styles.choiceRow,
                pressed && styles.choiceRowPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={choice.rawNumber}
              accessibilityHint={choice.label || t('contactPicker.phoneOption', { index: index + 1 })}
            >
              <Text style={styles.choiceNumber}>{choice.rawNumber}</Text>
              <Text variant="caption" color="secondary">
                {choice.label || t('contactPicker.phoneOption', { index: index + 1 })}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function PhoneChoiceSheet({
  visible,
  choices,
  onChoose,
  onClose,
}: {
  visible: boolean;
  choices: PhoneChoice[];
  onChoose: (choice: PhoneChoice) => void;
  onClose: () => void;
}) {
  if (!visible) return null;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <PhoneChoiceSheetContent
        choices={choices}
        onChoose={onChoose}
        onClose={onClose}
      />
    </Modal>
  );
}

/**
 * Yalnız kullanıcının açık dokunuşuyla sistemin tek-kişi seçicisini açar.
 * Tüm rehberi sorgulamaz; contact id/e-posta/fotoğraf saklamaz veya loglamaz.
 */
export function DeviceContactPickerButton({
  onSelect,
  disabled = false,
}: DeviceContactPickerButtonProps) {
  const { t } = useTranslation('common');
  const isMountedRef = useRef(true);
  const [isPicking, setIsPicking] = useState(false);
  const [phoneChoices, setPhoneChoices] = useState<PhoneChoice[]>([]);
  const [pendingContact, setPendingContact] = useState<Omit<DeviceContactSelection, 'phone'> | null>(null);
  const [showPhoneSheet, setShowPhoneSheet] = useState(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const showPhoneError = useCallback((reason: 'extension' | 'invalid' | 'tooLong') => {
    Alert.alert(
      t('status.warning'),
      t(getPhoneValidationMessageKey(reason)),
    );
  }, [t]);

  const applyPhone = useCallback((
    rawNumber: string,
    contact: Omit<DeviceContactSelection, 'phone'>,
  ) => {
    const normalized = normalizePhoneForStorage(rawNumber);
    if (!normalized.ok) {
      showPhoneError(normalized.reason);
      return;
    }
    if (!normalized.value) {
      Alert.alert(t('contactPicker.noPhoneTitle'), t('contactPicker.noPhoneMessage'));
      return;
    }

    onSelect({
      ...contact,
      phone: normalized.value,
    });
  }, [onSelect, showPhoneError, t]);

  const handlePress = useCallback(async () => {
    if (disabled || isPicking || Platform.OS === 'web') return;

    Keyboard.dismiss();
    setIsPicking(true);

    try {
      const isAvailable = await Contacts.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert(t('contactPicker.unavailableTitle'), t('contactPicker.unavailableMessage'));
        return;
      }

      if (Platform.OS === 'android') {
        const currentPermission = await Contacts.getPermissionsAsync();
        let permissionStatus = currentPermission.status;

        if (permissionStatus !== 'granted') {
          if (currentPermission.canAskAgain === false) {
            Alert.alert(t('contactPicker.permissionTitle'), t('contactPicker.permissionDenied'));
            return;
          }
          const requestedPermission = await Contacts.requestPermissionsAsync();
          permissionStatus = requestedPermission.status;
        }

        if (permissionStatus !== 'granted') {
          Alert.alert(t('contactPicker.permissionTitle'), t('contactPicker.permissionDenied'));
          return;
        }
      }

      const contact = await Contacts.presentContactPickerAsync();
      if (!contact) return;

      const minimalContact = toMinimalContact(contact);
      const choices = getPhoneChoices(contact);
      if (choices.length === 0) {
        Alert.alert(t('contactPicker.noPhoneTitle'), t('contactPicker.noPhoneMessage'));
        return;
      }

      if (choices.length === 1) {
        applyPhone(choices[0].rawNumber, minimalContact);
        return;
      }

      // Native kişi seçici tamamen kapandıktan sonra RN sheet'i aç. iOS'taki
      // modal-üstü-modal geçiş yarışını engellemek için interaction sonunu bekle.
      InteractionManager.runAfterInteractions(() => {
        if (!isMountedRef.current) return;
        setPendingContact(minimalContact);
        setPhoneChoices(choices);
        setShowPhoneSheet(true);
      });
    } catch {
      Alert.alert(t('contactPicker.unavailableTitle'), t('contactPicker.unavailableMessage'));
    } finally {
      if (isMountedRef.current) setIsPicking(false);
    }
  }, [applyPhone, disabled, isPicking, t]);

  const closePhoneSheet = useCallback(() => {
    setShowPhoneSheet(false);
    setPhoneChoices([]);
    setPendingContact(null);
  }, []);

  if (Platform.OS === 'web') return null;

  return (
    <>
      <Pressable
        onPress={handlePress}
        disabled={disabled || isPicking}
        hitSlop={HIT_SLOP.md}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
          (disabled || isPicking) && styles.buttonDisabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('contactPicker.accessibilityLabel')}
        accessibilityHint={t('contactPicker.accessibilityHint')}
        accessibilityState={{ disabled: disabled || isPicking, busy: isPicking }}
      >
        {isPicking ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <ContactRound size={22} color={colors.primary} />
        )}
      </Pressable>

      <PhoneChoiceSheet
        visible={showPhoneSheet}
        choices={phoneChoices}
        onClose={closePhoneSheet}
        onChoose={(choice) => {
          if (pendingContact) {
            applyPhone(choice.rawNumber, pendingContact);
          }
          closePhoneSheet();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  sheet: {
    maxHeight: '70%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    paddingHorizontal: spacing.lg,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sheetHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceList: {
    flexGrow: 0,
    flexShrink: 1,
  },
  choiceListContent: {
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  choiceRow: {
    minHeight: 58,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceLight,
  },
  choiceRowPressed: {
    opacity: 0.72,
  },
  choiceNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
});
