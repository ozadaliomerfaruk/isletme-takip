import { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Image, LayoutAnimation, Platform, UIManager, Share } from 'react-native';
import { Circle, CheckCircle2, Bell, Camera, User, Users, UserCircle, Pencil, Share2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, HIT_SLOP } from '@/constants/spacing';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useCariler } from '@/hooks/useCariler';
import { usePersonelList } from '@/hooks/usePersonel';
import { useIsletmeUsers } from '@/hooks/useMultiUser';
import { supabase } from '@/lib/supabase';
import { parseDateFromDB } from '@/lib/date';
import type { Not } from '@/types/database';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface NoteRowProps {
  note: Not;
  onEdit?: () => void;
  onLongPress?: () => void;
  onToggleComplete?: (id: string, done: boolean) => void;
  onMarkAsTask?: (id: string) => void;
  onPhotoPress?: (photoPath: string) => void;
  assignedUserName?: string | null;
  assignedCariName?: string | null;
  assignedPersonelName?: string | null;
}

export function NoteRow({
  note,
  onEdit,
  onLongPress,
  onToggleComplete,
  onMarkAsTask,
  onPhotoPress,
  assignedUserName: assignedUserNameProp,
  assignedCariName: assignedCariNameProp,
  assignedPersonelName: assignedPersonelNameProp,
}: NoteRowProps) {
  const { formatDateSmart } = useDateFormat();
  const { t } = useTranslation(['common']);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const { data: cariler } = useCariler(undefined, true, true);
  const { data: personeller } = usePersonelList(true, true);
  const { data: isletmeUsers } = useIsletmeUsers();

  const resolvedCariName = useMemo(() => {
    if (!note.assigned_to_cari || !cariler) return null;
    return cariler.find(x => x.id === note.assigned_to_cari)?.name ?? null;
  }, [note.assigned_to_cari, cariler]);

  const resolvedPersonelName = useMemo(() => {
    if (!note.assigned_to_personel || !personeller) return null;
    const p = personeller.find(x => x.id === note.assigned_to_personel);
    return p ? [p.first_name, p.last_name].filter(Boolean).join(' ') : null;
  }, [note.assigned_to_personel, personeller]);

  const resolvedUserName = useMemo(() => {
    if (!note.assigned_to_user || !isletmeUsers) return null;
    const u = isletmeUsers.find(x => x.user_id === note.assigned_to_user);
    return u?.profile?.display_name ?? u?.profile?.email ?? null;
  }, [note.assigned_to_user, isletmeUsers]);

  const assignedCariName = assignedCariNameProp ?? resolvedCariName;
  const assignedPersonelName = assignedPersonelNameProp ?? resolvedPersonelName;
  const assignedUserName = assignedUserNameProp ?? resolvedUserName;

  const isTask = note.is_completed;
  const isDone = !!note.completed_at;
  const isOverdue =
    note.reminder_date && !isDone && new Date(note.reminder_date) < new Date();

  useEffect(() => {
    // FlashList recycle: yeni nota geçerken eski thumbnail'i HEMEN temizle (stale foto sızmasın)
    setThumbUrl(null);
    if (note.photo_path) {
      supabase.storage
        .from('islem-photos')
        .createSignedUrl(note.photo_path, 3600)
        .then(({ data }) => {
          if (data?.signedUrl) setThumbUrl(data.signedUrl);
        });
    }
  }, [note.photo_path]);

  // FlashList recycle güvenliği: hücre farklı bir nota yeniden kullanıldığında (note.id değişince)
  // "genişletilmiş" durumu sıfırla — eski notun açık hali yeni notta görünmesin.
  useEffect(() => {
    setExpanded(false);
  }, [note.id]);

  const formatReminder = (dateStr: string) => {
    const date = parseDateFromDB(dateStr);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t('common:date.today');
    if (diffDays === 1) return t('common:date.tomorrow');
    return formatDateSmart(dateStr);
  };

  const handlePress = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: note.content,
      });
    } catch { /* user cancelled */ }
  };

  return (
    <TouchableOpacity
      style={[
        styles.container,
        isTask && !isDone && styles.containerTask,
        isTask && isDone && styles.containerTaskCompleted,
      ]}
      onPress={handlePress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      {/* Task header label */}
      {isTask && (
        <View style={styles.taskHeader}>
          <Text variant="caption" style={[styles.taskHeaderText, isDone && { color: colors.success }]}>
            {isDone ? t('common:notes.completed') : t('common:notes.taskLabel')}
          </Text>
        </View>
      )}

      <View style={styles.mainRow}>
        {/* Left: Task checkbox (only for tasks) */}
        {isTask && (
          <TouchableOpacity
            style={styles.checkbox}
            onPress={() => onToggleComplete?.(note.id, !isDone)}
            hitSlop={HIT_SLOP.md}
          >
            {isDone ? (
              <View style={styles.checkDone}>
                <CheckCircle2 size={22} color="#fff" strokeWidth={2.5} />
              </View>
            ) : (
              <Circle size={22} color={colors.orange} strokeWidth={1.5} />
            )}
          </TouchableOpacity>
        )}

        {/* Middle: Content */}
        <View style={styles.content}>
          <Text
            variant="body"
            numberOfLines={expanded ? undefined : 3}
            style={[
              styles.text,
              isTask && isDone && styles.textCompleted,
            ]}
          >
            {note.content}
          </Text>

          {/* Meta row */}
          <View style={styles.metaRow}>
            {note.entity_type === 'personel_izin' && (
              <View style={[styles.chip, styles.chipSource]}>
                <Text variant="caption" style={styles.chipSourceText}>
                  {t('common:notes.sourceLeave')}
                </Text>
              </View>
            )}

            {note.reminder_date && (
              <View style={[styles.chip, isOverdue ? styles.chipOverdue : styles.chipReminder]}>
                <Bell size={11} color={isOverdue ? colors.error : colors.warning} />
                <Text variant="caption" style={[styles.chipText, isOverdue && styles.chipTextOverdue]}>
                  {isOverdue ? t('common:notes.overdue') : formatReminder(note.reminder_date)}
                </Text>
              </View>
            )}

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

        {note.photo_path && !thumbUrl && (
          <View style={styles.photoPlaceholder}>
            <Camera size={16} color={colors.textMuted} />
          </View>
        )}
      </View>

      {/* Expanded actions */}
      {expanded && (
        <View style={styles.expandedActions}>
          {onEdit && (
            <TouchableOpacity style={styles.actionBtn} onPress={onEdit} activeOpacity={0.7}>
              <Pencil size={16} color={colors.primary} />
              <Text variant="caption" style={styles.actionText}>
                {t('common:buttons.edit')}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.actionBtn} onPress={handleShare} activeOpacity={0.7}>
            <Share2 size={16} color={colors.primary} />
            <Text variant="caption" style={styles.actionText}>
              {t('common:buttons.share')}
            </Text>
          </TouchableOpacity>
          {!isTask && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnTask]}
              onPress={() => onMarkAsTask?.(note.id)}
              activeOpacity={0.7}
            >
              <CheckCircle2 size={16} color={colors.orange} />
              <Text variant="caption" style={[styles.actionText, { color: colors.orange }]}>
                {t('common:notes.markAsTask')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFDE7',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#FFF59D',
  },
  containerTask: {
    borderColor: colors.orange,
    borderWidth: 1.5,
    backgroundColor: colors.orangeLight,
  },
  containerTaskCompleted: {
    borderColor: colors.success,
    backgroundColor: colors.successLight,
    opacity: 0.8,
  },
  taskHeader: {
    marginBottom: spacing.xs,
  },
  taskHeaderText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.orange,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  checkbox: {
    marginTop: 1,
  },
  checkDone: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.success,
    justifyContent: 'center',
    alignItems: 'center',
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
  chipSource: {
    backgroundColor: colors.infoLight,
  },
  chipSourceText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.info,
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
  expandedActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
  },
  actionBtnTask: {
    backgroundColor: colors.orangeLight,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
});
