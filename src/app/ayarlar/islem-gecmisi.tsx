import { useState, useMemo, type ReactNode } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Trash2, Pencil, Calendar, Users, Wallet, Tag, User, FileText, Info } from 'lucide-react-native';
import { Stack } from 'expo-router';
import { Text, Card } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useDeletedIslemler, useEditedIslemler } from '@/hooks/useAuditLog';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useSettings } from '@/hooks/useSettings';
import { parseDateFromDB } from '@/lib/date';
import { formatCurrency } from '@/lib/currency';
import type { IslemAuditLog } from '@/types/multiUser';

type TabType = 'deleted' | 'edited';
type ModuleFilterKey = 'all' | 'hesaplar' | 'cariler' | 'personel' | 'urunler';

// Modül filtre chipleri. Tip bazlı sınıflandırma (ürün dökümü audit'te tutulmadığından
// "Ürünler" = alış/satış işlemleri).
const MODULE_FILTERS: { key: ModuleFilterKey; labelKey: string }[] = [
  { key: 'all', labelKey: 'multiUser:auditLog.filterAll' },
  { key: 'hesaplar', labelKey: 'multiUser:auditLog.filterAccounts' },
  { key: 'cariler', labelKey: 'multiUser:auditLog.filterClients' },
  { key: 'personel', labelKey: 'multiUser:auditLog.filterPersonnel' },
  { key: 'urunler', labelKey: 'multiUser:auditLog.filterProducts' },
];

export default function IslemGecmisiPage() {
  const { t } = useTranslation(['multiUser', 'common', 'transactions']);
  const { formatDateNative } = useDateFormat();
  const { currency } = useSettings();
  const [activeTab, setActiveTab] = useState<TabType>('deleted');
  const [moduleFilter, setModuleFilter] = useState<ModuleFilterKey>('all');

  const { data: deletedIslemler, isLoading: deletedLoading } = useDeletedIslemler();
  const { data: editedIslemler, isLoading: editedLoading } = useEditedIslemler();

  const isLoading = activeTab === 'deleted' ? deletedLoading : editedLoading;
  const data = activeTab === 'deleted' ? deletedIslemler : editedIslemler;

  // Modül chip'ine göre tip bazlı filtre.
  const filteredData = useMemo(() => {
    if (!data || moduleFilter === 'all') return data;
    return data.filter((item) => {
      const d = item.new_data ?? item.old_data;
      const type = String(d?.type ?? '');
      switch (moduleFilter) {
        case 'cariler':
          return type.startsWith('cari_');
        case 'personel':
          return type.startsWith('personel_') || type === 'nakit_avans_taksit';
        case 'hesaplar':
          return ['gelir', 'gider', 'transfer', 'kredi_karti_gider'].includes(type);
        case 'urunler':
          return type === 'cari_alis' || type === 'cari_satis';
        default:
          return true;
      }
    });
  }, [data, moduleFilter]);

  const renderAuditItem = (item: IslemAuditLog) => {
    const oldData = item.old_data;
    const newData = item.new_data;
    // Silme: old_data; düzenleme: sonuç (new_data) öncelikli.
    const data = newData ?? oldData;
    const performerName = item.performer?.display_name ?? item.performer?.email ?? '?';

    // İşlemler tablosu kolonları İngilizce: amount / description / type.
    const amountRaw = data?.amount as number | string | null | undefined;
    const amount = amountRaw != null ? Number(amountRaw) : null;
    const description = String(data?.description ?? '').trim();
    const type = data?.type ? String(data.type) : '';
    const typeLabel = type ? t(`transactions:types.${type}`, { defaultValue: type }) : '';
    const baslik = typeLabel || description || '—';

    const oldAmount = oldData?.amount != null ? Number(oldData.amount as number | string) : null;
    const newAmount = newData?.amount != null ? Number(newData.amount as number | string) : null;

    // Detaylar: işlem tarihi, cari, hesap (transferde → hedef), kategori, personel, not.
    const islemTarihi = data?.date ? formatDateNative(parseDateFromDB(String(data.date))) : null;
    const hesapText = item.hesapName
      ? (item.hedefHesapName ? `${item.hesapName} → ${item.hedefHesapName}` : item.hesapName)
      : null;
    const details: { icon: ReactNode; value: string }[] = [];
    if (islemTarihi) details.push({ icon: <Calendar size={13} color={colors.textMuted} />, value: islemTarihi });
    if (item.cariName) details.push({ icon: <Users size={13} color={colors.textMuted} />, value: item.cariName });
    if (hesapText) details.push({ icon: <Wallet size={13} color={colors.textMuted} />, value: hesapText });
    if (item.kategoriName) details.push({ icon: <Tag size={13} color={colors.textMuted} />, value: item.kategoriName });
    if (item.personelName) details.push({ icon: <User size={13} color={colors.textMuted} />, value: item.personelName });
    if (description) details.push({ icon: <FileText size={13} color={colors.textMuted} />, value: description });

    return (
      <View key={item.id} style={styles.auditItem}>
        <View style={styles.auditHeader}>
          <View style={styles.auditIcon}>
            {item.action === 'delete' ? (
              <Trash2 size={16} color={colors.error} />
            ) : (
              <Pencil size={16} color={colors.warning} />
            )}
          </View>
          <View style={styles.auditInfo}>
            <Text variant="body" numberOfLines={1}>{baslik}</Text>
          </View>
          {amount != null && (
            <Text variant="label" style={styles.auditAmount}>
              {formatCurrency(amount, currency)}
            </Text>
          )}
        </View>

        {details.length > 0 && (
          <View style={styles.detailsList}>
            {details.map((d, i) => (
              <View key={i} style={styles.detailRow}>
                {d.icon}
                <Text variant="caption" color="muted" numberOfLines={1} style={styles.detailText}>
                  {d.value}
                </Text>
              </View>
            ))}
          </View>
        )}
        <View style={styles.auditMeta}>
          <Text variant="caption" color="muted">
            {item.action === 'delete'
              ? t('multiUser:auditLog.deletedBy')
              : t('multiUser:auditLog.editedBy')}: {performerName}
          </Text>
          <Text variant="caption" color="muted">
            {formatDateNative(parseDateFromDB(item.created_at))}
          </Text>
        </View>
        {item.action === 'update' && oldAmount != null && newAmount != null && oldAmount !== newAmount && (
          <View style={styles.changeRow}>
            <Text variant="caption" color="muted">
              {t('multiUser:auditLog.originalAmount')}: {formatCurrency(oldAmount, currency)}
            </Text>
            <Text variant="caption" color="muted">→</Text>
            <Text variant="caption" color="muted">
              {t('multiUser:auditLog.newAmount')}: {formatCurrency(newAmount, currency)}
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: t('multiUser:auditLog.title'),
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Bilgilendirme */}
      <View style={styles.infoBanner}>
        <Info size={15} color={colors.textMuted} />
        <Text variant="caption" color="muted" style={styles.infoBannerText}>
          {t('multiUser:auditLog.infoNotice')}
        </Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'deleted' && styles.tabActive]}
          onPress={() => setActiveTab('deleted')}
        >
          <Trash2 size={16} color={activeTab === 'deleted' ? colors.primary : colors.textMuted} />
          <Text
            variant="label"
            style={activeTab === 'deleted' ? { color: colors.primary } : { color: colors.textMuted }}
          >
            {t('multiUser:auditLog.deleted')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'edited' && styles.tabActive]}
          onPress={() => setActiveTab('edited')}
        >
          <Pencil size={16} color={activeTab === 'edited' ? colors.primary : colors.textMuted} />
          <Text
            variant="label"
            style={activeTab === 'edited' ? { color: colors.primary } : { color: colors.textMuted }}
          >
            {t('multiUser:auditLog.edited')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Modül filtre chipleri */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipRow}
      >
        {MODULE_FILTERS.map((f) => {
          const active = moduleFilter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setModuleFilter(f.key)}
            >
              <Text variant="label" style={active ? styles.chipTextActive : styles.chipText}>
                {t(f.labelKey)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          {isLoading ? (
            <Card>
              <Text variant="body" color="muted">{t('common:status.loading')}</Text>
            </Card>
          ) : !filteredData?.length ? (
            <Card>
              <Text variant="body" color="muted">{t('multiUser:auditLog.empty')}</Text>
            </Card>
          ) : (
            <Card padding="none">
              {filteredData.map((item, index) => (
                <View key={item.id}>
                  {index > 0 && <View style={styles.divider} />}
                  {renderAuditItem(item)}
                </View>
              ))}
            </Card>
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
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
  },
  infoBannerText: {
    flex: 1,
    lineHeight: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    padding: spacing.xs,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  tabActive: {
    backgroundColor: colors.surface,
  },
  chipScroll: {
    flexGrow: 0,
    marginBottom: spacing.md,
  },
  chipRow: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
  },
  chipActive: {
    backgroundColor: colors.primaryLight,
  },
  chipText: {
    color: colors.textMuted,
  },
  chipTextActive: {
    color: colors.primary,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderLight,
  },
  auditItem: {
    padding: spacing.md,
    gap: 5,
  },
  auditHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  auditIcon: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  auditInfo: {
    flex: 1,
    gap: 2,
  },
  auditAmount: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  detailsList: {
    marginLeft: 32 + spacing.md,
    marginTop: 1,
    gap: 2,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    flex: 1,
    fontSize: 13,
  },
  auditMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginLeft: 32 + spacing.md,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginLeft: 32 + spacing.md,
  },
});
