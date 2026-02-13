/**
 * AcceptCodeSheet - Paylasim kodu ile cari baglantisi kurma modal'i (v2)
 *
 * Centered Modal dialog - klavyeyle hareket etmez.
 * Cari picker kaldirıldı - sadece kod + tip secimi.
 * OTP benzeri input deneyimi: auto-focus, auto-advance, backspace geri gitme.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { Link, Check, AlertCircle, Users, ShoppingBag } from 'lucide-react-native';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useAcceptShareCode } from '@/hooks/useCariSharing';
import type { CariType } from '@/types/database';

const CODE_LENGTH = 6;

interface AcceptCodeSheetProps {
  visible: boolean;
  onDismiss: () => void;
}

export function AcceptCodeSheet({ visible, onDismiss }: AcceptCodeSheetProps) {
  const { t } = useTranslation(['clients', 'common']);
  const acceptCode = useAcceptShareCode();

  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [viewerType, setViewerType] = useState<CariType | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const inputRefs = useRef<(TextInput | null)[]>(Array(CODE_LENGTH).fill(null));

  // Modal kapandiginda state'i temizle
  useEffect(() => {
    if (!visible) {
      setCode(Array(CODE_LENGTH).fill(''));
      setViewerType(null);
      setSuccessMessage(null);
      acceptCode.reset();
    }
  }, [visible]);

  // Ilk input'a focus - modal acildiginda
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  const handleCodeChange = useCallback(
    (text: string, index: number) => {
      const cleaned = text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

      if (cleaned.length === 0) {
        const newCode = [...code];
        newCode[index] = '';
        setCode(newCode);
        return;
      }

      // Yapistirma destegi
      if (cleaned.length > 1) {
        const chars = cleaned.slice(0, CODE_LENGTH).split('');
        const newCode = [...code];
        chars.forEach((char, i) => {
          if (index + i < CODE_LENGTH) {
            newCode[index + i] = char;
          }
        });
        setCode(newCode);
        const nextIndex = Math.min(index + chars.length, CODE_LENGTH - 1);
        inputRefs.current[nextIndex]?.focus();
        return;
      }

      // Tek karakter
      const newCode = [...code];
      newCode[index] = cleaned;
      setCode(newCode);

      if (index < CODE_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [code]
  );

  const handleKeyPress = useCallback(
    (key: string, index: number) => {
      if (key === 'Backspace' && !code[index] && index > 0) {
        const newCode = [...code];
        newCode[index - 1] = '';
        setCode(newCode);
        inputRefs.current[index - 1]?.focus();
      }
    },
    [code]
  );

  const fullCode = code.join('');
  const isCodeComplete = fullCode.length === CODE_LENGTH;
  const canSubmit = isCodeComplete && !!viewerType && !acceptCode.isPending;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !viewerType) return;

    try {
      await acceptCode.mutateAsync({
        code: fullCode,
        viewer_type: viewerType,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccessMessage(t('clients:sharing.linkCreated'));
      setTimeout(() => {
        onDismiss();
      }, 2000);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [canSubmit, viewerType, fullCode, acceptCode, t, onDismiss]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
        >
          <Pressable style={styles.dialogContainer} onPress={(e) => e.stopPropagation()}>
            {/* Basari durumu */}
            {successMessage ? (
              <View style={styles.successContainer}>
                <Check size={40} color={colors.success} />
                <Text style={styles.successText}>{successMessage}</Text>
              </View>
            ) : (
              <>
                {/* Baslik */}
                <View style={styles.header}>
                  <Link size={22} color={colors.primary} />
                  <Text style={styles.title}>{t('clients:sharing.acceptTitle')}</Text>
                </View>

                {/* Aciklama */}
                <Text style={styles.description}>
                  {t('clients:sharing.acceptDescription')}
                </Text>

                {/* Kod giris alani */}
                <View style={styles.codeInputRow}>
                  {Array.from({ length: CODE_LENGTH }).map((_, index) => (
                    <TextInput
                      key={index}
                      ref={(ref) => {
                        inputRefs.current[index] = ref;
                      }}
                      style={[
                        styles.codeInput,
                        code[index] ? styles.codeInputFilled : null,
                      ]}
                      value={code[index]}
                      onChangeText={(text) => handleCodeChange(text, index)}
                      onKeyPress={({ nativeEvent }) =>
                        handleKeyPress(nativeEvent.key, index)
                      }
                      maxLength={CODE_LENGTH}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      keyboardType="default"
                      textContentType="oneTimeCode"
                      selectTextOnFocus
                      placeholder="-"
                      placeholderTextColor={colors.border}
                    />
                  ))}
                </View>

                {/* Tip secimi */}
                <Text style={styles.sectionTitle}>
                  {t('clients:sharing.typeQuestion')}
                </Text>
                <View style={styles.typeRow}>
                  <TouchableOpacity
                    style={[
                      styles.typeOption,
                      viewerType === 'musteri' && styles.typeOptionSelected,
                    ]}
                    onPress={() => {
                      setViewerType('musteri');
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    activeOpacity={0.7}
                  >
                    <Users
                      size={20}
                      color={viewerType === 'musteri' ? colors.primary : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.typeOptionText,
                        viewerType === 'musteri' && styles.typeOptionTextSelected,
                      ]}
                    >
                      {t('clients:types.musteri')}
                    </Text>
                    {viewerType === 'musteri' && (
                      <Check size={16} color={colors.primary} />
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.typeOption,
                      viewerType === 'tedarikci' && styles.typeOptionSelected,
                    ]}
                    onPress={() => {
                      setViewerType('tedarikci');
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    activeOpacity={0.7}
                  >
                    <ShoppingBag
                      size={20}
                      color={viewerType === 'tedarikci' ? colors.primary : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.typeOptionText,
                        viewerType === 'tedarikci' && styles.typeOptionTextSelected,
                      ]}
                    >
                      {t('clients:types.tedarikci')}
                    </Text>
                    {viewerType === 'tedarikci' && (
                      <Check size={16} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                </View>

                {/* Hata mesaji */}
                {acceptCode.isError && (
                  <View style={styles.errorContainer}>
                    <AlertCircle size={16} color={colors.error} />
                    <Text style={styles.errorText} color="error">
                      {getErrorMessage(acceptCode.error, t)}
                    </Text>
                  </View>
                )}

                {/* Baglanti Kur butonu */}
                <Button
                  onPress={handleSubmit}
                  disabled={!canSubmit}
                  loading={acceptCode.isPending}
                  fullWidth
                  icon={<Link size={18} color={colors.white} />}
                  style={styles.submitButton}
                >
                  {t('clients:sharing.createLink')}
                </Button>
              </>
            )}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function getErrorMessage(error: any, t: any): string {
  const msg = error?.message ?? '';
  if (msg.includes('Gecersiz veya suresi dolmus')) {
    return t('clients:sharing.invalidCode');
  }
  if (msg.includes('zaten paylasilmis') || msg.includes('zaten baska')) {
    return t('clients:sharing.alreadyLinked');
  }
  if (msg.includes('Kendi carinizle')) {
    return t('clients:sharing.selfLinkError');
  }
  return msg || t('common:messages.operationFailed');
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardView: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialogContainer: {
    width: '88%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  codeInputRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  codeInput: {
    width: 44,
    height: 52,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  codeInputFilled: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  typeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  typeOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  typeOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  typeOptionTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorLight,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: 13,
    flex: 1,
  },
  submitButton: {
    marginTop: spacing.xs,
  },
  successContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing['2xl'],
  },
  successText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.success,
  },
});
