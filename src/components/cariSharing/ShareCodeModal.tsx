/**
 * ShareCodeModal - Cari paylasim kodu olusturma ve paylasma modal'i (v2)
 *
 * Centered Modal dialog - BottomSheet yerine basit Modal kullanir.
 * Iki asamali UI:
 * A) Izin secimi (view/full) + "Kod Olustur" butonu
 * B) Olusan kod gosterimi + kopyala/paylas butonlari
 */

import { useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Share,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Link, Copy, Share2, Check, AlertCircle, Eye, Edit3 } from 'lucide-react-native';

import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useGenerateShareCode } from '@/hooks/useCariSharing';
import type { SharingPermission } from '@/types/cariSharing';

interface ShareCodeModalProps {
  visible: boolean;
  onDismiss: () => void;
  cariId: string;
  cariName: string;
}

export function ShareCodeModal({
  visible,
  onDismiss,
  cariId,
  cariName,
}: ShareCodeModalProps) {
  const { t } = useTranslation(['clients', 'common']);
  const generateCode = useGenerateShareCode();
  const [copied, setCopied] = useState(false);
  const [permission, setPermission] = useState<SharingPermission>('view');

  // Modal kapandiginda state'i temizle
  useEffect(() => {
    if (!visible) {
      generateCode.reset();
      setCopied(false);
      setPermission('view');
    }
  }, [visible]);

  const code = generateCode.data?.code ?? '';

  const handleGenerateCode = useCallback(() => {
    generateCode.mutate({ cari_id: cariId, permission });
  }, [cariId, permission, generateCode]);

  const handleCopy = useCallback(async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopied(false), 3000);
  }, [code]);

  const handleShare = useCallback(async () => {
    if (!code) return;
    try {
      await Share.share({
        message: t('clients:sharing.shareInstructions') + '\n\n' + code,
        title: t('clients:sharing.shareTitle'),
      });
    } catch {
      // Kullanici iptal etti
    }
  }, [code, t]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Pressable style={styles.dialogContainer} onPress={(e) => e.stopPropagation()}>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            {/* Baslik */}
            <View style={styles.header}>
              <Link size={22} color={colors.primary} />
              <Text style={styles.title}>{t('clients:sharing.shareTitle')}</Text>
            </View>

            {/* Cari bilgisi */}
            <View style={styles.entityInfo}>
              <Text style={styles.entityLabel}>{t('common:labels.client')}</Text>
              <Text style={styles.entityName}>{cariName}</Text>
            </View>

            {/* Asama A: Izin secimi + Kod Olustur */}
            {!generateCode.isSuccess && (
              <>
                {/* Izin secimi */}
                <Text style={styles.permissionLabel}>
                  {t('clients:sharing.permissionLabel')}
                </Text>
                <View style={styles.permissionRow}>
                  <TouchableOpacity
                    style={[
                      styles.permissionOption,
                      permission === 'view' && styles.permissionOptionSelected,
                    ]}
                    onPress={() => {
                      setPermission('view');
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    activeOpacity={0.7}
                  >
                    <Eye
                      size={20}
                      color={permission === 'view' ? colors.primary : colors.textSecondary}
                    />
                    <View style={styles.permissionTextContainer}>
                      <Text
                        style={[
                          styles.permissionTitle,
                          permission === 'view' && styles.permissionTitleSelected,
                        ]}
                      >
                        {t('clients:sharing.permissionView')}
                      </Text>
                      <Text style={styles.permissionDesc}>
                        {t('clients:sharing.permissionViewDesc')}
                      </Text>
                    </View>
                    {permission === 'view' && <Check size={16} color={colors.primary} />}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.permissionOption,
                      permission === 'full' && styles.permissionOptionSelected,
                    ]}
                    onPress={() => {
                      setPermission('full');
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    activeOpacity={0.7}
                  >
                    <Edit3
                      size={20}
                      color={permission === 'full' ? colors.primary : colors.textSecondary}
                    />
                    <View style={styles.permissionTextContainer}>
                      <Text
                        style={[
                          styles.permissionTitle,
                          permission === 'full' && styles.permissionTitleSelected,
                        ]}
                      >
                        {t('clients:sharing.permissionFull')}
                      </Text>
                      <Text style={styles.permissionDesc}>
                        {t('clients:sharing.permissionFullDesc')}
                      </Text>
                    </View>
                    {permission === 'full' && <Check size={16} color={colors.primary} />}
                  </TouchableOpacity>
                </View>

                {/* Hata mesaji */}
                {generateCode.isError && (
                  <View style={styles.errorContainer}>
                    <AlertCircle size={18} color={colors.error} />
                    <Text style={styles.errorText} color="error">
                      {generateCode.error?.message ?? t('common:messages.operationFailed')}
                    </Text>
                  </View>
                )}

                {/* Kod Olustur butonu */}
                <Button
                  onPress={handleGenerateCode}
                  loading={generateCode.isPending}
                  fullWidth
                  icon={<Link size={18} color={colors.white} />}
                  style={styles.generateButton}
                >
                  {t('clients:sharing.generateCodeButton')}
                </Button>
              </>
            )}

            {/* Asama B: Olusan kod gosterimi */}
            {generateCode.isSuccess && code && (
              <>
                {/* Kod label */}
                <Text style={styles.codeLabel} color="secondary">
                  {t('clients:sharing.codeLabel')}
                </Text>

                {/* 6 haneli kod */}
                <View style={styles.codeContainer}>
                  {code.split('').map((char, index) => (
                    <View key={index} style={styles.codeBox}>
                      <Text style={styles.codeChar}>{char}</Text>
                    </View>
                  ))}
                </View>

                {/* Gecerlilik */}
                <Text style={styles.expiryText} color="secondary" center>
                  {t('clients:sharing.codeExpiry')}
                </Text>

                {/* Izin bilgisi */}
                <View style={styles.permissionBadge}>
                  {permission === 'view' ? (
                    <Eye size={14} color={colors.warning} />
                  ) : (
                    <Edit3 size={14} color={colors.success} />
                  )}
                  <Text style={[
                    styles.permissionBadgeText,
                    { color: permission === 'view' ? colors.warning : colors.success }
                  ]}>
                    {permission === 'view'
                      ? t('clients:sharing.permissionView')
                      : t('clients:sharing.permissionFull')}
                  </Text>
                </View>

                {/* Aciklama */}
                <Text style={styles.instructionText} color="secondary" center>
                  {t('clients:sharing.shareInstructions')}
                </Text>

                {/* Butonlar */}
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.actionButton, copied && styles.actionButtonSuccess]}
                    onPress={handleCopy}
                    activeOpacity={0.7}
                  >
                    {copied ? (
                      <Check size={20} color={colors.success} />
                    ) : (
                      <Copy size={20} color={colors.primary} />
                    )}
                    <Text
                      style={[
                        styles.actionButtonText,
                        copied && styles.actionButtonTextSuccess,
                      ]}
                    >
                      {copied
                        ? t('clients:sharing.codeCopied')
                        : t('clients:sharing.copyCode')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={handleShare}
                    activeOpacity={0.7}
                  >
                    <Share2 size={20} color={colors.primary} />
                    <Text style={styles.actionButtonText}>
                      {t('clients:sharing.shareCode')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialogContainer: {
    width: '88%',
    maxWidth: 400,
    maxHeight: '80%',
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
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  entityInfo: {
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  entityLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  entityName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  // Permission
  permissionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  permissionRow: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  permissionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  permissionOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  permissionTextContainer: {
    flex: 1,
  },
  permissionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  permissionTitleSelected: {
    color: colors.primary,
  },
  permissionDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  generateButton: {
    marginTop: spacing.xs,
  },
  // Error
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
  // Code display
  codeLabel: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  codeBox: {
    width: 48,
    height: 56,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeChar: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1,
  },
  expiryText: {
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  permissionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  permissionBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  instructionText: {
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionButtonSuccess: {
    borderColor: colors.success,
    backgroundColor: colors.successLight,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  actionButtonTextSuccess: {
    color: colors.success,
  },
});
