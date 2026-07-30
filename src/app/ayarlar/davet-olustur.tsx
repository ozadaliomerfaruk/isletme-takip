import { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import { Copy, Check } from 'lucide-react-native';
import { Text, Card, Input, Button, Screen } from '@/components/ui';
import { useFooterBottomPadding } from '@/hooks/useFooterBottomPadding';
import { RoleSelector } from '@/components/multiUser/RoleSelector';
import { PermissionEditor } from '@/components/multiUser/PermissionEditor';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useCreateInvite } from '@/hooks/useMultiUser';
import type { UserRole, Permissions } from '@/types/multiUser';
import { rolePresetPermissions } from '@/lib/permissions';
import { useRequireOwner } from '@/hooks/usePagePermission';

export default function DavetOlusturPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const footerInset = useFooterBottomPadding();
  const { t } = useTranslation(['multiUser', 'common']);
  useRequireOwner();
  const createInvite = useCreateInvite();

  const [selectedRole, setSelectedRole] = useState<UserRole>('operator');
  // Başlangıç: Operatör hazır izinleri (rol kartı değişince güncellenir).
  const [permissions, setPermissions] = useState<Permissions>(() =>
    rolePresetPermissions('operator'),
  );
  const [memberName, setMemberName] = useState('');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleRoleChange = (role: UserRole, defaultPermissions?: Permissions) => {
    setSelectedRole(role);
    // manager/operator → hazır preset gelir; custom → mevcut seçimler korunur.
    if (defaultPermissions) setPermissions(defaultPermissions);
  };

  const handleGenerateCode = async () => {
    try {
      const code = await createInvite.mutateAsync({
        role: selectedRole,
        memberLabel: memberName.trim() || undefined,
        permissions,
      });
      setGeneratedCode(code);
    } catch (error: unknown) {
      Alert.alert(
        t('common:status.error'),
        (error as Error)?.message ?? t('common:status.error'),
      );
    }
  };

  const handleCopyCode = async () => {
    if (!generatedCode) return;
    await Clipboard.setStringAsync(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {/* Başlık: kardeş ayarlar ekranlarıyla (paylasilan-isletmeler, islem-gecmisi)
          aynı yerleşik native header — elle çizilen başlık hizası/geri düğmesi
          farkı yaratıyordu */}
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: t('multiUser:invites.title'),
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      />
      <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex1}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}
      >
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.scrollContent}
      >
        {/* Açıklama: native header'a geçerken elle çizilen başlıkla birlikte
            düşmüştü — metin kullanıcıya görünmeye devam etmeli */}
        <View style={styles.section}>
          <Text variant="caption" color="muted">
            {t('multiUser:invites.subtitle')}
          </Text>
        </View>

        {!generatedCode ? (
          <>
            {/* Rol Seçimi */}
            <View style={styles.section}>
              <Text variant="label" color="secondary" style={styles.sectionTitle}>
                {t('multiUser:invites.selectRole')}
              </Text>
              <RoleSelector value={selectedRole} onChange={handleRoleChange} />
            </View>

            {/* Yetki Düzenleme (tüm roller için göster, şablon otomatik doldurulur) */}
            <View style={styles.section}>
              <PermissionEditor
                value={permissions}
                onChange={(next) => {
                  setPermissions(next);
                  // Hazır rol seçiliyken elle değişiklik → artık 'Özel' (etiket/izin tutarlılığı).
                  if (selectedRole !== 'custom') setSelectedRole('custom');
                }}
              />
            </View>

            {/* İsim (opsiyonel) — kodu paylaştığın kişiyi listede tanımak için */}
            <View style={styles.section}>
              <Text variant="label" color="secondary" style={styles.sectionTitle}>
                {t('multiUser:invites.memberName')}
              </Text>
              <Input
                value={memberName}
                onChangeText={setMemberName}
                placeholder={t('multiUser:invites.memberNamePlaceholder')}
                autoCapitalize="words"
                maxLength={100}
              />
            </View>

          </>
        ) : (
          /* Kod Oluşturuldu */
          <View style={styles.section}>
            <Card>
              <View style={styles.codeContainer}>
                <Text variant="caption" color="muted" style={styles.codeLabel}>
                  {t('multiUser:invites.codeGenerated')}
                </Text>
                <Text variant="h2" style={styles.codeText}>
                  {generatedCode}
                </Text>
                <TouchableOpacity
                  style={styles.copyButton}
                  onPress={handleCopyCode}
                  activeOpacity={0.7}
                >
                  {copied ? (
                    <>
                      <Check size={18} color={colors.success} />
                      <Text variant="body" style={{ color: colors.success }}>
                        {t('multiUser:invites.codeCopied')}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Copy size={18} color={colors.primary} />
                      <Text variant="body" style={{ color: colors.primary }}>
                        {t('multiUser:invites.copyCode')}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                <Text variant="caption" color="muted" style={styles.codeHint}>
                  {t('multiUser:invites.shareCode')}
                </Text>
                <Text variant="caption" color="muted">
                  {t('multiUser:invites.codeExpiry')}
                </Text>
              </View>
            </Card>
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: spacing.md + footerInset }]}>
        {generatedCode ? (
          <Button onPress={() => router.back()} variant="secondary" fullWidth>
            {t('common:buttons.done')}
          </Button>
        ) : (
          <Button
            onPress={handleGenerateCode}
            loading={createInvite.isPending}
            variant="primary"
            fullWidth
          >
            {t('multiUser:invites.generateCode')}
          </Button>
        )}
      </View>
      </KeyboardAvoidingView>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  flex1: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  codeContainer: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  codeLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  codeText: {
    fontFamily: 'monospace',
    letterSpacing: 4,
    fontSize: 32,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
  },
  codeHint: {
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
