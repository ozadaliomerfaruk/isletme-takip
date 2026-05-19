import { Modal, TouchableOpacity, View, StyleSheet } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';

export interface DetailMenuAction {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  visible?: boolean;
  danger?: boolean;
  iconColor?: string;
}

interface DetailActionMenuProps {
  visible: boolean;
  onClose: () => void;
  actions: DetailMenuAction[];
}

export function DetailActionMenu({ visible, onClose, actions }: DetailActionMenuProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity
        style={styles.menuBackdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.menuContainer}>
          {actions
            .filter(a => a.visible !== false)
            .map((action, index) => {
              const Icon = action.icon;
              const iconColor = action.iconColor ?? (action.danger ? colors.error : colors.text);
              return (
                <TouchableOpacity
                  key={index}
                  style={[styles.menuItem, action.danger && styles.menuItemDanger]}
                  onPress={action.onPress}
                >
                  <Icon size={20} color={iconColor} />
                  <Text variant="body" color={action.danger ? 'error' : undefined}>
                    {action.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 60,
    paddingRight: spacing.md,
  },
  menuContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xs,
    minWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  menuItemDanger: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
    paddingTop: spacing.md + spacing.xs,
  },
});
