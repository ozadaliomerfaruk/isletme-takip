import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useTranslation } from 'react-i18next';
import { useRoleTemplates } from '@/hooks/useMultiUser';
import type { UserRole, Permissions, RoleTemplate } from '@/types/multiUser';
import { getCurrentLanguage } from '@/i18n';

interface RoleSelectorProps {
  value: UserRole;
  onChange: (role: UserRole, defaultPermissions?: Permissions) => void;
}

export function RoleSelector({ value, onChange }: RoleSelectorProps) {
  const { t } = useTranslation('multiUser');
  const { data: templates } = useRoleTemplates();
  const lang = getCurrentLanguage();

  // Fallback roles if templates haven't loaded yet
  const roles: { name: UserRole; label: string; description: string | null; permissions?: Permissions }[] =
    templates?.map((tmpl: RoleTemplate) => ({
      name: tmpl.name as UserRole,
      label: lang === 'tr' ? tmpl.label_tr : tmpl.label_en,
      description: lang === 'tr' ? tmpl.description_tr : tmpl.description_en,
      permissions: tmpl.default_permissions,
    })) ?? [
      { name: 'manager', label: t('roles.manager'), description: null },
      { name: 'operator', label: t('roles.operator'), description: null },
      { name: 'purchaser', label: t('roles.purchaser'), description: null },
      { name: 'custom', label: t('roles.custom'), description: null },
    ];

  return (
    <View style={styles.container}>
      {roles.map((role) => (
        <TouchableOpacity
          key={role.name}
          style={[styles.roleItem, value === role.name && styles.roleItemSelected]}
          onPress={() => onChange(role.name, role.permissions)}
          activeOpacity={0.7}
        >
          <View style={styles.roleContent}>
            <Text
              variant="body"
              style={value === role.name ? { color: colors.primary, fontWeight: '600' } : undefined}
            >
              {role.label}
            </Text>
            {role.description && (
              <Text variant="caption" color="muted" numberOfLines={2}>
                {role.description}
              </Text>
            )}
          </View>
          {value === role.name && <Check size={20} color={colors.primary} />}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 1,
    backgroundColor: colors.borderLight,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  roleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  roleItemSelected: {
    backgroundColor: colors.primaryLight,
  },
  roleContent: {
    flex: 1,
    gap: 2,
  },
});
