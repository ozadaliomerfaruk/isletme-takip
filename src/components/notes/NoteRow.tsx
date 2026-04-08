import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { StickyNote } from 'lucide-react-native';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useDateFormat } from '@/hooks/useDateFormat';
import type { Not } from '@/types/database';

interface NoteRowProps {
  note: Not;
  onPress?: () => void;
  onLongPress?: () => void;
}

export function NoteRow({ note, onPress, onLongPress }: NoteRowProps) {
  const { formatDateSmart } = useDateFormat();

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      <View style={styles.iconContainer}>
        <StickyNote size={16} color={colors.warning} />
      </View>
      <View style={styles.content}>
        <Text variant="body" numberOfLines={3} style={styles.text}>
          {note.content}
        </Text>
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
  iconContainer: {
    marginTop: 2,
  },
  content: {
    flex: 1,
    gap: spacing.xs,
  },
  text: {
    lineHeight: 20,
  },
});
