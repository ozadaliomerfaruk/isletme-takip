import { useState, useRef, useEffect } from 'react';
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
import { Bell, CalendarClock, TrendingUp, TrendingDown, X } from 'lucide-react-native';
import { Text, Card } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useIleriTarihliIslemler } from '@/hooks/useIleriTarihliIslemler';
import { formatCurrency } from '@/lib/currency';
import { IleriTarihliIslemWithRelations } from '@/types/database';
import { ISLEM_TYPE_LABELS } from '@/constants/islemTypes';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export function NotificationBell() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const slideAnim = useRef(new Animated.Value(-300)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const { data: ileriTarihliIslemler, isLoading } = useIleriTarihliIslemler();
  const count = ileriTarihliIslemler?.length || 0;

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -300,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOpen]);

  const handleItemPress = (item: IleriTarihliIslemWithRelations) => {
    setIsOpen(false);

    // İlgili detay sayfasına yönlendir
    if (item.hesap_id) {
      router.push(`/hesaplar/${item.hesap_id}`);
    } else if (item.cari_id) {
      router.push(`/cariler/${item.cari_id}`);
    } else if (item.personel_id) {
      router.push(`/personel/${item.personel_id}`);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const day = date.getDate();
    const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    return `${day} ${months[date.getMonth()]}`;
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

  return (
    <>
      {/* Çan İkonu */}
      <TouchableOpacity
        style={styles.bellButton}
        onPress={() => setIsOpen(true)}
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
        visible={isOpen}
        transparent
        animationType="none"
        onRequestClose={() => setIsOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setIsOpen(false)}>
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
                <Text variant="h3">İleri Tarihli İşlemler</Text>
              </View>
              <TouchableOpacity onPress={() => setIsOpen(false)}>
                <X size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Liste */}
            <ScrollView
              style={styles.dropdownList}
              showsVerticalScrollIndicator={false}
            >
              {isLoading ? (
                <View style={styles.emptyState}>
                  <Text color="secondary">Yükleniyor...</Text>
                </View>
              ) : count === 0 ? (
                <View style={styles.emptyState}>
                  <CalendarClock size={40} color={colors.textMuted} />
                  <Text color="secondary" style={styles.emptyText}>
                    Henüz ileri tarihli işlem yok
                  </Text>
                </View>
              ) : (
                ileriTarihliIslemler?.map((item) => {
                  const overdue = isOverdue(item.scheduled_date);
                  const today = isToday(item.scheduled_date);
                  const isGelir = item.type === 'gelir';

                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        styles.dropdownItem,
                        overdue && styles.dropdownItemOverdue,
                        today && styles.dropdownItemToday,
                      ]}
                      onPress={() => handleItemPress(item)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.itemLeft}>
                        <View
                          style={[
                            styles.itemIcon,
                            { backgroundColor: isGelir ? colors.success + '20' : colors.error + '20' },
                          ]}
                        >
                          {isGelir ? (
                            <TrendingUp size={16} color={colors.success} />
                          ) : (
                            <TrendingDown size={16} color={colors.error} />
                          )}
                        </View>
                        <View style={styles.itemContent}>
                          <Text variant="body" numberOfLines={1}>
                            {item.description || ISLEM_TYPE_LABELS[item.type]}
                          </Text>
                          <Text variant="caption" color="secondary">
                            {item.hesap?.name || item.cari?.name ||
                             (item.personel && `${item.personel.first_name} ${item.personel.last_name}`)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.itemRight}>
                        <Text
                          variant="body"
                          style={{ color: isGelir ? colors.success : colors.error }}
                        >
                          {isGelir ? '+' : '-'}{formatCurrency(item.amount)}
                        </Text>
                        <Text
                          variant="caption"
                          style={{
                            color: overdue ? colors.error : today ? colors.warning : colors.textMuted,
                          }}
                        >
                          {overdue ? 'Gecikmiş' : today ? 'Bugün' : formatDate(item.scheduled_date)}
                        </Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  dropdownContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  dropdown: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: borderRadius.xl,
    borderBottomRightRadius: borderRadius.xl,
    maxHeight: SCREEN_HEIGHT * 0.6,
    paddingTop: spacing.xl + 44, // Safe area için
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropdownHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dropdownList: {
    maxHeight: SCREEN_HEIGHT * 0.4,
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropdownItemOverdue: {
    backgroundColor: colors.error + '10',
  },
  dropdownItemToday: {
    backgroundColor: colors.warning + '10',
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemContent: {
    flex: 1,
  },
  itemRight: {
    alignItems: 'flex-end',
  },
});
