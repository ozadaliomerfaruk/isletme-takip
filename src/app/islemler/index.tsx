import { useState } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Receipt,
  Pencil,
  Trash2,
  Users,
  UserCheck,
} from 'lucide-react-native';
import { Text, TabFilter, SearchInput, ExpandableCard, Button, EmptyState } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { formatCurrency, formatDateShort } from '@/lib/utils';
import { useIslemler, useDeleteIslem } from '@/hooks/useIslemler';
import { IslemType, IslemWithRelations } from '@/types/database';

const filterOptions = [
  { label: 'Tümü', value: 'all' },
  { label: 'Gelir', value: 'gelir' },
  { label: 'Gider', value: 'gider' },
  { label: 'Transfer', value: 'transfer' },
  { label: 'Cari', value: 'cari' },
  { label: 'Personel', value: 'personel' },
];

export default function IslemlerPage() {
  const router = useRouter();
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: islemler, isLoading } = useIslemler();
  const deleteIslem = useDeleteIslem();

  const filteredIslemler = (islemler || []).filter((islem) => {
    let matchesFilter = filter === 'all';
    if (filter === 'gelir') matchesFilter = islem.type === 'gelir';
    if (filter === 'gider') matchesFilter = islem.type === 'gider';
    if (filter === 'transfer') matchesFilter = islem.type === 'transfer';
    if (filter === 'cari') matchesFilter = islem.type.startsWith('cari_');
    if (filter === 'personel') matchesFilter = islem.type.startsWith('personel_');

    const searchLower = searchQuery.toLowerCase();
    const matchesSearch =
      (islem.description?.toLowerCase().includes(searchLower) || false) ||
      (islem.hesap?.name?.toLowerCase().includes(searchLower) || false) ||
      (islem.cari?.name?.toLowerCase().includes(searchLower) || false) ||
      ((islem.personel ? `${islem.personel.first_name} ${islem.personel.last_name}`.toLowerCase().includes(searchLower) : false));

    return matchesFilter && matchesSearch;
  });

  const handleDelete = (id: string, description: string) => {
    Alert.alert(
      'İşlemi Sil',
      `"${description}" işlemini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteIslem.mutateAsync(id);
              Alert.alert('Başarılı', 'İşlem silindi');
            } catch (error: any) {
              Alert.alert('Hata', error.message || 'İşlem silinemedi');
            }
          },
        },
      ]
    );
  };

  const getIslemIcon = (type: IslemType) => {
    switch (type) {
      case 'gelir':
        return <ArrowDownLeft size={24} color={colors.success} />;
      case 'gider':
        return <ArrowUpRight size={24} color={colors.error} />;
      case 'transfer':
        return <ArrowLeftRight size={24} color={colors.info} />;
      case 'cari_alis':
      case 'cari_satis':
      case 'cari_odeme':
      case 'cari_tahsilat':
        return <Users size={24} color={colors.warning} />;
      case 'personel_gider':
      case 'personel_odeme':
        return <UserCheck size={24} color={colors.primary} />;
      default:
        return <Receipt size={24} color={colors.textMuted} />;
    }
  };

  const getIslemIconBg = (type: IslemType) => {
    switch (type) {
      case 'gelir':
        return colors.successLight;
      case 'gider':
        return colors.errorLight;
      case 'transfer':
        return colors.infoLight;
      case 'cari_alis':
      case 'cari_satis':
      case 'cari_odeme':
      case 'cari_tahsilat':
        return colors.warningLight;
      case 'personel_gider':
      case 'personel_odeme':
        return colors.primaryLight;
      default:
        return colors.surfaceLight;
    }
  };

  const getIslemTypeLabel = (type: IslemType) => {
    switch (type) {
      case 'gelir':
        return 'Gelir';
      case 'gider':
        return 'Gider';
      case 'transfer':
        return 'Transfer';
      case 'cari_alis':
        return 'Tedarikçi Alış';
      case 'cari_satis':
        return 'Müşteri Satış';
      case 'cari_odeme':
        return 'Tedarikçi Ödeme';
      case 'cari_tahsilat':
        return 'Müşteri Tahsilat';
      case 'personel_gider':
        return 'Personel Gider';
      case 'personel_odeme':
        return 'Personel Ödeme';
      default:
        return type;
    }
  };

  const getAmountColor = (type: IslemType): 'success' | 'error' | 'primary' | 'warning' => {
    if (type === 'gelir' || type === 'cari_tahsilat') return 'success';
    if (type === 'gider' || type === 'cari_odeme' || type === 'personel_odeme') return 'error';
    if (type === 'transfer') return 'primary';
    return 'warning';
  };

  const getAmountPrefix = (type: IslemType) => {
    if (type === 'gelir' || type === 'cari_tahsilat') return '+';
    if (type === 'gider' || type === 'cari_odeme' || type === 'personel_odeme') return '-';
    return '';
  };

  const getIslemSubtitle = (islem: IslemWithRelations) => {
    const parts = [getIslemTypeLabel(islem.type)];

    if (islem.hesap?.name) {
      parts.push(islem.hesap.name);
    }

    if (islem.hedef_hesap?.name) {
      parts.push(`→ ${islem.hedef_hesap.name}`);
    }

    if (islem.cari?.name) {
      parts.push(islem.cari.name);
    }

    if (islem.personel) {
      parts.push(`${islem.personel.first_name} ${islem.personel.last_name}`);
    }

    return parts.join(' • ');
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Arama */}
          <View style={styles.searchContainer}>
            <SearchInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="İşlem ara..."
            />
          </View>

          {/* Filtre */}
          <View style={styles.filterContainer}>
            <TabFilter options={filterOptions} value={filter} onChange={setFilter} />
          </View>

          {/* İşlem Listesi */}
          <View style={styles.listContainer}>
            {isLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
            ) : filteredIslemler.length === 0 ? (
              <EmptyState
                icon={<Receipt size={48} color={colors.textMuted} />}
                title="İşlem bulunamadı"
                description={searchQuery || filter !== 'all'
                  ? "Arama kriterlerinize uygun işlem bulunmamaktadır."
                  : "Henüz işlem kaydedilmemiş. İlk işleminizi ekleyin."}
              />
            ) : (
              filteredIslemler.map((islem) => (
                <ExpandableCard
                  key={islem.id}
                  header={
                    <View style={styles.islemHeader}>
                      <View style={[
                        styles.islemIconContainer,
                        { backgroundColor: getIslemIconBg(islem.type) }
                      ]}>
                        {getIslemIcon(islem.type)}
                      </View>
                      <View style={styles.islemInfo}>
                        <Text variant="body">{islem.description || getIslemTypeLabel(islem.type)}</Text>
                        <Text variant="caption" color="secondary">
                          {getIslemSubtitle(islem)}
                        </Text>
                      </View>
                      <View style={styles.islemAmount}>
                        <Text
                          variant="h3"
                          color={getAmountColor(islem.type)}
                        >
                          {getAmountPrefix(islem.type)}
                          {formatCurrency(Number(islem.amount))}
                        </Text>
                        <Text variant="caption" color="secondary">
                          {formatDateShort(islem.date)}
                        </Text>
                      </View>
                    </View>
                  }
                >
                  <View style={styles.islemActions}>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Pencil size={16} color={colors.text} />}
                      onPress={() => router.push({ pathname: '/islemler/duzenle/[id]', params: { id: islem.id } })}
                      style={styles.actionButton}
                    >
                      Düzenle
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<Trash2 size={16} color={colors.error} />}
                      onPress={() => handleDelete(islem.id, islem.description || getIslemTypeLabel(islem.type))}
                      style={styles.actionButton}
                    >
                      Sil
                    </Button>
                  </View>
                </ExpandableCard>
              ))
            )}
          </View>
        </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    marginBottom: spacing.md,
  },
  filterContainer: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  listContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  loader: {
    marginTop: spacing.xl,
  },
  islemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  islemIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  islemInfo: {
    flex: 1,
  },
  islemAmount: {
    alignItems: 'flex-end',
  },
  islemActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});
