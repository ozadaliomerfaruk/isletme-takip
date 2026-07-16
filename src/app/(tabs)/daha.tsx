import { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, Switch, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Href } from 'expo-router';
import {
  Receipt,
  BarChart3,
  Tag,
  FileText,
  Shield,
  ScrollText,
  LogOut,
  ChevronRight,
  Trash2,
  Languages,
  Check,
  X,
  Coins,
  Upload,
  Archive,
  Share2,
  History,
  Bell,
  StickyNote,
  Star,
  Mail,
  HelpCircle,
  Heart,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';
import { Text, Card, Avatar } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, shadows } from '@/constants/spacing';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/contexts/AuthContext';
import { changeLanguage, getCurrentLanguage } from '@/i18n';
import type { SupportedLanguage } from '@/i18n/types';
import { useSettings, type CurrencyCode } from '@/hooks/useSettings';
import { SharedIsletmeBanner } from '@/components/ui/SharedIsletmeBanner';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePermissions } from '@/hooks/usePermissions';
import { useReview } from '@/contexts/ReviewContext';
import * as Notifications from 'expo-notifications';
import { registerForPushNotificationsAsync, savePushToken, removePushToken } from '@/lib/notifications';

const NOTIFICATIONS_ENABLED_KEY = '@defter_notifications_enabled';

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  danger?: boolean;
  badge?: number;
  subtitle?: string;
}

function MenuItem({ icon, label, onPress, danger, badge, subtitle }: MenuItemProps) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.menuIcon, danger && styles.menuIconDanger]}>{icon}</View>
      <View style={styles.menuContent}>
        <Text variant="body" style={[danger && { color: colors.error }]}>
          {label}
        </Text>
        {subtitle && (
          <Text variant="caption" color="muted">{subtitle}</Text>
        )}
      </View>
      {badge !== undefined && badge > 0 && (
        <View style={styles.badge}>
          <Text variant="caption" style={styles.badgeText}>
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      )}
      <ChevronRight size={20} color={danger ? colors.error : colors.textMuted} />
    </TouchableOpacity>
  );
}

const languageOptions: { code: SupportedLanguage; label: string }[] = [
  { code: 'tr', label: 'Türkçe' },
  { code: 'en', label: 'English' },
];

export default function DahaPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { signOut, user, isletme, isOwner } = useAuthContext();
  const { t } = useTranslation(['settings', 'common', 'navigation', 'auth', 'errors', 'multiUser', 'help']);
  const { canAccessModule } = usePermissions();
  const { openWriteReview } = useReview();
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const [currentLang, setCurrentLang] = useState(getCurrentLanguage());

  const {
    currency,
    setCurrency,
    currencyOptions,
  } = useSettings();

  const handleLanguageChange = async (langCode: SupportedLanguage) => {
    await changeLanguage(langCode);
    setCurrentLang(langCode);
    setLanguageModalVisible(false);
  };

  const getCurrentLanguageLabel = () => {
    const lang = languageOptions.find((l) => l.code === currentLang);
    return lang ? lang.label : 'Türkçe';
  };

  const handleCurrencyChange = async (currencyCode: CurrencyCode) => {
    await setCurrency(currencyCode);
    // Invalidate all queries so dashboard and other screens re-render with new currency
    queryClient.invalidateQueries();
    setCurrencyModalVisible(false);
  };

  // "Bize Yazın": geliştiriciye doğrudan e-posta. Konu + basit gövde ön-doldurulur.
  const handleContactUs = async () => {
    const subject = encodeURIComponent(t('settings:about.contactSubject'));
    const url = `mailto:ozadaliomerfaruk@gmail.com?subject=${subject}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert(t('settings:about.contactUs'), 'ozadaliomerfaruk@gmail.com');
      }
    } catch {
      Alert.alert(t('settings:about.contactUs'), 'ozadaliomerfaruk@gmail.com');
    }
  };

  // Notification toggle state
  // notificationsEnabled: yerel hatırlatma bayrağı (scheduleTransactionReminder bunu okur)
  // pushGranted: OS bildirim izni verili mi (push'un ve iOS "Bildirimler" satırının ön koşulu)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [pushGranted, setPushGranted] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY).then((val) => {
      if (val !== null) setNotificationsEnabled(val === 'true');
    });
    // OS bildirim izni durumunu oku → anahtarı gerçek duruma göre göster
    Notifications.getPermissionsAsync()
      .then(({ status }) => setPushGranted(status === 'granted'))
      .catch(() => {});
  }, []);

  // Tek "Bildirimler" anahtarı: hem OS push iznini/token'ını hem de yerel hatırlatma
  // bayrağını yönetir. NOT (iOS): uygulama izni zorla açıp kapatamaz; yalnızca bir kez
  // İSTEYEBİLİR (sonra iOS "Bildirimler" satırı kalıcı belirir, kullanıcı oradan yönetir).
  // İzin reddedilmişse uygulamadan tekrar sorulamaz → iOS Ayarlar'a yönlendiririz.
  const handleNotificationToggle = async (value: boolean) => {
    if (value) {
      // AÇ: OS iznini iste/sağla + push token'ı kaydet
      const token = await registerForPushNotificationsAsync({ promptIfNeeded: true });
      if (token) {
        if (user) await savePushToken(user.id, token);
        setPushGranted(true);
        setNotificationsEnabled(true);
        await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, 'true');
        return;
      }
      // Token alınamadı (izin yok / fiziksel cihaz değil) → nedenini kontrol et
      let status: Notifications.PermissionStatus | 'undetermined' = 'undetermined';
      try {
        status = (await Notifications.getPermissionsAsync()).status;
      } catch { /* sessiz geç */ }
      setPushGranted(false);
      setNotificationsEnabled(false);
      await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, 'false');
      if (status === 'denied') {
        Alert.alert(
          t('settings:notifications.permissionTitle'),
          t('settings:notifications.permissionDeniedMessage'),
          [
            { text: t('common:buttons.cancel'), style: 'cancel' },
            { text: t('settings:notifications.openSettings'), onPress: () => Linking.openSettings() },
          ]
        );
      }
    } else {
      // KAPAT: yerel hatırlatmaları durdur + push token'ı sil (bildirim gelmesin)
      setNotificationsEnabled(false);
      await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, 'false');
      if (user) await removePushToken(user.id);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      t('auth:logout.title'),
      t('auth:logout.message'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('auth:logout.confirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
            } catch (error) {
              if (__DEV__) {
                console.error('Logout error:', error);
              }
              Alert.alert(t('common:status.error'), t('errors:general.tryAgain'));
            }
          },
        },
      ]
    );
  };

  const businessName = isletme?.name || t('common:appName');
  const userEmail = user?.email || '';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <SharedIsletmeBanner />
        {/* Profile Card */}
        <View style={styles.profileSection}>
          <TouchableOpacity
            style={styles.profileCard}
            onPress={() => router.push('/ayarlar/isletme')}
            activeOpacity={0.7}
          >
            <Avatar name={businessName} size={48} />
            <View style={styles.profileInfo}>
              <Text variant="h3" numberOfLines={1}>{businessName}</Text>
              {userEmail ? (
                <Text variant="caption" color="muted" numberOfLines={1}>{userEmail}</Text>
              ) : null}
            </View>
            <ChevronRight size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* İşlemler & Raporlar */}
        <View style={styles.section}>
          <Text variant="label" color="secondary" style={styles.sectionTitle}>
            {t('settings:sections.transactionsReports')}
          </Text>
          <Card padding="none">
            <MenuItem
              icon={<Receipt size={22} color={colors.primary} />}
              label={t('navigation:menu.allTransactions')}
              onPress={() => router.push('/islemler')}
            />
            {canAccessModule('raporlar') && (
              <>
                <View style={styles.divider} />
                <MenuItem
                  icon={<BarChart3 size={22} color={colors.info} />}
                  label={t('navigation:menu.reports')}
                  onPress={() => router.push('/raporlar')}
                />
              </>
            )}
            {canAccessModule('notlar') && (
              <>
                <View style={styles.divider} />
                <MenuItem
                  icon={<StickyNote size={22} color={colors.warning} />}
                  label={t('navigation:menu.notes')}
                  onPress={() => router.push('/notlar' as Href)}
                />
              </>
            )}
          </Card>
        </View>

        {/* Ayarlar */}
        <View style={styles.section}>
          <Text variant="label" color="secondary" style={styles.sectionTitle}>
            {t('settings:titles.settings').toUpperCase()}
          </Text>
          <Card padding="none">
            <MenuItem
              icon={<Tag size={22} color={colors.success} />}
              label={t('navigation:menu.categories')}
              onPress={() => router.push('/kategoriler')}
            />
            {isOwner && (
              <>
                <View style={styles.divider} />
                <MenuItem
                  icon={<Upload size={22} color={colors.primary} />}
                  label={t('navigation:menu.importData')}
                  onPress={() => router.push('/ayarlar/data-import' as Href)}
                />
              </>
            )}
            <View style={styles.divider} />
            <MenuItem
              icon={<Archive size={22} color={colors.textSecondary} />}
              label={t('common:archive.title')}
              onPress={() => router.push('/arsiv' as Href)}
            />
          </Card>
        </View>

        {/* Çoklu Kullanıcı */}
        <View style={styles.section}>
          <Text variant="label" color="secondary" style={styles.sectionTitle}>
            {t('multiUser:shared.pageTitle').toUpperCase()}
          </Text>
          <Card padding="none">
            <MenuItem
              icon={<Share2 size={22} color={colors.success} />}
              label={t('multiUser:shared.pageTitle')}
              onPress={() => router.push('/ayarlar/paylasilan-isletmeler' as Href)}
            />
            {isOwner && (
              <>
                <View style={styles.divider} />
                <MenuItem
                  icon={<History size={22} color={colors.warning} />}
                  label={t('multiUser:menu.transactionHistory')}
                  onPress={() => router.push('/ayarlar/islem-gecmisi' as Href)}
                />
              </>
            )}
          </Card>
        </View>

        {/* Tercihler */}
        <View style={styles.section}>
          <Text variant="label" color="secondary" style={styles.sectionTitle}>
            {t('settings:sections.preferences')}
          </Text>
          <Card padding="none">
            <MenuItem
              icon={<Languages size={22} color={colors.info} />}
              label={t('settings:language.title')}
              subtitle={getCurrentLanguageLabel()}
              onPress={() => setLanguageModalVisible(true)}
            />
            <View style={styles.divider} />
            <MenuItem
              icon={<Coins size={22} color={colors.success} />}
              label={t('settings:currency.title')}
              subtitle={t(`settings:currency.${currency}`)}
              onPress={() => setCurrencyModalVisible(true)}
            />
            <View style={styles.divider} />
            <View style={styles.menuItem}>
              <View style={styles.menuIcon}>
                <Bell size={22} color={colors.primary} />
              </View>
              <View style={styles.menuContent}>
                <Text variant="body">{t('settings:notifications.title')}</Text>
                <Text variant="caption" color="muted">
                  {pushGranted && notificationsEnabled
                    ? t('settings:notifications.statusOn')
                    : t('settings:notifications.statusOff')}
                </Text>
              </View>
              <Switch
                value={pushGranted && notificationsEnabled}
                onValueChange={handleNotificationToggle}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.white}
              />
            </View>
          </Card>
        </View>

        {/* Değerlendir + Destek */}
        <View style={styles.section}>
          <Card padding="none">
            <MenuItem
              icon={<Star size={22} color={colors.warning} />}
              label={t('settings:about.rateApp')}
              onPress={openWriteReview}
            />
            <View style={styles.divider} />
            <MenuItem
              icon={<Mail size={22} color={colors.primary} />}
              label={t('settings:about.contactUs')}
              onPress={handleContactUs}
            />
            <View style={styles.divider} />
            <MenuItem
              icon={<HelpCircle size={22} color={colors.success} />}
              label={t('settings:about.help')}
              onPress={() => router.push('/yardim' as Href)}
            />
            <View style={styles.divider} />
            <MenuItem
              icon={<Heart size={22} color={colors.error} />}
              label={t('help:developerNote.title')}
              onPress={() => router.push('/gelistirici-notu' as Href)}
            />
          </Card>
        </View>

        {/* Yasal */}
        <View style={styles.section}>
          <Text variant="label" color="secondary" style={styles.sectionTitle}>
            {t('settings:sections.legal')}
          </Text>
          <Card padding="none">
            <MenuItem
              icon={<FileText size={22} color={colors.textSecondary} />}
              label={t('navigation:menu.termsOfService')}
              onPress={() => router.push('/yasal/kullanim-kosullari')}
            />
            <View style={styles.divider} />
            <MenuItem
              icon={<Shield size={22} color={colors.textSecondary} />}
              label={t('navigation:menu.privacyPolicy')}
              onPress={() => router.push('/yasal/gizlilik-politikasi')}
            />
            <View style={styles.divider} />
            <MenuItem
              icon={<ScrollText size={22} color={colors.textSecondary} />}
              label={t('navigation:menu.kvkk')}
              onPress={() => router.push('/yasal/kvkk')}
            />
          </Card>
        </View>

        {/* Hesap */}
        <View style={styles.section}>
          <Text variant="label" color="secondary" style={styles.sectionTitle}>
            {t('settings:account.title').toUpperCase()}
          </Text>
          <Card padding="none">
            <MenuItem
              icon={<LogOut size={22} color={colors.error} />}
              label={t('navigation:menu.logout')}
              onPress={handleLogout}
              danger
            />
            <View style={styles.divider} />
            <MenuItem
              icon={<Trash2 size={22} color={colors.error} />}
              label={t('navigation:menu.deleteAccount')}
              onPress={() => router.push({ pathname: '/ayarlar/hesap-sil' })}
              danger
            />
          </Card>
        </View>

        {/* Versiyon */}
        <View style={styles.versionContainer}>
          <Text variant="caption" color="muted">
            {t('common:appName')} v{Constants.expoConfig?.version || '1.0.0'}
          </Text>
        </View>
      </ScrollView>

      {/* Language Selection Modal */}
      <Modal
        visible={languageModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLanguageModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setLanguageModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text variant="h3">{t('settings:language.selectLanguage')}</Text>
              <TouchableOpacity onPress={() => setLanguageModalVisible(false)}>
                <X size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {languageOptions.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[
                  styles.optionItem,
                  currentLang === lang.code && styles.optionItemSelected,
                ]}
                onPress={() => handleLanguageChange(lang.code)}
              >
                <Text
                  variant="body"
                  style={currentLang === lang.code && { color: colors.primary, fontWeight: '600' }}
                >
                  {lang.label}
                </Text>
                {currentLang === lang.code && (
                  <Check size={20} color={colors.primary} style={styles.checkIcon} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Currency Selection Modal */}
      <Modal
        visible={currencyModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCurrencyModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setCurrencyModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text variant="h3">{t('settings:currency.selectCurrency')}</Text>
              <TouchableOpacity onPress={() => setCurrencyModalVisible(false)}>
                <X size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {currencyOptions.map((curr) => (
              <TouchableOpacity
                key={curr.code}
                style={[
                  styles.optionItem,
                  currency === curr.code && styles.optionItemSelected,
                ]}
                onPress={() => handleCurrencyChange(curr.code)}
              >
                <Text
                  variant="body"
                  style={currency === curr.code && { color: colors.primary, fontWeight: '600' }}
                >
                  {t(`settings:currency.${curr.code}`)}
                </Text>
                {currency === curr.code && (
                  <Check size={20} color={colors.primary} style={styles.checkIcon} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

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
  profileSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.md,
  },
  profileInfo: {
    flex: 1,
    gap: 2,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIconDanger: {
    backgroundColor: colors.errorLight,
  },
  menuContent: {
    flex: 1,
    gap: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderLight,
    marginLeft: spacing.lg + 36 + spacing.md,
  },
  versionContainer: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 320,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.md,
  },
  optionItemSelected: {
    backgroundColor: colors.primaryLight,
  },
  checkIcon: {
    marginLeft: 'auto',
  },
  badge: {
    backgroundColor: colors.error,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  badgeText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 12,
  },
});
