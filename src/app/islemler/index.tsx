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
import { formatCurrency, toNumber } from '@/lib/currency';
import { formatDateMedium } from '@/lib/date';
import { getIslemIcon, getIslemIconBg, getIslemTypeLabel, getIslemAmountColor, getIslemAmountPrefix } from '@/lib/icons';
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
  const [expandedIslemId, setExpandedIslemId] = useState<string | null>(null);

  const { data: islemler, isLoading } = useIslemler();
  const deleteIslem = useDeleteIslem();

  const filteredIslemler = (islemler || []).filter((islem) => {
    let matchesFilter = filter === 'all';
    // Gelir sekmesi: gelirimizi artıran işlemler (tahsilat hariç - o nakit akışı)
    if (filter === 'gelir') {
      matchesFilter = ['gelir', 'cari_satis'].includes(islem.type);
    }
    // Gider sekmesi: giderimizi artıran işlemler (ödeme hariç - o nakit akışı)
    if (filter === 'gider') {
      matchesFilter = ['gider', 'cari_alis', 'personel_gider'].includes(islem.type);
    }
    if (filter === 'transfer') matchesFilter = islem.type === 'transfer';
    if (filter === 'cari') matchesFilter = islem.type.startsWith('cari_');
    if (filter === 'personel') matchesFilter = islem.type.startsWith('personel_');

    const searchLower = searchQuery.toLowerCase();
    const personelName = islem.personel
      ? `${islem.personel.first_name || ''} ${islem.personel.last_name || ''}`.trim().toLowerCase()
      : '';
    const matchesSearch =
      (islem.description?.toLowerCase().includes(searchLower) || false) ||
      (islem.hesap?.name?.toLowerCase().includes(searchLower) || false) ||
      (islem.cari?.name?.toLowerCase().includes(searchLower) || false) ||
      (islem.kategori?.name?.toLowerCase().includes(searchLower) || false) ||
      (personelName.includes(searchLower));

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

  // İşlem tipi + ilgili kişi/hesap bilgisi
  const getIslemSecondLine = (islem: IslemWithRelations) => {
    const parts = [getIslemTypeLabel(islem.type)];

    // Transfer için hesaplar
    if (islem.type === 'transfer') {
      if (islem.hesap?.name && islem.hedef_hesap?.name) {
        parts.push(`${islem.hesap.name} → ${islem.hedef_hesap.name}`);
      }
    } else if (islem.cari?.name) {
      parts.push(islem.cari.name);
    } else if (islem.personel) {
      parts.push(`${islem.personel.first_name} ${islem.personel.last_name}`);
    } else if (islem.hesap?.name) {
      parts.push(islem.hesap.name);
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
                  expanded={expandedIslemId === islem.id}
                  onToggle={() => setExpandedIslemId(expandedIslemId === islem.id ? null : islem.id)}
                  header={
                    <View style={styles.islemHeader}>
                      <View style={[
                        styles.islemIconContainer,
                        { backgroundColor: getIslemIconBg(islem.type) }
                      ]}>
                        {getIslemIcon(islem.type, 24)}
                      </View>
                      <View style={styles.islemInfo}>
                        <Text variant="body">{formatDateMedium(islem.date)}</Text>
                        <Text variant="caption" color="secondary">
                          {getIslemSecondLine(islem)}
                        </Text>
                        {islem.kategori?.name && (
                          <Text variant="caption" color="secondary">
                            {islem.kategori.name}
                          </Text>
                        )}
                        {islem.description && (
                          <Text variant="caption" color="secondary" numberOfLines={1}>
                            {islem.description}
                          </Text>
                        )}
                      </View>
                      <Text
                        variant="h3"
                        color={getIslemAmountColor(islem.type)}
                      >
                        {getIslemAmountPrefix(islem.type)}
                        {formatCurrency(toNumber(islem.amount))}
                      </Text>
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
  islemActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});
