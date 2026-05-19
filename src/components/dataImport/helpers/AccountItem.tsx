import { View, TouchableOpacity } from 'react-native';
import { Building2, ArrowLeftRight } from 'lucide-react-native';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { useTranslation } from 'react-i18next';
import type { AccountMapping } from '@/lib/excelImport';
import { HESAP_TYPE_VALUES } from '../types';
import { styles } from '../styles';

export function AccountItem({
  name,
  mapping,
  onToggleType,
  onSubTypeChange,
  onCurrencyChange,
}: {
  name: string;
  mapping: AccountMapping;
  onToggleType: () => void;
  onSubTypeChange: (subType: string) => void;
  onCurrencyChange: () => void;
}) {
  const { t } = useTranslation('settings');
  return (
    <View style={styles.accountItem}>
      <View style={styles.accountHeader}>
        <View style={[styles.accountIconContainer, { backgroundColor: colors.infoLight }]}>
          <Building2 size={20} color={colors.info} />
        </View>
        <View style={styles.accountInfo}>
          <Text variant="body" numberOfLines={1}>{name}</Text>
          <View style={styles.accountBadgeRow}>
            <View style={[styles.typeBadge, { backgroundColor: colors.infoLight }]}>
              <Text variant="caption" style={{ color: colors.info, fontWeight: '600' }}>{t('dataImport.badges.account')}</Text>
            </View>
            {mapping.currency && (
              <TouchableOpacity
                onPress={onCurrencyChange}
                style={[styles.typeBadge, { backgroundColor: colors.primaryLight, marginLeft: 4 }]}
              >
                <Text variant="caption" style={{ color: colors.primary, fontWeight: '600' }}>{mapping.currency}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <TouchableOpacity onPress={onToggleType} style={styles.toggleButton}>
          <ArrowLeftRight size={14} color={colors.primary} />
          <Text variant="caption" style={{ color: colors.primary, fontWeight: '600' }}>{t('dataImport.buttons.convertToClient')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.subTypeRow}>
        {HESAP_TYPE_VALUES.map((typeValue) => (
          <TouchableOpacity
            key={typeValue}
            style={[
              styles.subTypeChip,
              mapping.hesapType === typeValue && styles.subTypeChipActive,
            ]}
            onPress={() => onSubTypeChange(typeValue)}
          >
            <Text
              variant="caption"
              style={{
                color: mapping.hesapType === typeValue ? colors.info : colors.textSecondary,
                fontWeight: mapping.hesapType === typeValue ? '600' : '400',
              }}
            >
              {t(`dataImport.accountTypes.${typeValue}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
