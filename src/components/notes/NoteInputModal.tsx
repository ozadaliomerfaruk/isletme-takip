import { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';

interface NoteInputModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (content: string) => void;
  initialContent?: string;
  isEditing?: boolean;
  loading?: boolean;
}

export function NoteInputModal({
  visible,
  onClose,
  onSave,
  initialContent = '',
  isEditing = false,
  loading = false,
}: NoteInputModalProps) {
  const { t } = useTranslation(['common']);
  const [content, setContent] = useState(initialContent);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setContent(initialContent);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [visible, initialContent]);

  const handleSave = () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    onSave(trimmed);
  };

  const handleDismiss = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.backdrop} onPress={handleDismiss} />
        <View style={styles.container}>
          <View style={styles.header}>
            <Text variant="h3">
              {isEditing ? t('common:notes.editNote') : t('common:notes.addNote')}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={24} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView
            style={styles.inputScroll}
            keyboardShouldPersistTaps="handled"
          >
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder={t('common:notes.notePlaceholder')}
              placeholderTextColor={colors.textMuted}
              multiline
              value={content}
              onChangeText={setContent}
              textAlignVertical="top"
              scrollEnabled={false}
            />
          </ScrollView>
          <View style={styles.footer}>
            <Button
              variant="outline"
              size="md"
              onPress={onClose}
              style={styles.button}
            >
              {t('common:buttons.cancel')}
            </Button>
            <Button
              variant="primary"
              size="md"
              onPress={handleSave}
              loading={loading}
              disabled={!content.trim()}
              style={styles.button}
            >
              {t('common:buttons.save')}
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  inputScroll: {
    maxHeight: 200,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
    minHeight: 120,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  button: {
    flex: 1,
  },
});
