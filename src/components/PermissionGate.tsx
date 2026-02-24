import { ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { Lock } from 'lucide-react-native';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from 'react-i18next';
import type { Permissions } from '@/types/multiUser';

type ModuleName = keyof Permissions['modules'];
type ActionType = 'create' | 'update' | 'delete';

interface PermissionGateProps {
  children: ReactNode;
  module?: ModuleName;
  action?: ActionType;
  createdBy?: string | null;
  fallback?: ReactNode;
  showMessage?: boolean;
}

export function PermissionGate({
  children,
  module,
  action,
  createdBy,
  fallback = null,
  showMessage = false,
}: PermissionGateProps) {
  const { t } = useTranslation('multiUser');
  const { isOwner, canAccessModule, canCreate, canUpdate, canDelete } = usePermissions();

  if (isOwner) {
    return <>{children}</>;
  }

  if (module && !canAccessModule(module)) {
    return showMessage ? (
      <View style={styles.noPermission}>
        <Lock size={16} color={colors.textMuted} />
        <Text variant="caption" color="muted">{t('permissions.noModuleAccess')}</Text>
      </View>
    ) : <>{fallback}</>;
  }

  if (module && action) {
    let hasPermission = false;

    switch (action) {
      case 'create':
        hasPermission = canCreate(module);
        break;
      case 'update':
        hasPermission = canUpdate(module, createdBy ?? null);
        break;
      case 'delete':
        hasPermission = canDelete(module, createdBy ?? null);
        break;
    }

    if (!hasPermission) {
      return showMessage ? (
        <View style={styles.noPermission}>
          <Lock size={16} color={colors.textMuted} />
          <Text variant="caption" color="muted">{t('permissions.noActionAccess')}</Text>
        </View>
      ) : <>{fallback}</>;
    }
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  noPermission: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
  },
});
