import { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Trash2, Pencil } from 'lucide-react-native';
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

export default function IslemGecmisiPage() {
  const router = useRouter();
  const { t } = useTranslation(['multiUser', 'common']);
  const { formatDateNative } = useDateFormat();
  const { currency } = useSettings();
  const [activeTab, setActiveTab] = useState<TabType>('deleted');

  const { data: deletedIslemler, isLoading: deletedLoading } = useDeletedIslemler();
  const { data: editedIslemler, isLoading: editedLoading } = useEditedIslemler();

  const isLoading = activeTab === 'deleted' ? deletedLoading : editedLoading;
  const data = activeTab === 'deleted' ? deletedIslemler : editedIslemler;

  const renderAuditItem = (item: IslemAuditLog) => {
    const oldData = item.old_data as Record<string, any> | null;
    const newData = item.new_data as Record<string, any> | null;
    const performerName = (item as any).performer?.display_name ?? (item as any).performer?.email ?? '?';
    const amount = oldData?.tutar ?? newData?.tutar;
    const aciklama = oldData?.aciklama ?? newData?.aciklama ?? '';

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
            <Text variant="body" numberOfLines={1}>{aciklama || '-'}</Text>
            {amount && (
              <Text variant="label" style={{ color: colors.text }}>
                {formatCurrency(amount, currency)}
              </Text>
            )}
          </View>
        </View>
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
        {item.action === 'update' && oldData?.tutar && newData?.tutar && oldData.tutar !== newData.tutar && (
          <View style={styles.changeRow}>
            <Text variant="caption" color="muted">
              {t('multiUser:auditLog.originalAmount')}: {formatCurrency(oldData.tutar, currency)}
            </Text>
            <Text variant="caption" color="muted">→</Text>
            <Text variant="caption" color="muted">
              {t('multiUser:auditLog.newAmount')}: {formatCurrency(newData.tutar, currency)}
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text variant="h3">{t('multiUser:auditLog.title')}</Text>
          <Text variant="caption" color="muted">{t('multiUser:auditLog.subtitle')}</Text>
        </View>
        <View style={{ width: 40 }} />
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

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          {isLoading ? (
            <Card>
              <Text variant="body" color="muted">{t('common:status.loading')}</Text>
            </Card>
          ) : !data?.length ? (
            <Card>
              <Text variant="body" color="muted">{t('multiUser:auditLog.empty')}</Text>
            </Card>
          ) : (
            <Card padding="none">
              {data.map((item, index) => (
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
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
    padding: spacing.lg,
    gap: spacing.sm,
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
