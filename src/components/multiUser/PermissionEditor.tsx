import { View, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useTranslation } from 'react-i18next';
import type { Permissions, ModuleName } from '@/types/multiUser';

interface PermissionEditorProps {
  value: Permissions;
  onChange: (permissions: Permissions) => void;
}

// Modüller ve bunlar için hangi aksiyonların gösterileceği
const MODULE_CONFIG: {
  name: ModuleName;
  i18nKey: string;
  hasActions: boolean;
}[] = [
  { name: 'dashboard', i18nKey: 'navigation:tabs.home', hasActions: false },
  { name: 'hesaplar', i18nKey: 'navigation:menu.accounts', hasActions: true },
  { name: 'cariler', i18nKey: 'navigation:tabs.clients', hasActions: true },
  { name: 'personel', i18nKey: 'navigation:tabs.personnel', hasActions: true },
  { name: 'islemler', i18nKey: 'navigation:menu.allTransactions', hasActions: true },
  { name: 'kategoriler', i18nKey: 'navigation:menu.categories', hasActions: true },
  { name: 'raporlar', i18nKey: 'navigation:menu.reports', hasActions: false },
  { name: 'cekler', i18nKey: 'navigation:menu.checks', hasActions: true },
  { name: 'ileri_tarihli', i18nKey: 'navigation:menu.futureTransactions', hasActions: true },
  { name: 'urunler', i18nKey: 'navigation:tabs.stock', hasActions: true },
  { name: 'arsiv', i18nKey: 'common:archive.title', hasActions: false },
  { name: 'ayarlar', i18nKey: 'navigation:tabs.more', hasActions: false },
];

const ACTION_LABELS = [
  { key: 'can_create', i18n: 'create' },
  { key: 'can_update_own', i18n: 'editOwn' },
  { key: 'can_update_all', i18n: 'editAll' },
  { key: 'can_delete_own', i18n: 'deleteOwn' },
  { key: 'can_delete_all', i18n: 'deleteAll' },
] as const;

export function PermissionEditor({ value, onChange }: PermissionEditorProps) {
  const { t } = useTranslation(['multiUser', 'navigation', 'common']);

  // Defensive: ensure nested objects exist
  const modules = value.modules ?? ({} as Record<ModuleName, boolean>);
  const actions = value.actions ?? {};
  const visibility = value.visibility ?? { can_see_passive: false, can_see_archived: false, can_see_all_users_data: false };

  const toggleModule = (module: ModuleName) => {
    const newModules = { ...modules, [module]: !modules[module] };
    onChange({ ...value, modules: newModules });
  };

  const toggleAction = (module: string, actionKey: string) => {
    const currentActions = actions[module] ?? {
      can_create: false,
      can_update_own: false,
      can_update_all: false,
      can_delete_own: false,
      can_delete_all: false,
    };
    const newActions = {
      ...actions,
      [module]: { ...currentActions, [actionKey]: !currentActions[actionKey as keyof typeof currentActions] },
    };
    onChange({ ...value, actions: newActions });
  };

  const toggleVisibility = (key: keyof Permissions['visibility']) => {
    onChange({
      ...value,
      visibility: { ...visibility, [key]: !visibility[key] },
    });
  };

  return (
    <View style={styles.container}>
      {/* Modül Erişimi */}
      <Text variant="label" color="secondary" style={styles.sectionTitle}>
        {t('multiUser:permissionActions.moduleAccess')}
      </Text>
      {MODULE_CONFIG.map((mod) => (
        <View key={mod.name} style={styles.moduleSection}>
          {/* Modül toggle */}
          <View style={styles.moduleRow}>
            <Text variant="body" style={styles.moduleLabel}>
              {t(mod.i18nKey, { defaultValue: mod.name })}
            </Text>
            <Switch
              value={modules[mod.name] ?? false}
              onValueChange={() => toggleModule(mod.name)}
              trackColor={{ false: colors.borderLight, true: colors.primaryLight }}
              thumbColor={modules[mod.name] ? colors.primary : colors.textMuted}
            />
          </View>

          {/* Aksiyon detayları (modül açıksa ve aksiyonları varsa) */}
          {mod.hasActions && modules[mod.name] && (
            <View style={styles.actionsContainer}>
              {ACTION_LABELS.map((action) => (
                <TouchableOpacity
                  key={action.key}
                  style={styles.actionRow}
                  onPress={() => toggleAction(mod.name, action.key)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.checkbox,
                      actions[mod.name]?.[action.key] && styles.checkboxChecked,
                    ]}
                  >
                    {actions[mod.name]?.[action.key] && (
                      <Text variant="caption" style={styles.checkmark}>✓</Text>
                    )}
                  </View>
                  <Text variant="caption">
                    {t(`multiUser:permissionActions.${action.i18n}`, { defaultValue: action.key })}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      ))}

      {/* Görünürlük Ayarları */}
      <Text variant="label" color="secondary" style={[styles.sectionTitle, { marginTop: spacing.lg }]}>
        {t('multiUser:permissionActions.visibility')}
      </Text>
      <View style={styles.visibilitySection}>
        <View style={styles.moduleRow}>
          <Text variant="body">
            {t('multiUser:permissionActions.canSeePassive')}
          </Text>
          <Switch
            value={visibility.can_see_passive}
            onValueChange={() => toggleVisibility('can_see_passive')}
            trackColor={{ false: colors.borderLight, true: colors.primaryLight }}
            thumbColor={visibility.can_see_passive ? colors.primary : colors.textMuted}
          />
        </View>
        <View style={styles.moduleRow}>
          <Text variant="body">
            {t('multiUser:permissionActions.canSeeArchived')}
          </Text>
          <Switch
            value={visibility.can_see_archived}
            onValueChange={() => toggleVisibility('can_see_archived')}
            trackColor={{ false: colors.borderLight, true: colors.primaryLight }}
            thumbColor={visibility.can_see_archived ? colors.primary : colors.textMuted}
          />
        </View>
        <View style={styles.moduleRow}>
          <Text variant="body">
            {t('multiUser:permissionActions.canSeeAllData')}
          </Text>
          <Switch
            value={visibility.can_see_all_users_data}
            onValueChange={() => toggleVisibility('can_see_all_users_data')}
            trackColor={{ false: colors.borderLight, true: colors.primaryLight }}
            thumbColor={visibility.can_see_all_users_data ? colors.primary : colors.textMuted}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
  },
  moduleSection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  moduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  moduleLabel: {
    flex: 1,
    marginRight: spacing.md,
  },
  actionsContainer: {
    paddingLeft: spacing.xl,
    paddingRight: spacing.md,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  visibilitySection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
});
