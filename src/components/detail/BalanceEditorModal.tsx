import { Modal, TouchableOpacity, View, TextInput, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import { Text, Button, BalanceDirectionSelector } from '@/components/ui';
import type { BalanceDirection } from '@/components/ui/BalanceDirectionSelector';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';

interface BalanceEditorModalProps {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  subtitle?: string;
  warning?: string;
  directionLabel: string;
  directionVariant: 'supplier' | 'customer' | 'staff' | 'account';
  balanceDirection: BalanceDirection;
  onDirectionChange: (direction: BalanceDirection) => void;
  inputLabel?: string;
  inputValue: string;
  onInputChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onSave: () => void;
  isSaving: boolean;
  cancelLabel: string;
  saveLabel: string;
  cancelVariant?: 'outline' | 'secondary';
}

export function BalanceEditorModal({
  visible,
  onDismiss,
  title,
  subtitle,
  warning,
  directionLabel,
  directionVariant,
  balanceDirection,
  onDirectionChange,
  inputLabel,
  inputValue,
  onInputChange,
  placeholder = '0',
  autoFocus = false,
  onSave,
  isSaving,
  cancelLabel,
  saveLabel,
  cancelVariant = 'secondary',
}: BalanceEditorModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onDismiss}
      >
        <View style={styles.content} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text variant="h3">{title}</Text>
            <TouchableOpacity onPress={onDismiss}>
              <X size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {subtitle && (
            <Text variant="caption" color="secondary" style={styles.subtitle}>
              {subtitle}
            </Text>
          )}

          {warning && (
            <Text variant="caption" color="secondary" style={styles.warning}>
              {warning}
            </Text>
          )}

          <View style={styles.fieldContainer}>
            <Text variant="label" style={{ marginBottom: spacing.xs }}>
              {directionLabel}
            </Text>
            <BalanceDirectionSelector
              value={balanceDirection}
              onChange={onDirectionChange}
              variant={directionVariant}
            />
          </View>

          <View style={inputLabel ? styles.fieldContainer : undefined}>
            {inputLabel && <Text variant="label">{inputLabel}</Text>}
            <TextInput
              style={styles.input}
              value={inputValue}
              onChangeText={onInputChange}
              keyboardType="decimal-pad"
              placeholder={placeholder}
              placeholderTextColor={colors.textMuted}
              autoFocus={autoFocus}
            />
          </View>

          <View style={styles.buttons}>
            <Button
              variant={cancelVariant}
              onPress={onDismiss}
              style={{ flex: 1 }}
            >
              {cancelLabel}
            </Button>
            <Button
              variant="primary"
              onPress={onSave}
              loading={isSaving}
              style={{ flex: 1 }}
            >
              {saveLabel}
            </Button>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  content: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 320,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  subtitle: {
    marginBottom: spacing.sm,
  },
  warning: {
    marginBottom: spacing.lg,
  },
  fieldContainer: {
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});
