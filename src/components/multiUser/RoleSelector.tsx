import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontWeight } from '@/constants/spacing';
import { useTranslation } from 'react-i18next';
import { useRoleTemplates } from '@/hooks/useMultiUser';
import type { UserRole, Permissions, RoleTemplate } from '@/types/multiUser';
import { rolePresetPermissions } from '@/lib/permissions';
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
  const roles: { name: UserRole; label: string }[] = (
    templates?.map((tmpl: RoleTemplate) => ({
      name: tmpl.name as UserRole,
      label: lang === 'tr' ? tmpl.label_tr : tmpl.label_en,
    })) ?? [
      { name: 'manager', label: t('roles.manager') },
      { name: 'operator', label: t('roles.operator') },
      { name: 'custom', label: t('roles.custom') },
    ]
  ).filter((role) => role.name !== 'purchaser');

  // Kaldırılan 'purchaser' (veya tanınmayan eski rol) → 'Özel Rol' kartı seçili görünsün.
  const normalizedValue: UserRole = value === 'purchaser' ? 'custom' : value;

  return (
    <View style={styles.container}>
      {roles.map((role) => {
        const isSelected = normalizedValue === role.name;
        return (
          <TouchableOpacity
            key={role.name}
            style={[styles.card, isSelected && styles.cardSelected]}
            onPress={() =>
              onChange(
                role.name,
                role.name === 'custom' ? undefined : rolePresetPermissions(role.name),
              )
            }
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
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    minHeight: 52,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  checkCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
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
    fontSize: 15,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    textAlign: 'center',
  },
  roleLabelSelected: {
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
});
