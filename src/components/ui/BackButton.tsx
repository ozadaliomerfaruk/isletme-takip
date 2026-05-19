import { TouchableOpacity, Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, type LucideIcon } from 'lucide-react-native';
import { colors } from '@/constants/colors';

interface BackButtonProps {
  onPress?: () => void;
  fallbackRoute?: string;
  size?: number;
  color?: string;
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
}

export function BackButton({
  onPress,
  fallbackRoute = '/(tabs)',
  size = 24,
  color = colors.text,
  icon: Icon = ChevronLeft,
  style,
}: BackButtonProps) {
  const router = useRouter();

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallbackRoute as never);
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[styles.container, style]}
      hitSlop={8}
    >
      <Icon size={size} color={color} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 8,
    marginLeft: Platform.OS === 'ios' ? -8 : 0,
  },
});
