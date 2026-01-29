import { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity, TouchableWithoutFeedback, Animated } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Plus, Package, Search, ArrowRightLeft, History, X, TrendingUp, TrendingDown } from 'lucide-react-native';
import { Text, Button, Input, EmptyState, ExpandableCard } from '@/components/ui';
import { QuickStockBar } from '@/components/stock/QuickStockBar';
import { useHaptics } from '@/hooks/useHaptics';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useUrunler, useDeleteUrun } from '@/hooks/useUrunler';
import { Urun, BirimType } from '@/types/database';
import { formatCurrency } from '@/lib/currency';

export default function UrunlerPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const { t } = useTranslation(['products', 'common', 'errors']);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [quickStockVisible, setQuickStockVisible] = useState(false);
  const [selectedUrun, setSelectedUrun] = useState<Urun | null>(null);
  const [fabMenuVisible, setFabMenuVisible] = useState(false);

  // FAB animation
  const fabRotation = useRef(new Animated.Value(0)).current;
  const menuOpacity = useRef(new Animated.Value(0)).current;
  const menuTranslateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (fabMenuVisible) {
      Animated.parallel([
        Animated.timing(fabRotation, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(menuOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(menuTranslateY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fabRotation, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(menuOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(menuTranslateY, {
          toValue: 20,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [fabMenuVisible]);

  const { data: urunler, isLoading } = useUrunler();
  const deleteUrun = useDeleteUrun();

  // Arama filtresi
  const filteredUrunler = urunler?.filter((urun) =>
    urun.ad.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (urun.kod && urun.kod.toLowerCase().includes(searchQuery.toLowerCase()))
  ) || [];

  const handleDelete = (urun: Urun) => {
    Alert.alert(
      t('products:deleteConfirm.title'),
      t('products:deleteConfirm.message', { name: urun.ad }),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteUrun.mutateAsync(urun.id);
            } catch (error: any) {
              Alert.alert(t('common:status.error'), error.message || t('errors:general.tryAgain'));
            }
          },
        },
      ]
    );
  };

  const getBirimLabel = (birim: BirimType) => {
    return t(`products:units.${birim}`);
  };

  const handleToggle = (urunId: string) => {
    setExpandedId(expandedId === urunId ? null : urunId);
  };

  const handleNewTransaction = (urun: Urun) => {
    setSelectedUrun(urun);
    setQuickStockVisible(true);
  };

  const handleViewMovements = (urunId: string) => {
    router.push(`/urunler/${urunId}` as any);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text color="secondary">{t('common:status.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text variant="h2">{t('products:title')}</Text>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={18} color={colors.white} />}
            iconPosition="left"
            onPress={() => router.push('/urunler/ekle' as any)}
          >
            {t('common:buttons.add')}
          </Button>
        </View>

        {/* Arama */}
        {(urunler && urunler.length > 0) && (
          <View style={styles.searchSection}>
            <Input
              placeholder={t('common:search.searchPlaceholder')}
              value={searchQuery}
              onChangeText={setSearchQuery}
              leftIcon={<Search size={20} color={colors.textMuted} />}
            />
          </View>
        )}

        {/* Liste */}
        <View style={styles.listSection}>
          {filteredUrunler.length === 0 ? (
            <EmptyState
              icon={<Package size={48} color={colors.textMuted} />}
              title={t('products:empty.title')}
              description={t('products:empty.description')}
              actionLabel={t('products:addProduct')}
              onAction={() => router.push('/urunler/ekle' as any)}
            />
          ) : (
            filteredUrunler.map((urun) => (
              <ExpandableCard
                key={urun.id}
                expanded={expandedId === urun.id}
                onToggle={() => handleToggle(urun.id)}
                header={
                  <View style={styles.urunHeader}>
                    <View style={styles.urunIcon}>
                      <Package size={24} color={colors.primary} />
                    </View>
                    <View style={styles.urunInfo}>
                      <Text variant="body" style={styles.urunName}>
                        {urun.ad}
                      </Text>
                      <View style={styles.urunDetails}>
                        <Text variant="caption" color="secondary">
                          {urun.miktar} {getBirimLabel(urun.birim)}
                        </Text>
                        {urun.satis_fiyati > 0 && (
                          <Text variant="caption" color="muted">
                            {formatCurrency(urun.satis_fiyati, urun.currency)}/{getBirimLabel(urun.birim)}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>
                }
              >
                {/* Expanded Content - Action Buttons */}
                <View style={styles.actionButtons}>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<ArrowRightLeft size={16} color={colors.white} />}
                    iconPosition="left"
                    onPress={() => handleNewTransaction(urun)}
                    style={styles.actionButton}
                  >
                    {t('products:actions.newTransaction')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<History size={16} color={colors.primary} />}
                    iconPosition="left"
                    onPress={() => handleViewMovements(urun.id)}
                    style={styles.actionButton}
                  >
                    {t('products:actions.viewMovements')}
                  </Button>
                </View>
              </ExpandableCard>
            ))
          )}
        </View>
      </ScrollView>

      {/* QuickStockBar */}
      <QuickStockBar
        visible={quickStockVisible}
        onDismiss={() => {
          setQuickStockVisible(false);
          setSelectedUrun(null);
        }}
        urun={selectedUrun}
      />

      {/* FAB Backdrop */}
      {fabMenuVisible && (
        <TouchableWithoutFeedback onPress={() => {
          haptics.light();
          setFabMenuVisible(false);
        }}>
          <View style={styles.fabBackdrop} />
        </TouchableWithoutFeedback>
      )}

      {/* FAB Menu */}
      <View style={[styles.fabContainer, { bottom: spacing.lg + insets.bottom }]}>
        {fabMenuVisible && (
          <Animated.View
            style={[
              styles.fabMenu,
              {
                opacity: menuOpacity,
                transform: [{ translateY: menuTranslateY }],
              },
            ]}
          >
            <TouchableOpacity
              style={styles.fabMenuItem}
              onPress={() => {
                haptics.light();
                setFabMenuVisible(false);
                router.push('/urunler/toplu-giris' as any);
              }}
            >
              <View style={[styles.fabMenuIcon, { backgroundColor: colors.successLight }]}>
                <TrendingUp size={20} color={colors.success} />
              </View>
              <Text variant="body">{t('products:bulk.stockIn')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.fabMenuItem}
              onPress={() => {
                haptics.light();
                setFabMenuVisible(false);
                router.push('/urunler/toplu-cikis' as any);
              }}
            >
              <View style={[styles.fabMenuIcon, { backgroundColor: colors.errorLight }]}>
                <TrendingDown size={20} color={colors.error} />
              </View>
              <Text variant="body">{t('products:bulk.stockOut')}</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
        <TouchableOpacity
          style={styles.fab}
          onPress={() => {
            haptics.light();
            setFabMenuVisible(!fabMenuVisible);
          }}
          activeOpacity={0.8}
        >
          <Animated.View
            style={{
              transform: [
                {
                  rotate: fabRotation.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '45deg'],
                  }),
                },
              ],
            }}
          >
            {fabMenuVisible ? (
              <X size={24} color={colors.surface} />
            ) : (
              <Plus size={24} color={colors.surface} />
            )}
          </Animated.View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  searchSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  listSection: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  urunHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  urunIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  urunInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  urunName: {
    fontWeight: '500',
  },
  urunDetails: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
  },
  // FAB Styles
  fabContainer: {
    position: 'absolute',
    right: spacing.lg,
    alignItems: 'flex-end',
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabMenu: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    minWidth: 200,
  },
  fabMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  fabMenuIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
});
