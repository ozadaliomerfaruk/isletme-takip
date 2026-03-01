import { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
  ScrollView,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Bell, CalendarClock, X, FileCheck } from 'lucide-react-native';
import { Text } from './Text';
import { TransactionIcon } from './TransactionIcon';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '@/constants/spacing';
import { useIleriTarihliIslemler } from '@/hooks/useIleriTarihliIslemler';
import { formatCurrency } from '@/lib/currency';
import { getTransactionColor, getTransactionPrefix } from '@/lib/transactionColors';
import { useDateFormat } from '@/hooks/useDateFormat';
import { IleriTarihliIslemWithRelations, CekWithRelations } from '@/types/database';
import { useBekleyenCekler } from '@/hooks/useCekler';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// İşlem tipine göre ilgili entity adını çıkar
function getEntityText(item: IleriTarihliIslemWithRelations): string | null {
  if (item.type === 'transfer') {
    if (item.hesap?.name && item.hedef_hesap?.name) {
      return `${item.hesap.name} → ${item.hedef_hesap.name}`;
    }
    return item.hesap?.name || item.hedef_hesap?.name || null;
  }
  if (item.cari?.name) return item.cari.name;
  if (item.personel) {
    const name = `${item.personel.first_name} ${item.personel.last_name ?? ''}`.trim();
    return name || null;
  }
  if (item.hesap?.name) return item.hesap.name;
  return null;
}

export function NotificationBell() {
  const router = useRouter();
  const { t } = useTranslation(['transactions', 'common', 'checks']);
  const { monthsShort } = useDateFormat();
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(-300)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const { data: ileriTarihliIslemler, isLoading: islemlerLoading } = useIleriTarihliIslemler();
  const { data: bekleyenCekler, isLoading: ceklerLoading } = useBekleyenCekler();

  const isLoading = islemlerLoading || ceklerLoading;

  // Birleşik notification item tipi
  type NotificationItem =
    | { itemType: 'islem'; data: IleriTarihliIslemWithRelations }
    | { itemType: 'cek'; data: CekWithRelations };

  const combinedItems = useMemo(() => {
    const items: NotificationItem[] = [];

    // İleri tarihli işlemleri ekle
    ileriTarihliIslemler?.forEach(islem => {
      items.push({ itemType: 'islem', data: islem });
    });

    // Bekleyen çekleri ekle
    bekleyenCekler?.forEach(cek => {
      items.push({ itemType: 'cek', data: cek });
    });

    // Tarihe göre sırala (en yakın önce)
    items.sort((a, b) => {
      const dateA = a.itemType === 'islem' ? a.data.scheduled_date : a.data.vade_tarihi;
      const dateB = b.itemType === 'islem' ? b.data.scheduled_date : b.data.vade_tarihi;
      return dateA.localeCompare(dateB);
    });

    return items;
  }, [ileriTarihliIslemler, bekleyenCekler]);

  const count = combinedItems.length;

  const openModal = () => {
    setIsVisible(true);
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
  };

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 20,
          stiffness: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (isVisible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -300,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setIsVisible(false);
        }
      });
    }
  }, [isOpen, isVisible, slideAnim, fadeAnim]);

  const handleItemPress = (item: NotificationItem) => {
    closeModal();

    if (item.itemType === 'islem') {
      const islem = item.data;
      // İlgili detay sayfasına yönlendir
      if (islem.hesap_id) {
        router.push(`/hesaplar/${islem.hesap_id}`);
      } else if (islem.cari_id) {
        router.push(`/cariler/${islem.cari_id}`);
      } else if (islem.personel_id) {
        router.push(`/personel/${islem.personel_id}`);
      }
    } else {
      // Çek için hesap sayfasına yönlendir
      router.push(`/hesaplar/${item.data.hesap_id}`);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const day = date.getDate();
    return `${day} ${monthsShort[date.getMonth()]}`;
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

  const renderDateLabel = (dateStr: string) => {
    const overdue = isOverdue(dateStr);
    const today = isToday(dateStr);
    if (overdue) {
      return (
        <View style={[styles.datePill, { backgroundColor: colors.error + '12' }]}>
          <Text style={[styles.datePillText, { color: colors.error }]}>
            {t('transactions:scheduled.overdue')}
          </Text>
        </View>
      );
    }
    if (today) {
      return (
        <View style={[styles.datePill, { backgroundColor: colors.warning + '12' }]}>
          <Text style={[styles.datePillText, { color: colors.warning }]}>
            {t('transactions:scheduled.dueToday')}
          </Text>
        </View>
      );
    }
    return <Text style={styles.dateText}>{formatDate(dateStr)}</Text>;
  };

  return (
    <>
      {/* Çan İkonu */}
      <TouchableOpacity
        style={styles.bellButton}
        onPress={openModal}
        activeOpacity={0.7}
      >
        <Bell size={24} color={colors.text} />
        {count > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {count > 99 ? '99+' : count}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Dropdown Modal */}
      <Modal
        visible={isVisible}
        transparent
        animationType="none"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalOverlay} onPress={closeModal}>
          <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]} />
        </Pressable>

        <Animated.View
          style={[
            styles.dropdownContainer,
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={styles.dropdown}>
            {/* Header */}
            <View style={styles.dropdownHeader}>
              <View style={styles.dropdownHeaderLeft}>
                <CalendarClock size={20} color={colors.primary} />
                <Text style={styles.headerTitle}>{t('transactions:scheduled.title')}</Text>
              </View>
              <TouchableOpacity onPress={closeModal} style={styles.closeButton}>
                <X size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Liste */}
            <ScrollView
              style={styles.dropdownList}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {isLoading ? (
                <View style={styles.emptyState}>
                  <Text color="secondary">{t('common:status.loading')}</Text>
                </View>
              ) : count === 0 ? (
                <View style={styles.emptyState}>
                  <CalendarClock size={40} color={colors.textMuted} />
                  <Text color="secondary" style={styles.emptyText}>
                    {t('common:empty.noItems')}
                  </Text>
                </View>
              ) : (
                combinedItems.map((item, index) => {
                  const isCek = item.itemType === 'cek';
                  const date = isCek ? item.data.vade_tarihi : item.data.scheduled_date;
                  const isLast = index === combinedItems.length - 1;

                  if (isCek) {
                    const cek = item.data;
                    return (
                      <TouchableOpacity
                        key={`cek-${cek.id}`}
                        style={[styles.dropdownItem, isLast && styles.dropdownItemLast]}
                        onPress={() => handleItemPress(item)}
                        activeOpacity={0.6}
                      >
                        <View style={[styles.itemIcon, { backgroundColor: colors.info + '15' }]}>
                          <FileCheck size={18} color={colors.info} />
                        </View>
                        <View style={styles.itemContent}>
                          <Text style={styles.itemTitle} numberOfLines={1}>
                            {cek.cari?.name || cek.hesap?.name}
                          </Text>
                          <Text style={styles.itemSubtitle} numberOfLines={1}>
                            {t('checks:labels.check')} · {cek.cek_no}
                          </Text>
                        </View>
                        <View style={styles.itemRight}>
                          <Text style={[styles.itemAmount, { color: colors.error }]}>
                            -{formatCurrency(cek.tutar, cek.hesap?.currency)}
                          </Text>
                          {renderDateLabel(date)}
                        </View>
                      </TouchableOpacity>
                    );
                  }

                  // İleri tarihli işlem render
                  const islem = item.data;
                  const txColor = getTransactionColor(islem.type);
                  const prefix = getTransactionPrefix(islem.type);
                  const entityText = getEntityText(islem);
                  const typeLabel = t(`transactions:types.${islem.type}`);

                  return (
                    <TouchableOpacity
                      key={`islem-${islem.id}`}
                      style={[styles.dropdownItem, isLast && styles.dropdownItemLast]}
                      onPress={() => handleItemPress(item)}
                      activeOpacity={0.6}
                    >
                      <TransactionIcon type={islem.type} size={38} />
                      <View style={styles.itemContent}>
                        <Text style={styles.itemTitle} numberOfLines={1}>
                          {entityText || typeLabel}
                        </Text>
                        <Text style={[styles.itemTypeLabel, { color: txColor }]} numberOfLines={1}>
                          {entityText ? typeLabel : (islem.description || islem.hesap?.name || '')}
                        </Text>
                      </View>
                      <View style={styles.itemRight}>
                        <Text style={[styles.itemAmount, { color: txColor }]}>
                          {prefix}{formatCurrency(Math.abs(islem.amount), islem.hesap?.currency)}
                        </Text>
                        {renderDateLabel(date)}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bellButton: {
    padding: spacing.sm,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: colors.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: colors.surface,
    fontSize: 10,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  dropdownContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  dropdown: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.6,
    paddingTop: spacing.xl + 44, // Safe area
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 12,
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  dropdownHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownList: {
    maxHeight: SCREEN_HEIGHT * 0.42,
  },
  listContent: {
    paddingBottom: spacing.md,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['2xl'],
    gap: spacing.md,
  },
  emptyText: {
    textAlign: 'center',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  dropdownItemLast: {
    borderBottomWidth: 0,
  },
  itemIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemContent: {
    flex: 1,
    gap: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  itemSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  itemTypeLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  itemRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  itemAmount: {
    fontSize: 15,
    fontWeight: fontWeight.bold,
  },
  dateText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
  },
  datePill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: borderRadius.full,
  },
  datePillText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});
