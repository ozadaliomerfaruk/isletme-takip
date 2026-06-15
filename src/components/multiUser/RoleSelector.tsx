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

  // Yan yana kart düzeni. 'purchaser' (satın almacı) rolü kaldırıldı —
  // şablondan gelse bile filtrelenir.
  const roles: { name: UserRole; label: string; permissions?: Permissions }[] = (
    templates?.map((tmpl: RoleTemplate) => ({
      name: tmpl.name as UserRole,
      label: lang === 'tr' ? tmpl.label_tr : tmpl.label_en,
      permissions: tmpl.default_permissions,
    })) ?? [
      { name: 'manager', label: t('roles.manager') },
      { name: 'operator', label: t('roles.operator') },
      { name: 'custom', label: t('roles.custom') },
    ]
  ).filter((role) => role.name !== 'purchaser');

  return (
    <View style={styles.container}>
      {roles.map((role) => {
        const isSelected = value === role.name;
        return (
          <TouchableOpacity
            key={role.name}
            style={[styles.card, isSelected && styles.cardSelected]}
            onPress={() => onChange(role.name, role.permissions)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkCircle, isSelected && styles.checkCircleSelected]}>
              {isSelected && <Check size={12} color={colors.white} strokeWidth={3} />}
            </View>
            <Text
              style={[styles.roleLabel, isSelected && styles.roleLabelSelected]}
              numberOfLines={1}
            >
              {role.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  card: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    minHeight: 72,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  roleLabel: {
    fontSize: 13,
    fontWeight: fontWeight.medium,
    color: colors.text,
    textAlign: 'center',
  },
  roleLabelSelected: {
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
});
