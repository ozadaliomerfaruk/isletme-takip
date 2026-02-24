import { View, StyleSheet } from 'react-native';
import { Pencil } from 'lucide-react-native';
import { Avatar } from '@/components/ui';
import { useProfile } from '@/hooks/useMultiUser';
import { colors } from '@/constants/colors';

interface UserAvatarProps {
  userId: string | null;
  updatedBy?: string | null;
  size?: 'sm' | 'md';
}

const avatarSizeMap = { sm: 32, md: 40 } as const;

export function UserAvatar({ userId, updatedBy, size = 'sm' }: UserAvatarProps) {
  const { data: profile } = useProfile(userId);
  const wasEdited = updatedBy && updatedBy !== userId;

  if (!userId) return null;

  const displayName = profile?.display_name ?? profile?.email ?? '?';

  return (
    <View style={styles.container}>
      <Avatar name={displayName} size={avatarSizeMap[size]} />
      {wasEdited && (
        <View style={styles.editBadge}>
          <Pencil size={8} color="#fff" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  editBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
});
