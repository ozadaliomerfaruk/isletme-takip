import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Circle, CheckCircle2, Bell, Camera } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useDateFormat } from '@/hooks/useDateFormat';
import type { Not } from '@/types/database';

interface NoteRowProps {
  note: Not;
  onPress?: () => void;
  onLongPress?: () => void;
  onToggleComplete?: (id: string, completed: boolean) => void;
  assignedUserName?: string | null;
  assignedCariName?: string | null;
  assignedPersonelName?: string | null;
}

export function NoteRow({
  note,
  onPress,
  onLongPress,
  onToggleComplete,
  assignedUserName,
  assignedCariName,
  assignedPersonelName,
}: NoteRowProps) {
  const { formatDateSmart } = useDateFormat();
  const { t } = useTranslation(['common']);

  const isOverdue =
    note.reminder_date && !note.is_completed && new Date(note.reminder_date) < new Date();

  const hasAssignment = assignedUserName || assignedCariName || assignedPersonelName;
  const hasBadges = note.reminder_date || note.photo_path || hasAssignment;

  return (
    <TouchableOpacity
      style={[styles.container, note.is_completed && styles.containerCompleted]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      {/* Checkbox */}
      <TouchableOpacity
        style={styles.checkbox}
        onPress={() => onToggleComplete?.(note.id, !note.is_completed)}
        hitSlop={8}
      >
        {note.is_completed ? (
          <CheckCircle2 size={20} color={colors.success} fill={colors.success} />
        ) : (
          <Circle size={20} color={colors.textMuted} />
        )}
      </TouchableOpacity>

      {/* Content */}
      <View style={styles.content}>
        <Text
          variant="body"
          numberOfLines={3}
          style={[styles.text, note.is_completed && styles.textCompleted]}
        >
          {note.content}
        </Text>

        {/* Badges Row */}
        {hasBadges && (
          <View style={styles.badgeRow}>
            {note.reminder_date && (
              <View style={[styles.badge, isOverdue && styles.badgeOverdue]}>
                <Bell size={10} color={isOverdue ? colors.error : colors.warning} />
                <Text
                  variant="caption"
                  style={[styles.badgeText, isOverdue && styles.badgeTextOverdue]}
                >
                  {isOverdue
                    ? t('common:notes.overdue')
                    : formatDateSmart(note.reminder_date)}
                </Text>
              </View>
            )}
            {note.photo_path && (
              <View style={styles.badge}>
                <Camera size={10} color={colors.textMuted} />
              </View>
            )}
            {assignedUserName && (
              <View style={styles.badge}>
                <Text variant="caption" style={styles.badgeText}>
                  {assignedUserName}
                </Text>
              </View>
            )}
            {assignedCariName && (
              <View style={styles.badge}>
                <Text variant="caption" style={styles.badgeText}>
                  {assignedCariName}
                </Text>
              </View>
            )}
            {assignedPersonelName && (
              <View style={styles.badge}>
                <Text variant="caption" style={styles.badgeText}>
                  {assignedPersonelName}
                </Text>
              </View>
            )}
          </View>
        )}

        <Text variant="caption" color="muted">
          {formatDateSmart(note.created_at)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.xs,
    gap: spacing.sm,
  },
  containerCompleted: {
    backgroundColor: colors.surfaceLight,
    opacity: 0.8,
  },
  checkbox: {
    marginTop: 2,
  },
  content: {
    flex: 1,
    gap: spacing.xs,
  },
  text: {
    lineHeight: 20,
  },
  textCompleted: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  badgeOverdue: {
    backgroundColor: colors.errorLight,
  },
  badgeText: {
    fontSize: 10,
  },
  badgeTextOverdue: {
    color: colors.error,
  },
});
