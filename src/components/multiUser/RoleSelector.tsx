import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontWeight } from '@/constants/spacing';
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
      {roles.map((role, index) => {
        const isSelected = value === role.name;
        const isLast = index === roles.length - 1;

        return (
          <TouchableOpacity
            key={role.name}
            style={[
              styles.roleItem,
              isSelected && styles.roleItemSelected,
              !isLast && styles.roleItemBorder,
            ]}
            onPress={() => onChange(role.name, role.permissions)}
            activeOpacity={0.6}
          >
            <View style={styles.roleContent}>
              <Text
                style={[
                  styles.roleLabel,
                  isSelected && styles.roleLabelSelected,
                ]}
              >
                {role.label}
              </Text>
              {role.description && (
                <Text
                  variant="caption"
                  color="muted"
                  numberOfLines={2}
                  style={styles.roleDescription}
                >
                  {role.description}
                </Text>
              )}
            </View>
            <View style={[styles.checkCircle, isSelected && styles.checkCircleSelected]}>
              {isSelected && <Check size={14} color={colors.white} strokeWidth={3} />}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
    overflow: 'hidden',
  },
  roleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  roleItemSelected: {
    backgroundColor: colors.primaryLight,
  },
  roleItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  roleContent: {
    flex: 1,
    gap: 2,
  },
  roleLabel: {
    fontSize: 15,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
  roleLabelSelected: {
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  roleDescription: {
    lineHeight: 16,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
});
