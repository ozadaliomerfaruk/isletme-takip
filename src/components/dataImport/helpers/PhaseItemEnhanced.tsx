import { View, ActivityIndicator } from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { styles } from '../styles';

export function PhaseItemEnhanced({
  label,
  active,
  done,
  count,
  showProgress = false,
  current,
  total,
}: {
  label: string;
  active: boolean;
  done: boolean;
  count?: number;
  showProgress?: boolean;
  current?: number;
  total?: number;
}) {
  return (
    <View style={styles.phaseItem}>
      {done ? (
        <CheckCircle2 size={20} color={colors.success} />
      ) : active ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <View style={styles.phaseCircle} />
      )}
      <View style={styles.phaseItemContent}>
        <Text
          variant="body"
          style={{ color: done ? colors.success : active ? colors.primary : colors.textMuted }}
        >
          {label}
        </Text>
        {(done || active) && count !== undefined && count > 0 && (
          <Text variant="caption" color="muted" style={styles.phaseCount}>
            {showProgress && current !== undefined && total !== undefined
              ? `(${current.toLocaleString()} / ${total.toLocaleString()})`
              : `(${count.toLocaleString()})`}
          </Text>
        )}
      </View>
    </View>
  );
}
