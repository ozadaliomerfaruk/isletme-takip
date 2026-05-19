import { View, TouchableOpacity } from 'react-native';
import { Users, UserRound, ArrowLeftRight } from 'lucide-react-native';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { useTranslation } from 'react-i18next';
import type { AccountMapping } from '@/lib/excelImport';
import { ENTITY_TYPE_VALUES, CARI_TYPE_VALUES } from '../types';
import { styles } from '../styles';

export function ClientPersonelItem({
  name,
  mapping,
  onToggleToHesap,
  onToggleEntityType,
  onSubTypeChange,
}: {
  name: string;
  mapping: AccountMapping;
  onToggleToHesap: () => void;
  onToggleEntityType: (type: 'cari' | 'personel') => void;
  onSubTypeChange: (subType: string) => void;
}) {
  const { t } = useTranslation('settings');
  const isPersonel = mapping.type === 'personel';
  const iconColor = isPersonel ? colors.success : colors.warning;
  const iconBgColor = isPersonel ? colors.successLight : colors.warningLight;
  const Icon = isPersonel ? UserRound : Users;
  const typeLabel = isPersonel ? t('dataImport.badges.staff') : t('dataImport.badges.client');

  return (
    <View style={styles.accountItem}>
      <View style={styles.accountHeader}>
        <View style={[styles.accountIconContainer, { backgroundColor: iconBgColor }]}>
          <Icon size={20} color={iconColor} />
        </View>
        <View style={styles.accountInfo}>
          <Text variant="body" numberOfLines={1}>{name}</Text>
          <View style={styles.accountBadgeRow}>
            <View style={[styles.typeBadge, { backgroundColor: iconBgColor }]}>
              <Text variant="caption" style={{ color: iconColor, fontWeight: '600' }}>{typeLabel}</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity onPress={onToggleToHesap} style={styles.toggleButton}>
          <ArrowLeftRight size={14} color={colors.primary} />
          <Text variant="caption" style={{ color: colors.primary, fontWeight: '600' }}>{t('dataImport.buttons.convertToAccount')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.subTypeRow}>
        {ENTITY_TYPE_VALUES.map((typeValue) => (
          <TouchableOpacity
            key={typeValue}
            style={[
              styles.subTypeChip,
              mapping.type === typeValue && (typeValue === 'personel' ? styles.subTypeChipActiveSuccess : styles.subTypeChipActiveWarning),
            ]}
            onPress={() => onToggleEntityType(typeValue as 'cari' | 'personel')}
          >
            <Text
              variant="caption"
              style={{
                color: mapping.type === typeValue ? (typeValue === 'personel' ? colors.success : colors.warning) : colors.textSecondary,
                fontWeight: mapping.type === typeValue ? '600' : '400',
              }}
            >
              {t(`dataImport.entityTypes.${typeValue}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {!isPersonel && (
        <View style={[styles.subTypeRow, { marginTop: spacing.xs }]}>
          {CARI_TYPE_VALUES.map((typeValue) => (
            <TouchableOpacity
              key={typeValue}
              style={[
                styles.subTypeChipSmall,
                mapping.cariType === typeValue && styles.subTypeChipActiveWarning,
              ]}
              onPress={() => onSubTypeChange(typeValue)}
            >
              <Text
                variant="caption"
                style={{
                  color: mapping.cariType === typeValue ? colors.warning : colors.textSecondary,
                  fontWeight: mapping.cariType === typeValue ? '600' : '400',
                  fontSize: 11,
                }}
              >
                {t(`dataImport.clientTypes.${typeValue}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}
