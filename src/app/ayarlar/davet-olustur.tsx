import { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import { Copy, Check } from 'lucide-react-native';
import { BackButton } from '@/components/ui/BackButton';
import { Text, Card, Input, Button } from '@/components/ui';
import { RoleSelector } from '@/components/multiUser/RoleSelector';
import { PermissionEditor } from '@/components/multiUser/PermissionEditor';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useCreateInvite, useRoleTemplates } from '@/hooks/useMultiUser';
import type { UserRole, Permissions } from '@/types/multiUser';
import { useRequireOwner } from '@/hooks/usePagePermission';

// Boş permissions objesi (custom rol için başlangıç)
const EMPTY_PERMISSIONS: Permissions = {
  modules: {
    dashboard: true,
    hesaplar: false,
    birikim: false,
    cariler: false,
    personel: false,
    islemler: false,
    kategoriler: false,
    raporlar: false,
    cekler: false,
    nakit_avans: false,
    ileri_tarihli: false,
    urunler: false,
    notlar: false,
    arsiv: false,
    ayarlar: false,
  },
  actions: {},
  visibility: {
    can_see_passive: false,
    can_see_archived: false,
    can_see_all_users_data: false,
  },
};

export default function DavetOlusturPage() {
  const router = useRouter();
  const { t } = useTranslation(['multiUser', 'common']);
  useRequireOwner();
  const createInvite = useCreateInvite();

  const { data: roleTemplates } = useRoleTemplates();

  const [selectedRole, setSelectedRole] = useState<UserRole>('operator');
  const [permissions, setPermissions] = useState<Permissions>(EMPTY_PERMISSIONS);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [email, setEmail] = useState('');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Apply template permissions on initial load when templates become available
  useEffect(() => {
    if (roleTemplates && !initialLoaded) {
      const template = roleTemplates.find((t) => t.name === selectedRole);
      if (template?.default_permissions) {
        setPermissions(template.default_permissions);
      }
      setInitialLoaded(true);
    }
  }, [roleTemplates, initialLoaded, selectedRole]);

  const handleRoleChange = (role: UserRole, defaultPermissions?: Permissions) => {
    setSelectedRole(role);
    if (role === 'custom') {
      setPermissions(EMPTY_PERMISSIONS);
    } else if (defaultPermissions?.modules) {
      setPermissions(defaultPermissions);
    }
  };

  const handleGenerateCode = async () => {
    try {
      const code = await createInvite.mutateAsync({
        role: selectedRole,
        email: email.trim() || undefined,
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
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <BackButton />
        <View style={styles.headerCenter}>
          <Text variant="h3">{t('multiUser:invites.title')}</Text>
          <Text variant="caption" color="muted">{t('multiUser:invites.subtitle')}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
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
              <PermissionEditor value={permissions} onChange={setPermissions} />
            </View>

            {/* E-posta (opsiyonel) */}
            <View style={styles.section}>
              <Text variant="label" color="secondary" style={styles.sectionTitle}>
                {t('multiUser:invites.emailOptional')}
              </Text>
              <Input
                value={email}
                onChangeText={setEmail}
                placeholder={t('multiUser:invites.emailPlaceholder')}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            {/* Oluştur Butonu */}
            <View style={[styles.section, { marginBottom: spacing['3xl'] }]}>
              <Button
                onPress={handleGenerateCode}
                loading={createInvite.isPending}
                variant="primary"
              >
                {t('multiUser:invites.generateCode')}
              </Button>
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

            <View style={styles.doneButtonContainer}>
              <Button onPress={() => router.back()} variant="secondary">
                {t('common:buttons.done')}
              </Button>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
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
  doneButtonContainer: {
    marginTop: spacing.lg,
  },
});
