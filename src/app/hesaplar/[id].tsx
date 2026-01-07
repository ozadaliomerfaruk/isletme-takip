import { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Wallet,
  TrendingUp,
  TrendingDown,
  CreditCard,
  Banknote,
  CircleDollarSign,
  Pencil,
  Trash2,
} from 'lucide-react-native';
import { Text, Card, ExpandableCard, Button, EmptyState, IleriTarihliIslemlerSection } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { formatCurrency, toNumber } from '@/lib/currency';
import { formatDateShort, formatDateMedium } from '@/lib/date';
import { useHesap, useDeleteHesap } from '@/hooks/useHesaplar';
import { useIslemlerByHesap, useDeleteIslem } from '@/hooks/useIslemler';
import { useIleriTarihliIslemlerByHesap } from '@/hooks/useIleriTarihliIslemler';
import { IslemWithRelations } from '@/types/database';

export default function HesapHareketleriPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: hesap, isLoading: hesapLoading } = useHesap(id!);
  const { data: islemler, isLoading: islemlerLoading } = useIslemlerByHesap(id!);
  const { data: ileriTarihliIslemler, isLoading: ileriTarihliLoading } = useIleriTarihliIslemlerByHesap(id!);
  const deleteIslem = useDeleteIslem();
  const deleteHesap = useDeleteHesap();

  const [expandedIslemId, setExpandedIslemId] = useState<string | null>(null);

  // Başlangıç bakiyesini hesapla (mevcut bakiye - tüm işlemlerin etkisi)
  const calculateInitialBalance = () => {
    if (!hesap || !islemler) return 0;

    let totalEffect = 0;
    islemler.forEach((islem) => {
      const amount = Number(islem.amount);
      if (islem.type === 'transfer') {
        // Transfer: hedef hesapsa +, kaynak hesapsa -
        if (islem.hedef_hesap_id === id) {
          totalEffect += amount;
        } else {
          totalEffect -= amount;
        }
      } else if (islem.type === 'gelir' || islem.type === 'cari_tahsilat') {
        totalEffect += amount;
      } else {
        totalEffect -= amount;
      }
    });

    return toNumber(hesap.balance) - totalEffect;
  };

  const initialBalance = calculateInitialBalance();

  const getHareketIcon = (type: string) => {
    switch (type) {
      case 'gelir':
      case 'cari_tahsilat':
        return <ArrowDownLeft size={20} color={colors.success} />;
      case 'gider':
      case 'cari_odeme':
      case 'personel_odeme':
      case 'personel_gider':
        return <ArrowUpRight size={20} color={colors.error} />;
      case 'transfer':
        return <ArrowLeftRight size={20} color={colors.info} />;
      default:
        return <Wallet size={20} color={colors.textMuted} />;
    }
  };

  const getHareketLabel = (type: string) => {
    switch (type) {
      case 'gelir':
        return 'Gelir';
      case 'gider':
        return 'Gider';
      case 'transfer':
        return 'Transfer';
      case 'cari_odeme':
        return 'Cari Ödeme';
      case 'cari_tahsilat':
        return 'Cari Tahsilat';
      case 'personel_odeme':
        return 'Personel Ödeme';
      case 'personel_gider':
        return 'Personel Gider';
      default:
        return type;
    }
  };

  const getAmountSign = (type: string, hesapId: string, islemHesapId: string | null, hedefHesapId: string | null) => {
    // Transfer işlemlerinde kaynak hesaptan çıkış, hedef hesaba giriş
    if (type === 'transfer') {
      return hedefHesapId === hesapId ? '+' : '-';
    }
    // Gelir ve tahsilat işlemleri pozitif
    if (type === 'gelir' || type === 'cari_tahsilat') {
      return '+';
    }
    // Diğer tüm işlemler negatif
    return '-';
  };

  const getAmountColor = (type: string, hesapId: string, hedefHesapId: string | null): 'success' | 'error' | 'primary' => {
    if (type === 'transfer') {
      return hedefHesapId === hesapId ? 'success' : 'error';
    }
    if (type === 'gelir' || type === 'cari_tahsilat') {
      return 'success';
    }
    return 'error';
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

  const handleDeleteHesap = () => {
    Alert.alert(
      'Hesabı Sil',
      'Bu hesabı silmek istediğinizden emin misiniz?\n\nDikkat: Bu hesaba ait tüm gelir, gider ve transfer işlemleri de silinecektir. Bu işlem geri alınamaz.',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteHesap.mutateAsync(id!);
              router.replace('/(tabs)');
            } catch (error: any) {
              Alert.alert('Hata', error.message || 'Hesap silinemedi');
            }
          },
        },
      ]
    );
  };

  const getHesapIcon = (type: string) => {
    switch (type) {
      case 'nakit':
        return <Banknote size={32} color={colors.success} />;
      case 'banka':
        return <CreditCard size={32} color={colors.info} />;
      case 'kredi_karti':
        return <CreditCard size={32} color={colors.warning} />;
      default:
        return <Wallet size={32} color={colors.primary} />;
    }
  };

  if (hesapLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <Text>Yükleniyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!hesap) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <EmptyState
          icon={<Wallet size={48} color={colors.textMuted} />}
          title="Hesap bulunamadı"
          description="Bu hesap mevcut değil veya silinmiş olabilir."
        />
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: hesap.name,
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Hesap Özeti */}
          <Card style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryIcon}>
                {getHesapIcon(hesap.type)}
              </View>
              <View style={styles.summaryInfo}>
                <Text variant="caption" color="secondary">
                  Mevcut Bakiye
                </Text>
                <Text variant="h2" color={toNumber(hesap.balance) >= 0 ? 'primary' : 'error'}>
                  {formatCurrency(toNumber(hesap.balance))}
                </Text>
              </View>
            </View>
            <View style={styles.hesapActions}>
              <Button
                variant="secondary"
                size="sm"
                icon={<Pencil size={16} color={colors.text} />}
                onPress={() => router.push({ pathname: '/hesaplar/duzenle/[id]', params: { id: id } })}
                style={styles.hesapActionBtn}
              >
                Düzenle
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<Trash2 size={16} color={colors.error} />}
                onPress={handleDeleteHesap}
                style={styles.hesapActionBtn}
              >
                Sil
              </Button>
            </View>
          </Card>

          {/* Hızlı İşlemler */}
          <View style={styles.actionButtons}>
            <Button
              variant="primary"
              size="md"
              icon={<TrendingUp size={18} color={colors.surface} />}
              onPress={() => router.push({ pathname: '/islemler/gelir', params: { hesap_id: id } })}
              style={styles.actionBtn}
            >
              Gelir
            </Button>
            <Button
              variant="secondary"
              size="md"
              icon={<TrendingDown size={18} color={colors.text} />}
              onPress={() => router.push({ pathname: '/islemler/gider', params: { hesap_id: id } })}
              style={styles.actionBtn}
            >
              Gider
            </Button>
            <Button
              variant="outline"
              size="md"
              icon={<ArrowLeftRight size={18} color={colors.text} />}
              onPress={() => router.push({ pathname: '/islemler/transfer', params: { hesap_id: id } })}
              style={styles.actionBtn}
            >
              Transfer
            </Button>
          </View>

          {/* İleri Tarihli İşlemler */}
          <View style={styles.section}>
            <IleriTarihliIslemlerSection
              ileriTarihliIslemler={ileriTarihliIslemler}
              isLoading={ileriTarihliLoading}
            />

            {/* Hareketler */}
            <Text variant="h3" style={styles.sectionTitle}>
              Hareketler
            </Text>

            {islemlerLoading ? (
              <Text color="secondary">Yükleniyor...</Text>
            ) : (
              <>
                {islemler && islemler.length > 0 && islemler.map((islem) => {
                  const sign = getAmountSign(islem.type, id!, islem.hesap_id, islem.hedef_hesap_id);
                  const colorType = getAmountColor(islem.type, id!, islem.hedef_hesap_id);

                  return (
                    <ExpandableCard
                      key={islem.id}
                      expanded={expandedIslemId === islem.id}
                      onToggle={() => setExpandedIslemId(expandedIslemId === islem.id ? null : islem.id)}
                      header={
                        <View style={styles.hareketHeader}>
                          <View style={[
                            styles.hareketIcon,
                            {
                              backgroundColor: colorType === 'success'
                                ? colors.successLight
                                : colorType === 'error'
                                  ? colors.errorLight
                                  : colors.infoLight
                            }
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
                          <Text variant="h3" color={colorType}>
                            {sign}{formatCurrency(Number(islem.amount))}
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
                  );
                })}

                {/* Başlangıç Bakiyesi - düzenleme/silme yok */}
                <Card style={styles.hareketCard}>
                  <View style={styles.hareketHeader}>
                    <View style={[styles.hareketIcon, { backgroundColor: colors.primaryLight + '30' }]}>
                      <CircleDollarSign size={20} color={colors.primary} />
                    </View>
                    <View style={styles.hareketInfo}>
                      <Text variant="body">Baslangic Bakiyesi</Text>
                      <Text variant="caption" color="secondary">
                        Hesap acilisi • {formatDateShort(hesap?.created_at || '')}
                      </Text>
                    </View>
                    <Text variant="h3" color={initialBalance >= 0 ? 'primary' : 'error'}>
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
  hesapActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  hesapActionBtn: {
    flex: 1,
  },
  summaryIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryLight + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryInfo: {
    flex: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
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
