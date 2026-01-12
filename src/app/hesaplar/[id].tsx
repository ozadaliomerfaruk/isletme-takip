import { useState, useCallback, useRef } from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import {
  ArrowLeft,
  ArrowRight,
  Wallet,
  CreditCard,
  Banknote,
  CircleDollarSign,
  Pencil,
  Trash2,
  Clock,
  MoreVertical,
  FileCheck,
  X,
  Share2,
} from 'lucide-react-native';
import { Text, Card, ExpandableCard, Button, EmptyState, IleriTarihliIslemlerSection, ArchivedBanner } from '@/components/ui';
import { BekleyenCeklerSection, CekKesSheet } from '@/components/cek';
import { QuickTransactionBar, CreditCardTransactionBar, TransactionType } from '@/components/transaction';
import { ExportSheet } from '@/components/export';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { formatDateShort, formatDateSmart, formatTime, isSameYear } from '@/lib/date';
import { useHesap, useDeleteHesap, useUpdateHesap } from '@/hooks/useHesaplar';
import { useUnarchiveHesap } from '@/hooks/useArchive';
import { useIslemlerByHesap, useDeleteIslem } from '@/hooks/useIslemler';
import { useIleriTarihliIslemlerByHesap } from '@/hooks/useIleriTarihliIslemler';
import { useCeklerByHesap } from '@/hooks/useCekler';
import { IslemWithRelations, Currency } from '@/types/database';
import { useTranslation } from 'react-i18next';

export default function HesapHareketleriPage() {
  if (__DEV__) {
    console.log('=== HESAP DETAY SAYFASI YUKLENDI ===');
  }
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation(['accounts', 'common', 'errors', 'checks']);

  const { data: hesap, isLoading: hesapLoading } = useHesap(id!);
  const { data: islemler, isLoading: islemlerLoading } = useIslemlerByHesap(id!);
  const { data: ileriTarihliIslemler, isLoading: ileriTarihliLoading } = useIleriTarihliIslemlerByHesap(id!);
  const { data: bekleyenCekler, isLoading: ceklerLoading } = useCeklerByHesap(id!);
  const deleteIslem = useDeleteIslem();
  const deleteHesap = useDeleteHesap();
  const updateHesap = useUpdateHesap();
  const unarchiveHesap = useUnarchiveHesap();

  const handleUnarchive = async () => {
    try {
      await unarchiveHesap.mutateAsync(id!);
      Alert.alert(t('common:status.success'), t('common:archive.messages.unarchiveSuccess'));
    } catch (error) {
      Alert.alert(t('common:status.error'), t('common:messages.operationFailed'));
    }
  };

  const [expandedIslemId, setExpandedIslemId] = useState<string | null>(null);
  const [showTransactionBar, setShowTransactionBar] = useState(false);
  const [transactionType, setTransactionType] = useState<TransactionType>('gelir');
  const [showMenu, setShowMenu] = useState(false);
  const [showCekKesSheet, setShowCekKesSheet] = useState(false);
  const [showExportSheet, setShowExportSheet] = useState(false);
  const [editBalanceModalVisible, setEditBalanceModalVisible] = useState(false);
  const [newBalanceInput, setNewBalanceInput] = useState('');
  const isOpeningRef = useRef(false);

  // Debounced transaction opener to prevent race conditions
  const openTransaction = useCallback((type: TransactionType) => {
    if (isOpeningRef.current) return;
    isOpeningRef.current = true;

    setTransactionType(type);
    setShowTransactionBar(true);

    // Reset guard after animation completes
    setTimeout(() => {
      isOpeningRef.current = false;
    }, 500);
  }, []);

  // Cross-currency işlemler için hesabın para birimi cinsinden tutarı al
  const getAmountInAccountCurrency = (islem: IslemWithRelations): number => {
    const sourceAmount = Number(islem.amount);

    // Cross-currency transfer değilse source amount kullan
    if (!islem.source_currency || !islem.target_currency ||
        islem.source_currency === islem.target_currency) {
      return sourceAmount;
    }

    // Exchange rate kontrolü
    if (!islem.exchange_rate || islem.exchange_rate <= 0) {
      if (__DEV__) {
        console.warn(`[getAmountInAccountCurrency] Invalid exchange rate for transaction ${islem.id}: ${islem.exchange_rate}`);
      }
      return sourceAmount;
    }

    // Bu hesap hedef hesap mı?
    const isTargetAccount = islem.hedef_hesap_id === id;

    if (isTargetAccount) {
      // Hedef hesaptayız, target amount hesapla
      if (islem.source_currency === 'TRY') {
        return sourceAmount / islem.exchange_rate;
      } else {
        return sourceAmount * islem.exchange_rate;
      }
    }

    // Kaynak hesaptayız, source amount kullan
    return sourceAmount;
  };

  // Başlangıç bakiyesini hesapla (mevcut bakiye - tüm işlemlerin etkisi)
  const calculateInitialBalance = () => {
    if (!hesap || !islemler) return 0;

    let totalEffect = 0;
    islemler.forEach((islem) => {
      // Cross-currency işlemler için doğru tutarı al
      const amount = getAmountInAccountCurrency(islem as IslemWithRelations);

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

    return Number(hesap.balance) - totalEffect;
  };

  // Veritabanında saklanan initial_balance varsa onu kullan, yoksa hesapla (fallback)
  const initialBalance = hesap?.initial_balance !== undefined && hesap?.initial_balance !== null
    ? Number(hesap.initial_balance)
    : calculateInitialBalance();

  // Bakiye düzenleme modal'ını aç
  const handleOpenEditBalance = () => {
    setNewBalanceInput(String(Number(hesap?.balance) || 0));
    setEditBalanceModalVisible(true);
  };

  // Bakiye kaydet
  const handleSaveBalance = async () => {
    const newBalance = parseFloat(newBalanceInput.replace(',', '.'));
    if (isNaN(newBalance)) {
      Alert.alert(t('common:status.error'), t('accounts:messages.invalidBalance'));
      return;
    }

    Alert.alert(
      t('accounts:balance.editBalance'),
      t('accounts:balance.confirmChange', {
        oldBalance: formatCurrency(Number(hesap?.balance) || 0, hesap?.currency),
        newBalance: formatCurrency(newBalance, hesap?.currency),
      }),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.save'),
          onPress: async () => {
            try {
              await updateHesap.mutateAsync({ id: id!, balance: newBalance });
              setEditBalanceModalVisible(false);
              Alert.alert(t('common:status.success'), t('accounts:messages.balanceUpdated'));
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : t('common:messages.operationFailed');
              Alert.alert(t('common:status.error'), message);
            }
          },
        },
      ]
    );
  };

  // Yön bazlı icon: gelen para ← , giden para →
  const getHareketIcon = (type: string, isIncoming: boolean) => {
    if (type === 'transfer') {
      // Transfer için yöne göre ok
      return isIncoming
        ? <ArrowLeft size={20} color={colors.success} />
        : <ArrowRight size={20} color={colors.error} />;
    }

    // Gelen para (gelir, tahsilat)
    if (type === 'gelir' || type === 'cari_tahsilat') {
      return <ArrowLeft size={20} color={colors.success} />;
    }

    // Giden para (gider, ödeme)
    return <ArrowRight size={20} color={colors.error} />;
  };

  // İşlemin hedef/kaynak bilgisini al
  const getTransactionTarget = (islem: IslemWithRelations): string | null => {
    switch (islem.type) {
      case 'transfer':
        // Transfer için hedef veya kaynak hesap
        if (islem.hedef_hesap_id === id) {
          return islem.hesap?.name || null; // Gelen transfer: kaynak hesap
        }
        return islem.hedef_hesap?.name || null; // Giden transfer: hedef hesap
      case 'cari_odeme':
      case 'cari_tahsilat':
      case 'cari_alis':
      case 'cari_satis':
        return islem.cari?.name || null;
      case 'personel_odeme':
      case 'personel_gider':
        if (islem.personel) {
          return `${islem.personel.first_name ?? ''} ${islem.personel.last_name ?? ''}`.trim() || null;
        }
        return null;
      default:
        return null;
    }
  };

  // İşlem gelen mi giden mi?
  const isIncomingTransaction = (type: string, hedefHesapId: string | null): boolean => {
    if (type === 'transfer') {
      return hedefHesapId === id;
    }
    return type === 'gelir' || type === 'cari_tahsilat';
  };

  const getHareketLabel = (type: string) => {
    switch (type) {
      case 'gelir':
        return t('accounts:transactionLabels.gelir');
      case 'gider':
        return t('accounts:transactionLabels.gider');
      case 'transfer':
        return t('accounts:transactionLabels.transfer');
      case 'cari_odeme':
        return t('accounts:transactionLabels.cariOdeme');
      case 'cari_tahsilat':
        return t('accounts:transactionLabels.cariTahsilat');
      case 'personel_odeme':
        return t('accounts:transactionLabels.personelOdeme');
      case 'personel_gider':
        return t('accounts:transactionLabels.personelGider');
      case 'nakit_avans_taksit':
        return t('accounts:transactionLabels.nakitAvansTaksit');
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

  // Cross-currency işlemler için hedef tutarı hesapla
  const calculateTargetAmount = (islem: IslemWithRelations): number => {
    const sourceAmount = Number(islem.amount);

    if (!islem.source_currency || !islem.target_currency ||
        islem.source_currency === islem.target_currency ||
        !islem.exchange_rate || islem.exchange_rate <= 0) {
      return sourceAmount;
    }

    // Exchange rate "1 [foreign] = X TRY" formatında saklanır
    if (islem.source_currency === 'TRY') {
      return sourceAmount / islem.exchange_rate;
    } else {
      return sourceAmount * islem.exchange_rate;
    }
  };

  // Bu hesap perspektifinden gösterilecek tutarı al
  const getDisplayAmount = (islem: IslemWithRelations): number => {
    const sourceAmount = Number(islem.amount);

    // Cross-currency transfer değilse source amount kullan
    if (!islem.source_currency || !islem.target_currency ||
        islem.source_currency === islem.target_currency) {
      return sourceAmount;
    }

    // Bu hesap hedef hesap mı? (gelen transfer)
    const isTargetAccount = islem.hedef_hesap_id === id;

    if (isTargetAccount) {
      // Hedef hesaptayız, target currency cinsinden göster
      return calculateTargetAmount(islem);
    } else {
      // Kaynak hesaptayız, source currency cinsinden göster
      return sourceAmount;
    }
  };

  // Cross-currency dönüşüm bilgisini formatla
  const getCrossCurrencyInfo = (islem: IslemWithRelations): string | null => {
    if (!islem.source_currency || !islem.target_currency || islem.source_currency === islem.target_currency) {
      return null;
    }

    const sourceAmount = Number(islem.amount);
    const targetAmount = calculateTargetAmount(islem);

    // Format source and target amounts
    const formattedSource = formatCurrency(sourceAmount, islem.source_currency as Currency);
    const formattedTarget = formatCurrency(targetAmount, islem.target_currency as Currency);

    return `(${formattedSource} → ${formattedTarget})`;
  };

  const handleDelete = (islemId: string) => {
    Alert.alert(
      t('accounts:deleteConfirm.transactionTitle'),
      t('accounts:deleteConfirm.transactionMessage'),
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

  const handleDeleteHesap = () => {
    setShowMenu(false);
    Alert.alert(
      t('accounts:deleteConfirm.accountTitle'),
      t('accounts:deleteConfirm.accountMessage'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteHesap.mutateAsync(id!);
              router.replace('/(tabs)');
            } catch (error: any) {
              Alert.alert(t('common:status.error'), error.message || t('errors:account.deleteFailed'));
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

  // Header right buttons (share + menu)
  const HeaderRightButtons = () => (
    <View style={styles.headerRightContainer}>
      <TouchableOpacity
        onPress={() => setShowExportSheet(true)}
        style={styles.headerBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Share2 size={22} color={colors.text} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => setShowMenu(true)}
        style={styles.headerBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <MoreVertical size={24} color={colors.text} />
      </TouchableOpacity>
    </View>
  );

  if (hesapLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <Text>{t('common:status.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!hesap) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <EmptyState
          icon={<Wallet size={48} color={colors.textMuted} />}
          title={t('errors:account.notFound')}
          description={t('accounts:details.notFoundDescription')}
        />
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: hesap.name,
          headerRight: () => <HeaderRightButtons />,
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Arşiv Banner */}
          {hesap.is_archived && (
            <View style={styles.bannerContainer}>
              <ArchivedBanner
                onUnarchive={handleUnarchive}
                loading={unarchiveHesap.isPending}
              />
            </View>
          )}

          {/* Hesap Özeti */}
          <Card style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryIcon}>
                {getHesapIcon(hesap.type)}
              </View>
              <View style={styles.summaryInfo}>
                <Text variant="caption" color="secondary">
                  {hesap.type === 'kredi_karti' ? t('accounts:creditCard.currentDebt') : t('accounts:balance.currentBalance')}
                </Text>
                <View style={styles.balanceRow}>
                  <Text variant="h2" color={Number(hesap.balance) >= 0 ? 'primary' : 'error'}>
                    {formatCurrency(Math.abs(Number(hesap.balance)), hesap.currency)}
                  </Text>
                  <TouchableOpacity
                    onPress={handleOpenEditBalance}
                    style={styles.editBalanceBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Pencil size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Kredi Kartı Limit Bilgileri */}
            {hesap.type === 'kredi_karti' && hesap.credit_limit && hesap.credit_limit > 0 && (
              <View style={styles.creditLimitSection}>
                <View style={styles.creditLimitRow}>
                  <View style={styles.creditLimitItem}>
                    <Text variant="caption" color="secondary">{t('accounts:creditCard.creditLimit')}</Text>
                    <Text variant="body" style={styles.creditLimitValue}>{formatCurrency(hesap.credit_limit, hesap.currency)}</Text>
                  </View>
                  <View style={styles.creditLimitItem}>
                    <Text variant="caption" color="secondary">{t('accounts:creditCard.usedCredit')}</Text>
                    <Text variant="body" style={[styles.creditLimitValue, { color: colors.error }]}>{formatCurrency(Math.abs(Number(hesap.balance)), hesap.currency)}</Text>
                  </View>
                  <View style={styles.creditLimitItem}>
                    <Text variant="caption" color="secondary">{t('accounts:creditCard.availableCredit')}</Text>
                    <Text variant="body" style={[styles.creditLimitValue, { color: colors.success }]}>{formatCurrency(hesap.credit_limit - Math.abs(Number(hesap.balance)), hesap.currency)}</Text>
                  </View>
                </View>
              </View>
            )}
          </Card>

          {/* Hızlı İşlem Butonları */}
          <View style={styles.actionButtons}>
            <Button
              variant="primary"
              size="md"
              icon={hesap.type === 'kredi_karti' ? <CreditCard size={18} color={colors.surface} /> : <CircleDollarSign size={18} color={colors.surface} />}
              onPress={() => openTransaction(hesap.type === 'kredi_karti' ? 'kredi_karti_gider' as TransactionType : 'gelir')}
              style={styles.actionBtn}
            >
              {t('accounts:actions.addTransaction')}
            </Button>
            {/* Çek Kes - Sadece banka hesapları için */}
            {hesap.type === 'banka' && (
              <Button
                variant="outline"
                size="md"
                icon={<FileCheck size={18} color={colors.info} />}
                onPress={() => setShowCekKesSheet(true)}
                style={[styles.actionBtn, { borderColor: colors.info }]}
              >
                {t('checks:create')}
              </Button>
            )}
          </View>

          {/* İleri Tarihli İşlemler */}
          <View style={styles.section}>
            <IleriTarihliIslemlerSection
              ileriTarihliIslemler={ileriTarihliIslemler}
              isLoading={ileriTarihliLoading}
            />

            {/* Bekleyen Çekler - Sadece banka hesapları için */}
            {hesap?.type === 'banka' && (
              <BekleyenCeklerSection
                cekler={bekleyenCekler}
                isLoading={ceklerLoading}
                hesapId={id}
              />
            )}

            {/* Hareketler */}
            <Text variant="h3" style={styles.sectionTitle}>
              {t('accounts:details.transactions')}
            </Text>

            {islemlerLoading ? (
              <Text color="secondary">{t('common:status.loading')}</Text>
            ) : (
              <>
                {islemler && islemler.length > 0 && islemler.map((islem) => {
                  const sign = getAmountSign(islem.type, id!, islem.hesap_id, islem.hedef_hesap_id);
                  const colorType = getAmountColor(islem.type, id!, islem.hedef_hesap_id);
                  const isIncoming = isIncomingTransaction(islem.type, islem.hedef_hesap_id);
                  const target = getTransactionTarget(islem as IslemWithRelations);
                  const showTimeInExpanded = !isSameYear(islem.date);
                  const crossCurrencyInfo = getCrossCurrencyInfo(islem as IslemWithRelations);

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
                            {getHareketIcon(islem.type, isIncoming)}
                          </View>
                          <View style={styles.hareketInfo}>
                            <Text variant="body">{formatDateSmart(islem.date)}</Text>
                            <Text variant="caption" color="secondary">
                              {getHareketLabel(islem.type)}
                            </Text>
                            {target && (
                              <Text variant="caption" color="secondary">
                                {target}
                              </Text>
                            )}
                            {crossCurrencyInfo && (
                              <Text variant="caption" style={styles.crossCurrencyText}>
                                {crossCurrencyInfo}
                              </Text>
                            )}
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
                            {sign}{formatCurrency(getDisplayAmount(islem as IslemWithRelations), hesap.currency)}
                          </Text>
                        </View>
                      }
                    >
                      {/* Farklı yıl işlemlerinde saat göster */}
                      {showTimeInExpanded && (
                        <View style={styles.timeRow}>
                          <Clock size={14} color={colors.textMuted} />
                          <Text variant="caption" color="secondary">
                            {t('accounts:details.time')} {formatTime(islem.date)}
                          </Text>
                        </View>
                      )}
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
                  );
                })}

                {/* Başlangıç Bakiyesi - düzenleme/silme yok */}
                <Card style={styles.hareketCard}>
                  <View style={styles.hareketHeader}>
                    <View style={[styles.hareketIcon, { backgroundColor: colors.primaryLight + '30' }]}>
                      <CircleDollarSign size={20} color={colors.primary} />
                    </View>
                    <View style={styles.hareketInfo}>
                      <Text variant="body">{t('accounts:details.initialBalance')}</Text>
                      <Text variant="caption" color="secondary">
                        {t('accounts:details.accountOpening')} • {formatDateShort(hesap?.created_at || '')}
                      </Text>
                    </View>
                    <Text variant="h3" color={initialBalance >= 0 ? 'primary' : 'error'}>
                      {formatCurrency(initialBalance, hesap.currency)}
                    </Text>
                  </View>
                </Card>
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* 3 Nokta Menüsü */}
      <Modal visible={showMenu} transparent animationType="fade">
        <TouchableOpacity
          style={styles.menuBackdrop}
          activeOpacity={1}
          onPress={() => setShowMenu(false)}
        >
          <View style={styles.menuContainer}>
            {/* Düzenle */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                router.push({ pathname: '/hesaplar/duzenle/[id]', params: { id: id } });
              }}
            >
              <Pencil size={20} color={colors.text} />
              <Text variant="body">{t('common:buttons.edit')}</Text>
            </TouchableOpacity>

            {/* Nakit Avanslar - şimdilik gizli
            {hesap.type === 'kredi_karti' && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  router.push({ pathname: '/hesaplar/nakit-avanslar/[id]', params: { id: id } });
                }}
              >
                <Banknote size={20} color={colors.warning} />
                <Text variant="body">{t('accounts:nakitAvans.title')}</Text>
              </TouchableOpacity>
            )}
            */}

            {/* Sil */}
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemDanger]}
              onPress={handleDeleteHesap}
            >
              <Trash2 size={20} color={colors.error} />
              <Text variant="body" color="error">{t('common:buttons.delete')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Quick Transaction Bar - kredi kartı için özel bar */}
      {hesap.type === 'kredi_karti' ? (
        <CreditCardTransactionBar
          visible={showTransactionBar}
          onDismiss={() => setShowTransactionBar(false)}
          creditCard={hesap}
        />
      ) : (
        <QuickTransactionBar
          visible={showTransactionBar}
          onDismiss={() => setShowTransactionBar(false)}
          defaultType={transactionType}
          defaultHesapId={id}
        />
      )}

      {/* Çek Kes Sheet */}
      <CekKesSheet
        visible={showCekKesSheet}
        onDismiss={() => setShowCekKesSheet(false)}
        defaultHesapId={id}
      />

      {/* Export Sheet */}
      <ExportSheet
        visible={showExportSheet}
        onDismiss={() => setShowExportSheet(false)}
        entityType="hesap"
        entityId={id!}
        entityName={hesap.name}
        entityCurrency={hesap.currency}
        currentBalance={Number(hesap.balance)}
      />

      {/* Bakiye Düzenleme Modal */}
      <Modal
        visible={editBalanceModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditBalanceModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.balanceModalOverlay}
          activeOpacity={1}
          onPress={() => setEditBalanceModalVisible(false)}
        >
          <View style={styles.balanceModalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.balanceModalHeader}>
              <Text variant="h3">{t('accounts:balance.editBalance')}</Text>
              <TouchableOpacity onPress={() => setEditBalanceModalVisible(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text variant="caption" color="secondary" style={{ marginBottom: spacing.sm }}>
              {t('accounts:balance.currentBalance')}: {formatCurrency(Number(hesap?.balance) || 0, hesap?.currency)}
            </Text>

            <TextInput
              style={styles.balanceInput}
              value={newBalanceInput}
              onChangeText={setNewBalanceInput}
              keyboardType="numeric"
              placeholder={t('accounts:balance.newBalance')}
              placeholderTextColor={colors.textMuted}
              autoFocus
            />

            <View style={styles.balanceModalButtons}>
              <Button
                variant="outline"
                onPress={() => setEditBalanceModalVisible(false)}
                style={{ flex: 1 }}
              >
                {t('common:buttons.cancel')}
              </Button>
              <Button
                variant="primary"
                onPress={handleSaveBalance}
                style={{ flex: 1 }}
                loading={updateHesap.isPending}
              >
                {t('common:buttons.save')}
              </Button>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
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
  bannerContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  summaryCard: {
    margin: spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
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
  creditLimitSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  creditLimitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  creditLimitItem: {
    alignItems: 'center',
    flex: 1,
  },
  creditLimitValue: {
    fontWeight: '600',
    marginTop: spacing.xs,
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
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  crossCurrencyText: {
    color: colors.info,
    fontStyle: 'italic',
  },
  // Header right buttons
  headerRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginRight: spacing.sm,
  },
  headerBtn: {
    padding: spacing.xs,
  },
  // Menu styles
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 60,
    paddingRight: spacing.md,
  },
  menuContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xs,
    minWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  menuItemDanger: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
    paddingTop: spacing.md + spacing.xs,
  },
  // Balance editing styles
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  editBalanceBtn: {
    padding: spacing.xs,
  },
  balanceModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  balanceModalContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 400,
  },
  balanceModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  balanceInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 18,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  balanceModalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});
