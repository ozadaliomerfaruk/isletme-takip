import { useState } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Users,
  Building2,
  User,
  Plus,
  ShoppingCart,
  CreditCard,
  Receipt,
  Banknote,
  History,
} from 'lucide-react-native';
import { Text, TabFilter, SearchInput, ExpandableCard, Button, EmptyState } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { formatCurrency, toNumber } from '@/lib/currency';
import { getCariIcon, getCariBalanceLabel } from '@/lib/icons';
import { useCariler } from '@/hooks/useCariler';
import { CariType } from '@/types/database';

const filterOptions = [
  { label: 'Tümü', value: 'all' },
  { label: 'Tedarikçiler', value: 'tedarikci' },
  { label: 'Müşteriler', value: 'musteri' },
];

export default function CarilerPage() {
  const router = useRouter();
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCariId, setExpandedCariId] = useState<string | null>(null);

  // Gerçek veriler
  const { data: cariler, isLoading } = useCariler(
    filter === 'all' ? undefined : (filter as CariType)
  );

  // Arama filtresi
  const filteredCariler = cariler?.filter((cari) =>
    cari.name.toLowerCase().includes(searchQuery.toLowerCase())
  );


  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text variant="h2">Cariler</Text>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={18} color={colors.white} />}
            onPress={() => router.push('/cariler/ekle')}
          >
            Ekle
          </Button>
        </View>

        {/* Arama */}
        <View style={styles.searchContainer}>
          <SearchInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Cari ara..."
          />
        </View>

        {/* Filtre */}
        <View style={styles.filterContainer}>
          <TabFilter options={filterOptions} value={filter} onChange={setFilter} />
        </View>

        {/* Cari Listesi */}
        <View style={styles.listContainer}>
          {isLoading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
          ) : !filteredCariler || filteredCariler.length === 0 ? (
            <EmptyState
              icon={<Users size={48} color={colors.textMuted} />}
              title={searchQuery ? 'Cari bulunamadı' : 'Henüz cari yok'}
              description={
                searchQuery
                  ? 'Arama kriterlerinize uygun cari bulunmamaktadır.'
                  : 'İlk carinizi ekleyerek başlayın'
              }
              actionLabel={searchQuery ? undefined : 'Cari Ekle'}
              onAction={searchQuery ? undefined : () => router.push('/cariler/ekle')}
            />
          ) : (
            filteredCariler.map((cari) => (
              <ExpandableCard
                key={cari.id}
                expanded={expandedCariId === cari.id}
                onToggle={() => setExpandedCariId(expandedCariId === cari.id ? null : cari.id)}
                header={
                  <View style={styles.cariHeader}>
                    {getCariIcon(cari.type, 24)}
                    <View style={styles.cariInfo}>
                      <Text variant="body">{cari.name}</Text>
                      <Text variant="caption" color="secondary">
                        {cari.type === 'tedarikci' ? 'Tedarikçi' : 'Müşteri'}
                        {cari.phone ? ` • ${cari.phone}` : ''}
                      </Text>
                    </View>
                    <View style={styles.cariBalance}>
                      <Text variant="caption" color="secondary">
                        {getCariBalanceLabel(cari.type, toNumber(cari.balance))}
                      </Text>
                      <Text
                        variant="h3"
                        color={
                          toNumber(cari.balance) === 0
                            ? 'secondary'
                            : toNumber(cari.balance) > 0
                            ? 'success'
                            : 'error'
                        }
                      >
                        {formatCurrency(Math.abs(toNumber(cari.balance)))}
                      </Text>
                    </View>
                  </View>
                }
              >
                <View style={styles.cariActions}>
                  {cari.type === 'tedarikci' ? (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<ShoppingCart size={16} color={colors.error} />}
                        onPress={() => router.push({ pathname: '/islemler/cariAlis', params: { cari_id: cari.id } })}
                        style={styles.actionButton}
                      >
                        Alış
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Banknote size={16} color={colors.success} />}
                        onPress={() => router.push({ pathname: '/islemler/cariOdeme', params: { cari_id: cari.id } })}
                        style={styles.actionButton}
                      >
                        Ödeme
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Receipt size={16} color={colors.success} />}
                        onPress={() => router.push({ pathname: '/islemler/cariSatis', params: { cari_id: cari.id } })}
                        style={styles.actionButton}
                      >
                        Satış
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<CreditCard size={16} color={colors.info} />}
                        onPress={() => router.push({ pathname: '/islemler/cariTahsilat', params: { cari_id: cari.id } })}
                        style={styles.actionButton}
                      >
                        Tahsilat
                      </Button>
                    </>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<History size={16} color={colors.text} />}
                    onPress={() => router.push(`/cariler/${cari.id}`)}
                    style={styles.actionButton}
                  >
                    Hareketler
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  searchContainer: {
    paddingHorizontal: spacing.lg,
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
  cariHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cariInfo: {
    flex: 1,
  },
  cariBalance: {
    alignItems: 'flex-end',
  },
  cariActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});
