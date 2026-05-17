import { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Circle, CheckCircle2, Bell, Camera, User, Users, UserCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useDateFormat } from '@/hooks/useDateFormat';
import { supabase } from '@/lib/supabase';
import type { Not } from '@/types/database';

interface NoteRowProps {
  note: Not;
  onPress?: () => void;
  onLongPress?: () => void;
  onToggleComplete?: (id: string, completed: boolean) => void;
  onPhotoPress?: (photoPath: string) => void;
  assignedUserName?: string | null;
  assignedCariName?: string | null;
  assignedPersonelName?: string | null;
}

export function NoteRow({
  note,
  onPress,
  onLongPress,
  onToggleComplete,
  onPhotoPress,
  assignedUserName,
  assignedCariName,
  assignedPersonelName,
}: NoteRowProps) {
  const { formatDateSmart } = useDateFormat();
  const { t } = useTranslation(['common']);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  const isOverdue =
    note.reminder_date && !note.is_completed && new Date(note.reminder_date) < new Date();

  useEffect(() => {
    if (note.photo_path) {
      supabase.storage
        .from('islem-photos')
        .createSignedUrl(note.photo_path, 3600)
        .then(({ data }) => {
          if (data?.signedUrl) setThumbUrl(data.signedUrl);
        });
    } else {
      setThumbUrl(null);
    }
  }, [note.photo_path]);

  const formatReminder = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t('common:date.today');
    if (diffDays === 1) return t('common:date.tomorrow');
    return formatDateSmart(dateStr);
  };

  return (
    <TouchableOpacity
      style={[styles.container, note.is_completed && styles.containerCompleted]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      {/* Left: Checkbox */}
      <TouchableOpacity
        style={styles.checkbox}
        onPress={() => onToggleComplete?.(note.id, !note.is_completed)}
        hitSlop={10}
      >
        {note.is_completed ? (
          <CheckCircle2 size={22} color={colors.success} fill={colors.success} />
        ) : (
          <Circle size={22} color={colors.border} strokeWidth={1.5} />
        )}
      </TouchableOpacity>

      {/* Middle: Content */}
      <View style={styles.content}>
        <Text
          variant="body"
          numberOfLines={3}
          style={[styles.text, note.is_completed && styles.textCompleted]}
        >
          {note.content}
        </Text>

        {/* Meta row */}
        <View style={styles.metaRow}>
          {/* Reminder */}
          {note.reminder_date && (
            <View style={[styles.chip, isOverdue ? styles.chipOverdue : styles.chipReminder]}>
              <Bell size={11} color={isOverdue ? colors.error : colors.warning} />
              <Text variant="caption" style={[styles.chipText, isOverdue && styles.chipTextOverdue]}>
                {isOverdue ? t('common:notes.overdue') : formatReminder(note.reminder_date)}
              </Text>
            </View>
          )}

          {/* Assigned people */}
          {assignedUserName && (
            <View style={[styles.chip, styles.chipAssign]}>
              <User size={10} color={colors.info} />
              <Text variant="caption" style={styles.chipText} numberOfLines={1}>
                {assignedUserName}
              </Text>
            </View>
          )}
          {assignedCariName && (
            <View style={[styles.chip, styles.chipAssign]}>
              <Users size={10} color={colors.info} />
              <Text variant="caption" style={styles.chipText} numberOfLines={1}>
                {assignedCariName}
              </Text>
            </View>
          )}
          {assignedPersonelName && (
            <View style={[styles.chip, styles.chipAssign]}>
              <UserCircle size={10} color={colors.success} />
              <Text variant="caption" style={styles.chipText} numberOfLines={1}>
                {assignedPersonelName}
              </Text>
            </View>
          )}

          {/* Date */}
          <Text variant="caption" color="muted" style={styles.dateText}>
            {formatDateSmart(note.created_at)}
          </Text>
        </View>
      </View>

      {/* Right: Photo thumbnail */}
      {thumbUrl && (
        <TouchableOpacity
          style={styles.photoContainer}
          onPress={() => note.photo_path && onPhotoPress?.(note.photo_path)}
          activeOpacity={0.8}
        >
          <Image source={{ uri: thumbUrl }} style={styles.photo} />
          <View style={styles.photoBadge}>
            <Camera size={8} color="#fff" />
          </View>
        </TouchableOpacity>
      )}

      {/* Photo indicator when no thumbnail loaded yet but has photo */}
      {note.photo_path && !thumbUrl && (
        <View style={styles.photoPlaceholder}>
          <Camera size={16} color={colors.textMuted} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  containerCompleted: {
    backgroundColor: colors.surfaceLight,
    borderColor: colors.border,
  },
  checkbox: {
    marginTop: 1,
  },
  content: {
    flex: 1,
    gap: 6,
  },
  text: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.text,
  },
  textCompleted: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  chipReminder: {
    backgroundColor: colors.warningLight,
  },
  chipOverdue: {
    backgroundColor: colors.errorLight,
  },
  chipAssign: {
    backgroundColor: colors.primaryLight,
  },
  chipText: {
    fontSize: 11,
    color: colors.textSecondary,
    maxWidth: 80,
  },
  chipTextOverdue: {
    color: colors.error,
  },
  dateText: {
    fontSize: 11,
  },
  photoContainer: {
    position: 'relative',
    marginLeft: spacing.xs,
  },
  photo: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
  },
  photoBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.xs,
  },
});
