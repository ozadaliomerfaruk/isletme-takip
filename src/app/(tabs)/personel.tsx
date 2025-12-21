import { useState } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  UserCircle,
  Plus,
  MinusCircle,
  Banknote,
  History,
  Phone,
  Briefcase,
} from 'lucide-react-native';
import { Text, SearchInput, ExpandableCard, Button, EmptyState } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { formatCurrency, getInitials } from '@/lib/utils';
import { usePersonelList } from '@/hooks/usePersonel';

export default function PersonelPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  // Gerçek veriler
  const { data: personelList, isLoading } = usePersonelList();

  // Arama ve sıralama
  const filteredPersonel = personelList
    ?.filter((p) =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => a.first_name.localeCompare(b.first_name, 'tr'));

  const getBalanceLabel = (balance: number) => {
    if (balance === 0) return 'Bakiye yok';
    return balance < 0 ? 'Borcumuz' : 'Alacağımız';
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text variant="h2">Personel</Text>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={18} color={colors.white} />}
            onPress={() => router.push('/personel/ekle')}
          >
            Ekle
          </Button>
        </View>

        {/* Arama */}
        <View style={styles.searchContainer}>
          <SearchInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Personel ara..."
          />
        </View>

        {/* Personel Listesi */}
        <View style={styles.listContainer}>
          {isLoading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
          ) : !filteredPersonel || filteredPersonel.length === 0 ? (
            <EmptyState
              icon={<UserCircle size={48} color={colors.textMuted} />}
              title={searchQuery ? 'Personel bulunamadı' : 'Henüz personel yok'}
              description={
                searchQuery
                  ? 'Arama kriterlerinize uygun personel bulunmamaktadır.'
                  : 'İlk personelinizi ekleyerek başlayın'
              }
              actionLabel={searchQuery ? undefined : 'Personel Ekle'}
              onAction={searchQuery ? undefined : () => router.push('/personel/ekle')}
            />
          ) : (
            filteredPersonel.map((personel) => (
              <ExpandableCard
                key={personel.id}
                header={
                  <View style={styles.personelHeader}>
                    <View style={styles.avatar}>
                      <Text variant="body" bold style={{ color: colors.primary }}>
                        {getInitials(`${personel.first_name} ${personel.last_name}`)}
                      </Text>
                    </View>
                    <View style={styles.personelInfo}>
                      <Text variant="body">
                        {personel.first_name} {personel.last_name}
                      </Text>
                      <View style={styles.personelMeta}>
                        {personel.position && (
                          <>
                            <Briefcase size={12} color={colors.textMuted} />
                            <Text variant="caption" color="secondary">
                              {personel.position}
                            </Text>
                          </>
                        )}
                        {personel.phone && (
                          <>
                            <Phone size={12} color={colors.textMuted} style={{ marginLeft: spacing.sm }} />
                            <Text variant="caption" color="secondary">
                              {personel.phone}
                            </Text>
                          </>
                        )}
                      </View>
                    </View>
                    <View style={styles.personelBalance}>
                      <Text variant="caption" color="secondary">
                        {getBalanceLabel(Number(personel.balance))}
                      </Text>
                      <Text
                        variant="h3"
                        color={
                          Number(personel.balance) === 0
                            ? 'secondary'
                            : Number(personel.balance) < 0
                            ? 'error'
                            : 'success'
                        }
                      >
                        {formatCurrency(Math.abs(Number(personel.balance)))}
                      </Text>
                    </View>
                  </View>
                }
              >
                <View style={styles.personelActions}>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<MinusCircle size={16} color={colors.error} />}
                    onPress={() => router.push({ pathname: '/islemler/personelGider', params: { personel_id: personel.id } })}
                    style={styles.actionButton}
                  >
                    Gider Ekle
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Banknote size={16} color={colors.success} />}
                    onPress={() => router.push({ pathname: '/islemler/personelOdeme', params: { personel_id: personel.id } })}
                    style={styles.actionButton}
                  >
                    Ödeme Yap
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<History size={16} color={colors.text} />}
                    onPress={() => router.push(`/personel/${personel.id}`)}
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
    marginBottom: spacing.lg,
  },
  listContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  personelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personelInfo: {
    flex: 1,
  },
  personelMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  personelBalance: {
    alignItems: 'flex-end',
  },
  personelActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});
