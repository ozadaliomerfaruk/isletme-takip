import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import {
  CalendarClock,
  TrendingUp,
  TrendingDown,
  Check,
  Pencil,
  Trash2,
} from 'lucide-react-native';
import { Text, Card, ExpandableCard, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { IleriTarihliIslemWithRelations } from '@/types/database';
import { ISLEM_TYPE_LABELS } from '@/constants/islemTypes';
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
  title = 'İleri Tarihli İşlemler',
}: IleriTarihliIslemlerSectionProps) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const completeIslem = useCompleteIleriTarihliIslem();
  const deleteIslem = useDeleteIleriTarihliIslem();

  if (isLoading || !ileriTarihliIslemler || ileriTarihliIslemler.length === 0) {
    return null;
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const day = date.getDate();
    const months = [
      'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
      'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
    ];
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
      'İşlemi Gerçekleştir',
      `${formatCurrency(item.amount)} tutarındaki ${ISLEM_TYPE_LABELS[item.type].toLowerCase()} işlemi gerçekleştirmek istiyor musunuz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Gerçekleştir',
          onPress: async () => {
            try {
              await completeIslem.mutateAsync(item.id);
              Alert.alert('Başarılı', 'İşleminiz başarıyla kaydedildi');
            } catch (error: any) {
              Alert.alert('Hata', error.message || 'İşlem gerçekleştirilemedi');
            }
          },
        },
      ]
    );
  };

  const handleDelete = (item: IleriTarihliIslemWithRelations) => {
    Alert.alert(
      'İşlemi Sil',
      'Bu ileri tarihli işlemi silmek istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteIslem.mutateAsync(item.id);
              Alert.alert('Başarılı', 'İleri tarihli işlem silindi');
            } catch (error: any) {
              Alert.alert('Hata', error.message || 'İşlem silinemedi');
            }
          },
        },
      ]
    );
  };

  const handleEdit = (item: IleriTarihliIslemWithRelations) => {
    // TODO: Düzenleme sayfasına yönlendir
    Alert.alert('Bilgi', 'Düzenleme özelliği yakında eklenecek');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <CalendarClock size={20} color={colors.primary} />
        <Text variant="h3">{title}</Text>
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
                      {item.description || ISLEM_TYPE_LABELS[item.type]}
                    </Text>
                    <Text
                      variant="caption"
                      style={{
                        color: overdue ? colors.error : today ? colors.warning : colors.textMuted,
                        fontWeight: overdue || today ? '600' : '400',
                      }}
                    >
                      {overdue ? 'Gecikmiş' : today ? 'Bugün' : formatDate(item.scheduled_date)}
                    </Text>
                  </View>
                  <View style={styles.itemSubRow}>
                    <Text variant="caption" color="secondary">
                      {item.kategori?.name || ISLEM_TYPE_LABELS[item.type]}
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
                Gerçekleşti
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<Pencil size={16} color={colors.text} />}
                onPress={() => handleEdit(item)}
                style={styles.actionButton}
              >
                Düzenle
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<Trash2 size={16} color={colors.error} />}
                onPress={() => handleDelete(item)}
                loading={deleteIslem.isPending}
                style={[styles.actionButton, styles.deleteButton]}
              >
                Sil
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
