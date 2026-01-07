import { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import {
  ShoppingCart,
  Banknote,
  Receipt,
  Building2,
  User,
  Phone,
  CreditCard,
  CircleDollarSign,
  Pencil,
  Trash2,
} from 'lucide-react-native';
import { Text, Card, ExpandableCard, Button, EmptyState, IleriTarihliIslemlerSection } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { formatDateShort, formatDateMedium } from '@/lib/date';
import { useCari, useDeleteCari } from '@/hooks/useCariler';
import { useIslemlerByCari, useDeleteIslem } from '@/hooks/useIslemler';
import { useIleriTarihliIslemlerByCari } from '@/hooks/useIleriTarihliIslemler';
import { IslemWithRelations } from '@/types/database';

export default function CariHareketleriPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: cari, isLoading: cariLoading } = useCari(id!);
  const { data: islemler, isLoading: islemlerLoading } = useIslemlerByCari(id!);
  const { data: ileriTarihliIslemler, isLoading: ileriTarihliLoading } = useIleriTarihliIslemlerByCari(id!);
  const deleteIslem = useDeleteIslem();
  const deleteCari = useDeleteCari();

  const [expandedIslemId, setExpandedIslemId] = useState<string | null>(null);

  // Başlangıç bakiyesini hesapla
  const calculateInitialBalance = () => {
    if (!cari || !islemler) return 0;

    let totalEffect = 0;
    islemler.forEach((islem) => {
      const amount = Number(islem.amount);
      if (islem.type === 'cari_alis') {
        totalEffect -= amount; // Borç artar
      } else if (islem.type === 'cari_odeme') {
        totalEffect += amount; // Borç azalır
      } else if (islem.type === 'cari_satis') {
        totalEffect += amount; // Alacak artar
      } else if (islem.type === 'cari_tahsilat') {
        totalEffect -= amount; // Alacak azalır
      }
    });

    return Number(cari.balance) - totalEffect;
  };

  const initialBalance = calculateInitialBalance();

  const getHareketIcon = (type: string) => {
    switch (type) {
      case 'cari_alis':
        return <ShoppingCart size={20} color={colors.error} />;
      case 'cari_odeme':
        return <Banknote size={20} color={colors.success} />;
      case 'cari_satis':
        return <Receipt size={20} color={colors.success} />;
      case 'cari_tahsilat':
        return <Banknote size={20} color={colors.info} />;
      default:
        return <Receipt size={20} color={colors.textMuted} />;
    }
  };

  const getHareketLabel = (type: string) => {
    switch (type) {
      case 'cari_alis':
        return 'Alış';
      case 'cari_odeme':
        return 'Ödeme';
      case 'cari_satis':
        return 'Satış';
      case 'cari_tahsilat':
        return 'Tahsilat';
      default:
        return type;
    }
  };


  const handleDelete = (islemId: string) => {
    Alert.alert(
      'İşlemi Sil',
      'Bu işlemi silmek istediğinizden emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteIslem.mutateAsync(islemId);
            } catch (error: any) {
              Alert.alert('Hata', error.message || 'İşlem silinemedi');
            }
          },
        },
      ]
    );
  };

  const handleDeleteCari = () => {
    Alert.alert(
      'Cariyi Sil',
      'Bu cariyi silmek istediğinizden emin misiniz?\n\nDikkat: Bu cariye ait tüm alış, satış, ödeme ve tahsilat işlemleri de silinecektir. Bu işlem geri alınamaz.',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCari.mutateAsync(id!);
              router.replace('/(tabs)/cariler');
            } catch (error: any) {
              Alert.alert('Hata', error.message || 'Cari silinemedi');
            }
          },
        },
      ]
    );
  };

  if (cariLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <Text>Yükleniyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!cari) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <EmptyState
          icon={<Building2 size={48} color={colors.textMuted} />}
          title="Cari bulunamadı"
          description="Bu cari mevcut değil veya silinmiş olabilir."
        />
      </SafeAreaView>
    );
  }

  const isTedarikci = cari.type === 'tedarikci';

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: cari.name,
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Cari Ozeti */}
          <Card style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={[styles.summaryIcon, { backgroundColor: isTedarikci ? colors.warningLight : colors.infoLight }]}>
                {isTedarikci ? (
                  <Building2 size={32} color={colors.warning} />
                ) : (
                  <User size={32} color={colors.info} />
                )}
              </View>
              <View style={styles.summaryInfo}>
                <Text variant="body" color="secondary">
                  {isTedarikci ? 'Tedarikçi' : 'Müşteri'}
                </Text>
                {cari.phone && (
                  <View style={styles.phoneRow}>
                    <Phone size={14} color={colors.textMuted} />
                    <Text variant="caption" color="secondary">
                      {cari.phone}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.balanceInfo}>
                <Text variant="caption" color="secondary">
                  {Number(cari.balance) < 0 ? 'Borcumuz' : 'Alacağımız'}
                </Text>
                <Text variant="h2" color={Number(cari.balance) < 0 ? 'error' : 'success'}>
                  {formatCurrency(Math.abs(Number(cari.balance)))}
                </Text>
              </View>
            </View>
            <View style={styles.cariActions}>
              <Button
                variant="secondary"
                size="sm"
                icon={<Pencil size={16} color={colors.text} />}
                onPress={() => router.push({ pathname: '/cariler/duzenle/[id]', params: { id: id } })}
                style={styles.cariActionBtn}
              >
                Düzenle
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<Trash2 size={16} color={colors.error} />}
                onPress={handleDeleteCari}
                style={styles.cariActionBtn}
              >
                Sil
              </Button>
            </View>
          </Card>

          {/* Aksiyon Butonlari */}
          <View style={styles.actionButtons}>
            {isTedarikci ? (
              <>
                <Button
                  variant="primary"
                  size="md"
                  icon={<ShoppingCart size={18} color={colors.surface} />}
                  onPress={() => router.push({ pathname: '/islemler/cariAlis', params: { cari_id: id } })}
                  style={styles.actionBtn}
                >
                  Alis
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  icon={<CreditCard size={18} color={colors.text} />}
                  onPress={() => router.push({ pathname: '/islemler/cariOdeme', params: { cari_id: id } })}
                  style={styles.actionBtn}
                >
                  Odeme
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="primary"
                  size="md"
                  icon={<Receipt size={18} color={colors.surface} />}
                  onPress={() => router.push({ pathname: '/islemler/cariSatis', params: { cari_id: id } })}
                  style={styles.actionBtn}
                >
                  Satis
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  icon={<Banknote size={18} color={colors.text} />}
                  onPress={() => router.push({ pathname: '/islemler/cariTahsilat', params: { cari_id: id } })}
                  style={styles.actionBtn}
                >
                  Tahsilat
                </Button>
              </>
            )}
          </View>

          {/* İleri Tarihli İşlemler ve Hareketler */}
          <View style={styles.section}>
            <IleriTarihliIslemlerSection
              ileriTarihliIslemler={ileriTarihliIslemler}
              isLoading={ileriTarihliLoading}
            />

            <Text variant="h3" style={styles.sectionTitle}>
              Hareketler
            </Text>

            {islemlerLoading ? (
              <Text color="secondary">Yükleniyor...</Text>
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
                          {
                            backgroundColor: islem.type === 'cari_alis' || islem.type === 'cari_satis'
                              ? colors.errorLight
                              : colors.successLight
                          }
                        ]}>
                          {getHareketIcon(islem.type)}
                        </View>
                        <View style={styles.hareketInfo}>
                          <Text variant="body">{formatDateMedium(islem.date)}</Text>
                          <Text variant="caption" color="secondary">
                            {getHareketLabel(islem.type)}
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
                          color={islem.type === 'cari_alis' || islem.type === 'cari_satis' ? 'error' : 'success'}
                        >
                          {islem.type === 'cari_alis' || islem.type === 'cari_satis' ? '-' : '+'}
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
                        Düzenle
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<Trash2 size={16} color={colors.error} />}
                        onPress={() => handleDelete(islem.id)}
                        style={styles.actionButton}
                      >
                        Sil
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
                      <Text variant="body">Baslangic Bakiyesi</Text>
                      <Text variant="caption" color="secondary">
                        Cari acilisi • {formatDateShort(cari.created_at)}
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
  cariActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cariActionBtn: {
    flex: 1,
  },
  summaryIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryInfo: {
    flex: 1,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
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
