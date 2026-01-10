import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  CalendarClock,
  TrendingUp,
  TrendingDown,
  Check,
  Pencil,
  Trash2,
} from 'lucide-react-native';
import { Text } from './Text';
import { Card } from './Card';
import { ExpandableCard } from './ExpandableCard';
import { Button } from './Button';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { IleriTarihliIslemWithRelations } from '@/types/database';
import {
  useCompleteIleriTarihliIslem,
  useDeleteIleriTarihliIslem,
} from '@/hooks/useIleriTarihliIslemler';

interface IleriTarihliIslemlerSectionProps {
  ileriTarihliIslemler: IleriTarihliIslemWithRelations[] | undefined;
  isLoading: boolean;
  title?: string;
}

export function IleriTarihliIslemlerSection({
  ileriTarihliIslemler,
  isLoading,
  title,
}: IleriTarihliIslemlerSectionProps) {
  const { t } = useTranslation(['transactions', 'common']);
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const completeIslem = useCompleteIleriTarihliIslem();
  const deleteIslem = useDeleteIleriTarihliIslem();

  const displayTitle = title ?? t('transactions:scheduled.title');

  if (isLoading || !ileriTarihliIslemler || ileriTarihliIslemler.length === 0) {
    return null;
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const day = date.getDate();
    const monthsResult = t('common:date.months', { returnObjects: true });
    const months = Array.isArray(monthsResult) ? monthsResult : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day} ${months[date.getMonth()]}`;
  };

  const isOverdue = (dateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const scheduled = new Date(dateStr + 'T00:00:00');
    return scheduled < today;
  };

  const isToday = (dateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const scheduled = new Date(dateStr + 'T00:00:00');
    scheduled.setHours(0, 0, 0, 0);
    return scheduled.getTime() === today.getTime();
  };

  const handleComplete = (item: IleriTarihliIslemWithRelations) => {
    Alert.alert(
      t('transactions:scheduled.execute'),
      t('transactions:scheduled.executeConfirm', { amount: formatCurrency(item.amount), type: t(`transactions:types.${item.type}`).toLowerCase() }),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('transactions:scheduled.execute'),
          onPress: async () => {
            try {
              await completeIslem.mutateAsync(item.id);
              Alert.alert(t('common:status.success'), t('transactions:messages.saveSuccess'));
            } catch (error: any) {
              Alert.alert(t('common:status.error'), error.message || t('transactions:messages.saveFailed'));
            }
          },
        },
      ]
    );
  };

  const handleDelete = (item: IleriTarihliIslemWithRelations) => {
    Alert.alert(
      t('transactions:scheduled.delete'),
      t('transactions:scheduled.deleteConfirm'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteIslem.mutateAsync(item.id);
              Alert.alert(t('common:status.success'), t('transactions:messages.deleteSuccess'));
            } catch (error: any) {
              Alert.alert(t('common:status.error'), error.message || t('transactions:messages.deleteFailed'));
            }
          },
        },
      ]
    );
  };

  const handleEdit = (item: IleriTarihliIslemWithRelations) => {
    // TODO: Düzenleme sayfasına yönlendir
    Alert.alert(t('common:status.info'), t('transactions:scheduled.comingSoon'));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <CalendarClock size={20} color={colors.primary} />
        <Text variant="h3">{displayTitle}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{ileriTarihliIslemler.length}</Text>
        </View>
      </View>

      {ileriTarihliIslemler.map((item) => {
        const overdue = isOverdue(item.scheduled_date);
        const today = isToday(item.scheduled_date);
        const isGelir = item.type === 'gelir';

        return (
          <ExpandableCard
            key={item.id}
            expanded={expandedId === item.id}
            onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
            header={
              <View style={styles.itemHeader}>
                <View
                  style={[
                    styles.itemIcon,
                    { backgroundColor: isGelir ? colors.success + '20' : colors.error + '20' },
                  ]}
                >
                  {isGelir ? (
                    <TrendingUp size={18} color={colors.success} />
                  ) : (
                    <TrendingDown size={18} color={colors.error} />
                  )}
                </View>
                <View style={styles.itemContent}>
                  <View style={styles.itemTitleRow}>
                    <Text variant="body" numberOfLines={1} style={styles.itemTitle}>
                      {item.description || t(`transactions:types.${item.type}`)}
                    </Text>
                    <Text
                      variant="caption"
                      style={{
                        color: overdue ? colors.error : today ? colors.warning : colors.textMuted,
                        fontWeight: overdue || today ? '600' : '400',
                      }}
                    >
                      {overdue ? t('transactions:scheduled.overdue') : today ? t('transactions:scheduled.dueToday') : formatDate(item.scheduled_date)}
                    </Text>
                  </View>
                  <View style={styles.itemSubRow}>
                    <Text variant="caption" color="secondary">
                      {item.kategori?.name || t(`transactions:types.${item.type}`)}
                    </Text>
                    <Text
                      variant="body"
                      style={{
                        color: isGelir ? colors.success : colors.error,
                        fontWeight: '600',
                      }}
                    >
                      {isGelir ? '+' : '-'}{formatCurrency(item.amount)}
                    </Text>
                  </View>
                </View>
              </View>
            }
          >
            <View style={styles.actions}>
              <Button
                variant="primary"
                size="sm"
                icon={<Check size={16} color={colors.surface} />}
                onPress={() => handleComplete(item)}
                loading={completeIslem.isPending}
                style={styles.actionButton}
              >
                {t('transactions:scheduled.executed')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<Pencil size={16} color={colors.text} />}
                onPress={() => handleEdit(item)}
                style={styles.actionButton}
              >
                {t('common:buttons.edit')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<Trash2 size={16} color={colors.error} />}
                onPress={() => handleDelete(item)}
                loading={deleteIslem.isPending}
                style={[styles.actionButton, styles.deleteButton]}
              >
                {t('common:buttons.delete')}
              </Button>
            </View>
          </ExpandableCard>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  badge: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '700',
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemContent: {
    flex: 1,
  },
  itemTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  itemTitle: {
    flex: 1,
    marginRight: spacing.sm,
  },
  itemSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  deleteButton: {
    borderColor: colors.error,
  },
});
