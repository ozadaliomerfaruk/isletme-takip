import { View, TouchableOpacity } from 'react-native';
import { ArrowUpRight, ArrowDownLeft } from 'lucide-react-native';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { styles } from '../styles';

export function CategoryItem({
  name,
  categoryType,
  onToggleType,
  t,
}: {
  name: string;
  categoryType: 'gelir' | 'gider';
  onToggleType: () => void;
  t: (key: string) => string;
}) {
  const isGelir = categoryType === 'gelir';
  return (
    <View style={styles.categoryItem}>
      <View style={styles.categoryItemLeft}>
        <View style={[
          styles.categoryIconContainer,
          { backgroundColor: isGelir ? colors.successLight : colors.errorLight },
        ]}>
          {isGelir ? (
            <ArrowUpRight size={20} color={colors.success} />
          ) : (
            <ArrowDownLeft size={20} color={colors.error} />
          )}
        </View>
        <View style={styles.categoryItemInfo}>
          <Text variant="body" numberOfLines={1}>{name}</Text>
          <Text variant="caption" color="secondary">
            {isGelir ? t('dataImport.categoryTypes.income') : t('dataImport.categoryTypes.expense')}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={[
          styles.categoryTypeButton,
          { backgroundColor: isGelir ? colors.successLight : colors.errorLight },
        ]}
        onPress={onToggleType}
        activeOpacity={0.7}
      >
        <Text style={{
          fontSize: 12,
          fontWeight: '600',
          color: isGelir ? colors.success : colors.error,
        }}>
          {isGelir ? t('dataImport.badges.income') : t('dataImport.badges.expense')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
