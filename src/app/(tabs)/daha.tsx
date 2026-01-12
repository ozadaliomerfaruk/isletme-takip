import { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Receipt,
  BarChart3,
  Building2,
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
  Calendar,
  Upload,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, Card } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useAuthContext } from '@/contexts/AuthContext';
import { changeLanguage, getCurrentLanguage } from '@/i18n';
import type { SupportedLanguage } from '@/i18n/types';
import { useSettings, type CurrencyCode, type DateFormatType } from '@/hooks/useSettings';

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  danger?: boolean;
}

function MenuItem({ icon, label, onPress, danger }: MenuItemProps) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.menuIcon, danger && styles.menuIconDanger]}>{icon}</View>
      <Text variant="body" style={danger && { color: colors.error }}>
        {label}
      </Text>
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
  const { signOut } = useAuthContext();
  const { t } = useTranslation(['settings', 'common', 'navigation', 'auth', 'errors']);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const [dateFormatModalVisible, setDateFormatModalVisible] = useState(false);
  const [currentLang, setCurrentLang] = useState(getCurrentLanguage());

  const {
    currency,
    dateFormat,
    currencyConfig,
    dateFormatConfig,
    setCurrency,
    setDateFormat,
    currencyOptions,
    dateFormatOptions,
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
    setCurrencyModalVisible(false);
  };

  const handleDateFormatChange = async (format: DateFormatType) => {
    await setDateFormat(format);
    setDateFormatModalVisible(false);
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text variant="h2">{t('navigation:tabs.more')}</Text>
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
            <View style={styles.divider} />
            <MenuItem
              icon={<BarChart3 size={22} color={colors.info} />}
              label={t('navigation:menu.reports')}
              onPress={() => router.push('/raporlar')}
            />
          </Card>
        </View>

        {/* Ayarlar */}
        <View style={styles.section}>
          <Text variant="label" color="secondary" style={styles.sectionTitle}>
            {t('settings:titles.settings').toUpperCase()}
          </Text>
          <Card padding="none">
            <MenuItem
              icon={<Building2 size={22} color={colors.warning} />}
              label={t('navigation:menu.businessInfo')}
              onPress={() => router.push('/ayarlar/isletme')}
            />
            <View style={styles.divider} />
            <MenuItem
              icon={<Tag size={22} color={colors.success} />}
              label={t('navigation:menu.categories')}
              onPress={() => router.push('/kategoriler')}
            />
            <View style={styles.divider} />
            <MenuItem
              icon={<Upload size={22} color={colors.primary} />}
              label={t('navigation:menu.importData', { defaultValue: 'Veri İçe Aktar' })}
              onPress={() => router.push('/ayarlar/data-import' as any)}
            />
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => setLanguageModalVisible(true)}
              activeOpacity={0.7}
            >
              <View style={styles.menuIcon}>
                <Languages size={22} color={colors.info} />
              </View>
              <View style={styles.settingRow}>
                <Text variant="body">{t('settings:language.title')}</Text>
                <Text variant="caption" color="muted">
                  {getCurrentLanguageLabel()}
                </Text>
              </View>
              <ChevronRight size={20} color={colors.textMuted} />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => setCurrencyModalVisible(true)}
              activeOpacity={0.7}
            >
              <View style={styles.menuIcon}>
                <Coins size={22} color={colors.success} />
              </View>
              <View style={styles.settingRow}>
                <Text variant="body">{t('settings:currency.title')}</Text>
                <Text variant="caption" color="muted">
                  {t(`settings:currency.${currency}`)}
                </Text>
              </View>
              <ChevronRight size={20} color={colors.textMuted} />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => setDateFormatModalVisible(true)}
              activeOpacity={0.7}
            >
              <View style={styles.menuIcon}>
                <Calendar size={22} color={colors.warning} />
              </View>
              <View style={styles.settingRow}>
                <Text variant="body">{t('settings:dateFormat.title')}</Text>
                <Text variant="caption" color="muted">
                  {dateFormatConfig.example}
                </Text>
              </View>
              <ChevronRight size={20} color={colors.textMuted} />
            </TouchableOpacity>
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
            Defter v1.0.0
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

      {/* Date Format Selection Modal */}
      <Modal
        visible={dateFormatModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDateFormatModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setDateFormatModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text variant="h3">{t('settings:dateFormat.selectDateFormat')}</Text>
              <TouchableOpacity onPress={() => setDateFormatModalVisible(false)}>
                <X size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {dateFormatOptions.map((fmt) => (
              <TouchableOpacity
                key={fmt.code}
                style={[
                  styles.optionItem,
                  dateFormat === fmt.code && styles.optionItemSelected,
                ]}
                onPress={() => handleDateFormatChange(fmt.code)}
              >
                <View style={styles.dateFormatOption}>
                  <Text
                    variant="body"
                    style={dateFormat === fmt.code && { color: colors.primary, fontWeight: '600' }}
                  >
                    {t(`settings:dateFormat.${fmt.code}`)}
                  </Text>
                  <Text variant="caption" color="muted">
                    {fmt.example}
                  </Text>
                </View>
                {dateFormat === fmt.code && (
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
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
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
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: spacing.lg + 36 + spacing.md,
  },
  versionContainer: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
  },
  settingRow: {
    flex: 1,
    gap: 2,
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
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
  dateFormatOption: {
    flex: 1,
    gap: 2,
  },
});
