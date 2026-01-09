import { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  MinusCircle,
  Banknote,
  UserCircle,
  Phone,
  Briefcase,
  Zap,
  CircleDollarSign,
  Pencil,
  Trash2,
  ArrowDownCircle,
} from 'lucide-react-native';
import { Text, Card, ExpandableCard, Button, EmptyState, IleriTarihliIslemlerSection } from '@/components/ui';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { formatDateShort, formatDateMedium } from '@/lib/date';
import { getInitials } from '@/lib/utils';
import { usePersonelById, useDeletePersonel } from '@/hooks/usePersonel';
import { useIslemlerByPersonel, useDeleteIslem } from '@/hooks/useIslemler';
import { useIleriTarihliIslemlerByPersonel } from '@/hooks/useIleriTarihliIslemler';
import { IslemWithRelations } from '@/types/database';

export default function PersonelHareketleriPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation(['personel', 'common', 'errors']);

  const { data: personel, isLoading: personelLoading } = usePersonelById(id!);
  const { data: islemler, isLoading: islemlerLoading } = useIslemlerByPersonel(id!);
  const { data: ileriTarihliIslemler, isLoading: ileriTarihliLoading } = useIleriTarihliIslemlerByPersonel(id!);
  const deleteIslem = useDeleteIslem();
  const deletePersonel = useDeletePersonel();

  const [expandedIslemId, setExpandedIslemId] = useState<string | null>(null);
  const [quickBarVisible, setQuickBarVisible] = useState(false);

  const fullName = personel ? `${personel.first_name} ${personel.last_name}` : 'Yükleniyor...';

  // Başlangıç bakiyesini hesapla
  const calculateInitialBalance = () => {
    if (!personel || !islemler) return 0;

    let totalEffect = 0;
    islemler.forEach((islem) => {
      const amount = Number(islem.amount);
      if (islem.type === 'personel_gider') {
        totalEffect -= amount; // Borç artar
      } else if (islem.type === 'personel_odeme') {
        totalEffect += amount; // Borç azalır
      } else if (islem.type === 'personel_tahsilat') {
        totalEffect -= amount; // Tahsilat: Alacak azalır
      }
    });

    return Number(personel.balance) - totalEffect;
  };

  const initialBalance = calculateInitialBalance();

  const getHareketIcon = (type: string) => {
    switch (type) {
      case 'personel_gider':
        return <MinusCircle size={20} color={colors.error} />;
      case 'personel_odeme':
        return <Banknote size={20} color={colors.success} />;
      case 'personel_tahsilat':
        return <ArrowDownCircle size={20} color={colors.info} />;
      default:
        return <UserCircle size={20} color={colors.textMuted} />;
    }
  };

  const getHareketLabel = (type: string) => {
    switch (type) {
      case 'personel_gider':
        return t('personel:transactionLabels.gider');
      case 'personel_odeme':
        return t('personel:transactionLabels.odeme');
      case 'personel_tahsilat':
        return t('personel:transactionLabels.tahsilat');
      default:
        return type;
    }
  };

  const handleDelete = (islemId: string) => {
    Alert.alert(
      t('personel:deleteConfirm.transactionTitle'),
      t('personel:deleteConfirm.transactionMessage'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteIslem.mutateAsync(islemId);
            } catch (error: any) {
              Alert.alert(t('common:status.error'), error.message || t('errors:transaction.deleteFailed'));
            }
          },
        },
      ]
    );
  };

  const handleDeletePersonel = () => {
    Alert.alert(
      t('personel:deleteConfirm.personelTitle'),
      t('personel:deleteConfirm.personelMessage'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePersonel.mutateAsync(id!);
              router.replace('/(tabs)/personel');
            } catch (error: any) {
              Alert.alert(t('common:status.error'), error.message || t('errors:personel.deleteFailed'));
            }
          },
        },
      ]
    );
  };

  if (personelLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <Text>{t('common:status.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!personel) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <EmptyState
          icon={<UserCircle size={48} color={colors.textMuted} />}
          title={t('errors:personel.notFound')}
          description={t('personel:details.notFoundDescription')}
        />
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: fullName,
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Personel Özeti */}
          <Card style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.avatar}>
                <Text variant="h2" style={{ color: colors.primary }}>
                  {getInitials(fullName)}
                </Text>
              </View>
              <View style={styles.summaryInfo}>
                {personel.position && (
                  <View style={styles.infoRow}>
                    <Briefcase size={14} color={colors.textMuted} />
                    <Text variant="body" color="secondary">
                      {personel.position}
                    </Text>
                  </View>
                )}
                {personel.phone && (
                  <View style={styles.infoRow}>
                    <Phone size={14} color={colors.textMuted} />
                    <Text variant="caption" color="secondary">
                      {personel.phone}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.balanceInfo}>
                <Text variant="caption" color="secondary">
                  {Number(personel.balance) < 0 ? t('personel:balance.weOwe') : t('personel:balance.theyOwe')}
                </Text>
                <Text variant="h2" color={Number(personel.balance) < 0 ? 'error' : 'success'}>
                  {formatCurrency(Math.abs(Number(personel.balance)))}
                </Text>
              </View>
            </View>
            <View style={styles.personelActions}>
              <Button
                variant="secondary"
                size="sm"
                icon={<Pencil size={16} color={colors.text} />}
                onPress={() => router.push({ pathname: '/personel/duzenle/[id]', params: { id: id } })}
                style={styles.personelActionBtn}
              >
                {t('common:buttons.edit')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<Trash2 size={16} color={colors.error} />}
                onPress={handleDeletePersonel}
                style={styles.personelActionBtn}
              >
                {t('common:buttons.delete')}
              </Button>
            </View>
          </Card>

          {/* Aksiyon Butonları */}
          <View style={styles.actionButtons}>
            <Button
              variant="primary"
              size="md"
              icon={<Zap size={18} color={colors.surface} />}
              onPress={() => setQuickBarVisible(true)}
              style={styles.actionBtn}
            >
              {t('personel:details.newTransaction')}
            </Button>
          </View>

          {/* İleri Tarihli İşlemler ve Hareketler */}
          <View style={styles.section}>
            <IleriTarihliIslemlerSection
              ileriTarihliIslemler={ileriTarihliIslemler}
              isLoading={ileriTarihliLoading}
            />

            <Text variant="h3" style={styles.sectionTitle}>
              {t('personel:details.hareketler')}
            </Text>

            {islemlerLoading ? (
              <Text color="secondary">{t('common:status.loading')}</Text>
            ) : (
              <>
                {islemler && islemler.length > 0 && islemler.map((islem) => (
                  <ExpandableCard
                    key={islem.id}
                    expanded={expandedIslemId === islem.id}
                    onToggle={() => setExpandedIslemId(expandedIslemId === islem.id ? null : islem.id)}
                    header={
                      <View style={styles.hareketHeader}>
                        <View style={[
                          styles.hareketIcon,
                          { backgroundColor: islem.type === 'personel_odeme' ? colors.successLight : islem.type === 'personel_tahsilat' ? colors.infoLight : colors.errorLight }
                        ]}>
                          {getHareketIcon(islem.type)}
                        </View>
                        <View style={styles.hareketInfo}>
                          <Text variant="body">{formatDateMedium(islem.date)}</Text>
                          <Text variant="caption" color="secondary">
                            {getHareketLabel(islem.type)}
                          </Text>
                          {(islem as IslemWithRelations).kategori?.name && (
                            <Text variant="caption" color="secondary">
                              {(islem as IslemWithRelations).kategori?.name}
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
                          color={islem.type === 'personel_odeme' ? 'success' : islem.type === 'personel_tahsilat' ? 'info' : 'error'}
                        >
                          {islem.type === 'personel_odeme' ? '+' : islem.type === 'personel_tahsilat' ? '↓ ' : '-'}
                          {formatCurrency(Number(islem.amount))}
                        </Text>
                      </View>
                    }
                  >
                    <View style={styles.hareketActions}>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Pencil size={16} color={colors.text} />}
                        onPress={() => router.push({ pathname: '/islemler/duzenle/[id]', params: { id: islem.id } })}
                        style={styles.actionButton}
                      >
                        {t('common:buttons.edit')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<Trash2 size={16} color={colors.error} />}
                        onPress={() => handleDelete(islem.id)}
                        style={styles.actionButton}
                      >
                        {t('common:buttons.delete')}
                      </Button>
                    </View>
                  </ExpandableCard>
                ))}

                {/* Başlangıç Bakiyesi - düzenleme/silme yok */}
                <Card style={styles.hareketCard}>
                  <View style={styles.hareketHeader}>
                    <View style={[styles.hareketIcon, { backgroundColor: colors.primaryLight + '30' }]}>
                      <CircleDollarSign size={20} color={colors.primary} />
                    </View>
                    <View style={styles.hareketInfo}>
                      <Text variant="body">{t('personel:details.initialBalance')}</Text>
                      <Text variant="caption" color="secondary">
                        {t('personel:details.personelRecord')} • {formatDateShort(personel.created_at)}
                      </Text>
                    </View>
                    <Text variant="h3" color={initialBalance >= 0 ? 'success' : 'error'}>
                      {formatCurrency(initialBalance)}
                    </Text>
                  </View>
                </Card>
              </>
            )}
          </View>
        </ScrollView>

        {/* Quick Transaction Bar */}
        <QuickTransactionBar
          visible={quickBarVisible}
          onDismiss={() => setQuickBarVisible(false)}
          defaultPersonelId={personel?.id}
          onSuccess={() => setQuickBarVisible(false)}
        />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  summaryCard: {
    margin: spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  personelActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  personelActionBtn: {
    flex: 1,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryLight + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  balanceInfo: {
    alignItems: 'flex-end',
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  actionBtn: {
    flex: 1,
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  sectionTitle: {
    marginBottom: spacing.lg,
  },
  hareketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  hareketIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hareketInfo: {
    flex: 1,
  },
  hareketCard: {
    marginBottom: spacing.sm,
  },
  hareketActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});
