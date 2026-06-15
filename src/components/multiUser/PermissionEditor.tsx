import { View, StyleSheet, Switch, TouchableOpacity } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useTranslation } from 'react-i18next';
import type { Permissions, ModuleName, PermissionLevel } from '@/types/multiUser';
import { buildPermissions, deriveLevel } from '@/lib/permissions';

interface PermissionEditorProps {
  value: Permissions;
  onChange: (permissions: Permissions) => void;
}

// Sade model: modüller iki grupta, her biri tek aç/kapa toggle.
// (dashboard her zaman açık, ayarlar owner-only, arsiv modüle bağlı → gösterilmez.)
const MODULE_GROUPS: {
  headerKey: string;
  headerDefault: string;
  modules: {
    name: ModuleName;
    i18nKey: string;
    label: string;
    // Üst modüle bağlı alt aç/kapa (yalnızca üst açıkken görünür).
    subToggle?: { name: ModuleName; i18nKey: string; label: string };
  }[];
}[] = [
  {
    headerKey: 'multiUser:permissions.groupMain',
    headerDefault: 'Hesaplar',
    modules: [
      {
        name: 'hesaplar',
        i18nKey: 'navigation:menu.accounts',
        label: 'Hesaplar',
        subToggle: {
          name: 'birikim',
          i18nKey: 'multiUser:permissions.showSavings',
          label: 'Birikim hesaplarını göster',
        },
      },
      { name: 'cariler', i18nKey: 'navigation:tabs.clients', label: 'Cariler' },
      { name: 'urunler', i18nKey: 'navigation:tabs.stock', label: 'Ürünler / Stok' },
      { name: 'personel', i18nKey: 'navigation:tabs.personnel', label: 'Personel' },
    ],
  },
  {
    headerKey: 'multiUser:permissions.groupOther',
    headerDefault: 'Diğer',
    modules: [
      { name: 'raporlar', i18nKey: 'navigation:menu.reports', label: 'Raporlar' },
      { name: 'notlar', i18nKey: 'multiUser:permissions.moduleNotlar', label: 'Notlar' },
    ],
  },
];

export function PermissionEditor({ value, onChange }: PermissionEditorProps) {
  const { t } = useTranslation(['multiUser', 'navigation', 'common']);

  const modules = value.modules ?? ({} as Record<ModuleName, boolean>);
  const level = deriveLevel(value);
  // İş modüllerinden hiçbiri açık değil mi? (çekirdek modüller editörde gösterilmez,
  // hep açıktır; burada yalnızca kullanıcının seçtiği görünür modüllere bakılır.)
  const businessModuleKeys = MODULE_GROUPS.flatMap((g) => g.modules.map((m) => m.name));
  const noModuleOn = businessModuleKeys.every((k) => !modules[k]);

  const toggleModule = (mod: ModuleName) => {
    const next = { ...modules, [mod]: !modules[mod] };
    // Hesaplar kapatılırsa bağlı 'birikim' alt seçeneği de kapanır.
    if (mod === 'hesaplar' && !next.hesaplar) next.birikim = false;
    onChange(buildPermissions(next, level));
  };
  const setLevel = (l: PermissionLevel) => onChange(buildPermissions(modules, l));

  const canAdd = level !== 'view';
  const canEdit = level === 'edit_own' || level === 'edit_all';
  const editAll = level === 'edit_all';

  const trackColor = { false: colors.borderLight, true: colors.primaryLight };
  const thumb = (on: boolean) => (on ? colors.primary : colors.textMuted);

  return (
    <View style={styles.container}>
      {/* MODÜL ERİŞİMİ */}
      {MODULE_GROUPS.map((group) => (
        <View key={group.headerDefault} style={styles.group}>
          <Text variant="label" color="secondary" style={styles.groupHeader}>
            {t(group.headerKey, { defaultValue: group.headerDefault })}
          </Text>
          <View style={styles.card}>
            {group.modules.map((mod, i) => {
              const isLast = i === group.modules.length - 1;
              const sub = mod.subToggle;
              const showSub = !!sub && !!modules[mod.name];
              return (
                <View key={mod.name}>
                  <View style={[styles.row, (!isLast || showSub) && styles.rowDivider]}>
                    <Text variant="body" style={styles.rowLabel}>
                      {t(mod.i18nKey, { defaultValue: mod.label })}
                    </Text>
                    <Switch
                      value={modules[mod.name] ?? false}
                      onValueChange={() => toggleModule(mod.name)}
                      trackColor={trackColor}
                      thumbColor={thumb(!!modules[mod.name])}
                    />
                  </View>
                  {showSub && sub && (
                    <View style={[styles.row, styles.subRow, !isLast && styles.rowDivider]}>
                      <Text variant="body" color="secondary" style={styles.rowLabel}>
                        {t(sub.i18nKey, { defaultValue: sub.label })}
                      </Text>
                      <Switch
                        value={modules[sub.name] ?? false}
                        onValueChange={() => toggleModule(sub.name)}
                        trackColor={trackColor}
                        thumbColor={thumb(!!modules[sub.name])}
                      />
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      ))}

      {noModuleOn && (
        <Text variant="caption" color="muted" style={styles.noModuleWarning}>
          {t('multiUser:permissions.noModuleWarning', {
            defaultValue: 'Hiçbir modül seçili değil — bu kullanıcı yalnızca ana ekranı görebilir.',
          })}
        </Text>
      )}

      {/* YETKİ SEVİYESİ (tüm açık modüllere geçerli) */}
      <View style={styles.group}>
        <Text variant="label" color="secondary" style={styles.groupHeader}>
          {t('multiUser:permissions.levelTitle', { defaultValue: 'Yetki Seviyesi' })}
        </Text>
        <Text variant="caption" color="muted" style={styles.levelHelp}>
          {t('multiUser:permissions.levelHelp', {
            defaultValue: 'Açık modüllerde tüm kayıtlar görünür; ekleme/düzenleme/silme aşağıdaki seçime göredir.',
          })}
        </Text>
        <View style={styles.card}>
          {/* Görebilir — taban (her açık modülde) */}
          <View style={[styles.row, styles.rowDivider]}>
            <Text variant="body" style={styles.rowLabel}>
              {t('multiUser:permissions.canView', { defaultValue: 'Görebilir' })}
            </Text>
            <Check size={20} color={colors.primary} />
          </View>

          {/* Ekleyebilir */}
          <View style={[styles.row, styles.rowDivider]}>
            <Text variant="body" style={styles.rowLabel}>
              {t('multiUser:permissions.canAdd', { defaultValue: 'Ekleyebilir' })}
            </Text>
            <Switch
              value={canAdd}
              onValueChange={(on) => setLevel(on ? (canEdit ? level : 'add') : 'view')}
              trackColor={trackColor}
              thumbColor={thumb(canAdd)}
            />
          </View>

          {/* Düzenleyebilir / silebilir */}
          <View style={styles.row}>
            <Text variant="body" style={styles.rowLabel}>
              {t('multiUser:permissions.canEditDelete', { defaultValue: 'Düzenleyebilir / silebilir' })}
            </Text>
            <Switch
              value={canEdit}
              onValueChange={(on) => setLevel(on ? 'edit_own' : canAdd ? 'add' : 'view')}
              trackColor={trackColor}
              thumbColor={thumb(canEdit)}
            />
          </View>

          {/* Kapsam: yalnızca kendi / tümü (sadece düzenleme açıkken) */}
          {canEdit && (
            <View style={styles.scopeRow}>
              <TouchableOpacity
                style={[styles.chip, !editAll && styles.chipActive]}
                onPress={() => setLevel('edit_own')}
                activeOpacity={0.7}
              >
                <Text variant="caption" style={!editAll ? styles.chipActiveText : styles.chipText}>
                  {t('multiUser:permissions.scopeOwn', { defaultValue: 'Yalnızca kendi eklediğini' })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, editAll && styles.chipActive]}
                onPress={() => setLevel('edit_all')}
                activeOpacity={0.7}
              >
                <Text variant="caption" style={editAll ? styles.chipActiveText : styles.chipText}>
                  {t('multiUser:permissions.scopeAll', { defaultValue: 'Tümünü' })}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  group: {
    gap: spacing.xs,
  },
  groupHeader: {
    marginLeft: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  levelHelp: {
    marginLeft: spacing.xs,
    marginBottom: spacing.xs,
    lineHeight: 16,
  },
  noModuleWarning: {
    marginHorizontal: spacing.xs,
    lineHeight: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  rowLabel: {
    flex: 1,
    marginRight: spacing.md,
  },
  subRow: {
    paddingLeft: spacing.xl,
    backgroundColor: colors.surfaceLight,
  },
  scopeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
  },
  chip: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.textMuted,
  },
  chipActiveText: {
    color: colors.primary,
    fontWeight: '700',
  },
});
