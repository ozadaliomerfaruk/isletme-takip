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
  AppState,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Bell, CalendarClock, X } from 'lucide-react-native';
import { Text } from './Text';
import { TransactionIcon } from './TransactionIcon';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '@/constants/spacing';
import { useIleriTarihliIslemler } from '@/hooks/useIleriTarihliIslemler';
import { formatCurrency } from '@/lib/currency';
import { upperTr } from '@/lib/turkishTextUtils';
import { getTransactionColor, getTransactionPrefix } from '@/lib/transactionColors';
import { useDateFormat } from '@/hooks/useDateFormat';
import { IleriTarihliIslemWithRelations } from '@/types/database';

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
  const { t } = useTranslation(['transactions', 'common']);
  const { monthsShort } = useDateFormat();
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(-300)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const { data: ileriTarihliIslemler, isLoading: islemlerLoading, refetch: refetchIleri } = useIleriTarihliIslemler();

  const isLoading = islemlerLoading;

  // Bildirim çanı GÜNCEL olmalı. refetchOnWindowFocus global olarak KAPALI (pil/veri
  // tasarrufu) ve iOS uygulamayı sıcak tutunca ekran remount olmaz → başka oturum/cihazda
  // ya da arka planda değişen bekleyen kalemler burada bayat kalıp GÖRÜNMEYEBİLİR.
  // Çözüm: uygulama ön plana her gelişinde ileri-tarihli listeyi sessizce tazele.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refetchIleri();
      }
    });
    return () => sub.remove();
  }, [refetchIleri]);

  // Notification item tipi (yalnızca ileri tarihli işlemler)
  type NotificationItem = { itemType: 'islem'; data: IleriTarihliIslemWithRelations };

  const combinedItems = useMemo(() => {
    const items: NotificationItem[] = [];

    // İleri tarihli işlemleri ekle
    ileriTarihliIslemler?.forEach(islem => {
      items.push({ itemType: 'islem', data: islem });
    });

    // Tarihe göre sırala (en yakın önce)
    items.sort((a, b) => a.data.scheduled_date.localeCompare(b.data.scheduled_date));

    return items;
  }, [ileriTarihliIslemler]);

  const count = combinedItems.length;

  // Konu 3: Vadesi BUGÜN veya GEÇMİŞ olan, henüz tamamlanmamış kalem var mı?
  // Varsa çanda dikkat çeken bir "!" göstergesi gösterilir (normal sayı rozetinden ayrı).
  const hasUrgent = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return combinedItems.some((item) => {
      const dateStr = item.data.scheduled_date;
      if (!dateStr) return false;
      const d = new Date(dateStr + 'T00:00:00');
      d.setHours(0, 0, 0, 0);
      return d.getTime() <= today.getTime(); // bugün veya geçmiş
    });
  }, [combinedItems]);

  const openModal = () => {
    refetchIleri(); // çanı açarken en güncel listeyi getir
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

    const islem = item.data;
    // İlgili detay sayfasına yönlendir
    if (islem.hesap_id) {
      router.push(`/hesaplar/${islem.hesap_id}`);
    } else if (islem.cari_id) {
      router.push(`/cariler/${islem.cari_id}`);
    } else if (islem.personel_id) {
      router.push(`/personel/${islem.personel_id}`);
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
        <Bell size={24} color={hasUrgent ? colors.error : colors.text} />
        {count > 0 && (
          <View style={[styles.badge, hasUrgent && styles.badgeUrgent]}>
            <Text style={styles.badgeText}>
              {count > 99 ? '99+' : count}
            </Text>
          </View>
        )}
        {/* Konu 3: Bugün/geçmiş tamamlanmamış işlem varsa dikkat çeken "!" göstergesi */}
        {hasUrgent && (
          <View style={styles.urgentDot}>
            <Text style={styles.urgentDotText}>!</Text>
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
                  const date = item.data.scheduled_date;
                  const isLast = index === combinedItems.length - 1;

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
                          {entityText
                            ? [typeLabel, islem.kategori?.name ? upperTr(islem.kategori.name) : null].filter(Boolean).join(' · ')
                            : [islem.description || islem.hesap?.name, islem.kategori?.name ? upperTr(islem.kategori.name) : null].filter(Boolean).join(' · ') || ''
                          }
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
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
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
  badgeUrgent: {
    backgroundColor: colors.error,
  },
  // Konu 3: vadesi gelmiş/geçmiş uyarısı — çanın sol-altında belirgin "!" göstergesi
  urgentDot: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    backgroundColor: colors.error,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  urgentDotText: {
    color: colors.surface,
    fontSize: 11,
    fontWeight: '800',
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
