import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from './Text';

// 10 pastel renk paleti - WhatsApp tarzı
const AVATAR_COLORS = [
  { bg: '#E8F5E9', text: '#2E7D32' }, // yeşil
  { bg: '#E3F2FD', text: '#1565C0' }, // mavi
  { bg: '#FFF3E0', text: '#E65100' }, // turuncu
  { bg: '#F3E5F5', text: '#7B1FA2' }, // mor
  { bg: '#E0F7FA', text: '#00838F' }, // cyan
  { bg: '#FCE4EC', text: '#C62828' }, // kırmızı
  { bg: '#FFF8E1', text: '#F57F17' }, // sarı
  { bg: '#E8EAF6', text: '#283593' }, // indigo
  { bg: '#E0F2F1', text: '#00695C' }, // teal
  { bg: '#EFEBE9', text: '#4E342E' }, // kahve
] as const;

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed.charAt(0).toLocaleUpperCase('tr-TR');
}

interface AvatarProps {
  name: string;
  size?: 32 | 40 | 48 | 64;
}

export const Avatar = memo(function Avatar({ name, size = 40 }: AvatarProps) {
  const colorIndex = hashName(name) % AVATAR_COLORS.length;
  const { bg, text } = AVATAR_COLORS[colorIndex];
  const initial = getInitial(name);
  const fontSize = size * 0.42;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
        },
      ]}
    >
      <Text
        style={[
          styles.initial,
          {
            fontSize,
            color: text,
          },
        ]}
      >
        {initial}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontWeight: '700',
    textAlign: 'center',
  },
});
