import { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  FileCheck,
  Check,
  Pencil,
  XCircle,
  Building2,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { ExpandableCard } from '@/components/ui/ExpandableCard';
import { Button } from '@/components/ui/Button';
import { CekStatusBadge } from './CekStatusBadge';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { CekWithRelations } from '@/types/database';
import { useCompleteCek, useCancelCek } from '@/hooks/useCekler';
import { toErrorMessage } from '@/lib/errors';

interface BekleyenCeklerSectionProps {
  cekler: CekWithRelations[] | undefined;
  isLoading: boolean;
  title?: string;
  hesapId?: string; // Opsiyonel - belirli bir hesabın çeklerini göstermek için
}

export function BekleyenCeklerSection({
  cekler,
  isLoading,
  title,
  hesapId,
}: BekleyenCeklerSectionProps) {
  const { t } = useTranslation(['checks', 'common']);
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const completeCek = useCompleteCek();
  const cancelCek = useCancelCek();

  const displayTitle = title ?? t('checks:sections.pending');

  // Filter: only show 'beklemede' (pending) checks, and optionally by hesap
  const filteredCekler = cekler?.filter((c) => {
    // Only show pending checks
    if (c.durum !== 'beklemede') return false;
    // If hesapId is provided, also filter by hesap
    if (hesapId && c.hesap_id !== hesapId) return false;
    return true;
  });

  if (isLoading || !filteredCekler || filteredCekler.length === 0) {
    return null;
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const day = date.getDate();
    const monthsResult = t('common:date.monthsShort', { returnObjects: true });
    const months = Array.isArray(monthsResult)
      ? monthsResult
      : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day} ${months[date.getMonth()]}`;
  };

  const isOverdue = (dateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const vade = new Date(dateStr + 'T00:00:00');
    return vade < today;
  };

  const isToday = (dateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const vade = new Date(dateStr + 'T00:00:00');
    vade.setHours(0, 0, 0, 0);
    return vade.getTime() === today.getTime();
  };

  const handleComplete = (cek: CekWithRelations) => {
    Alert.alert(
      t('checks:actions.complete'),
      t('checks:messages.completeConfirm', {
        cekNo: cek.cek_no,
        amount: formatCurrency(cek.tutar),
      }),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('checks:actions.complete'),
          onPress: async () => {
            try {
              await completeCek.mutateAsync(cek.id);
              Alert.alert(t('common:status.success'), t('checks:messages.completeSuccess'));
            } catch (error) {
              Alert.alert(t('common:status.error'), toErrorMessage(error) || t('checks:messages.completeFailed'));
            }
          },
        },
      ]
    );
  };

  const handleCancel = (cek: CekWithRelations) => {
    Alert.alert(
      t('checks:actions.cancel'),
      t('checks:messages.cancelConfirm'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('checks:actions.cancel'),
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelCek.mutateAsync(cek.id);
              Alert.alert(t('common:status.success'), t('checks:messages.cancelSuccess'));
            } catch (error) {
              Alert.alert(t('common:status.error'), toErrorMessage(error) || t('checks:messages.cancelFailed'));
            }
          },
        },
      ]
    );
  };

  const handleEdit = (cek: CekWithRelations) => {
    // TODO: Düzenleme sayfasına yönlendir
    Alert.alert(t('common:status.info'), t('checks:messages.comingSoon'));
  };

  // Toplam bekleyen tutar
  const toplamTutar = filteredCekler.reduce((sum, c) => sum + Number(c.tutar), 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <FileCheck size={20} color={colors.info} />
        <Text variant="h3">{displayTitle}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{filteredCekler.length}</Text>
        </View>
        <View style={styles.spacer} />
        <Text variant="caption" style={styles.totalAmount}>
          {formatCurrency(toplamTutar)}
        </Text>
      </View>

      {filteredCekler.map((cek) => {
        const overdue = isOverdue(cek.vade_tarihi);
        const today = isToday(cek.vade_tarihi);

        return (
          <ExpandableCard
            key={cek.id}
            expanded={expandedId === cek.id}
            onToggle={() => setExpandedId(expandedId === cek.id ? null : cek.id)}
            header={
              <View style={styles.itemHeader}>
                <View style={styles.itemIcon}>
                  <FileCheck size={18} color={colors.info} />
                </View>
                <View style={styles.itemContent}>
                  <View style={styles.itemTitleRow}>
                    <Text variant="body" numberOfLines={1} style={styles.itemTitle}>
                      {cek.cek_no}
                    </Text>
                    <Text
                      variant="caption"
                      style={{
                        color: overdue ? colors.error : today ? colors.warning : colors.textMuted,
                        fontWeight: overdue || today ? '600' : '400',
                      }}
                    >
                      {overdue
                        ? t('checks:status.overdue')
                        : today
                          ? t('checks:status.dueToday')
                          : formatDate(cek.vade_tarihi)}
                    </Text>
                  </View>
                  <View style={styles.itemSubRow}>
                    <View style={styles.cariInfo}>
                      <Building2 size={12} color={colors.textMuted} />
                      <Text variant="caption" color="secondary" numberOfLines={1}>
                        {cek.cari?.name || t('checks:labels.unknownCari')}
                      </Text>
                    </View>
                    <Text variant="body" style={styles.amount}>
                      {formatCurrency(cek.tutar)}
                    </Text>
                  </View>
                </View>
              </View>
            }
          >
            {/* Detay bilgileri */}
            <View style={styles.details}>
              <View style={styles.detailRow}>
                <Text variant="caption" color="secondary">
                  {t('checks:labels.account')}:
                </Text>
                <Text variant="body">{cek.hesap?.name || '-'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text variant="caption" color="secondary">
                  {t('checks:labels.issueDate')}:
                </Text>
                <Text variant="body">{formatDate(cek.kesim_tarihi)}</Text>
              </View>
              {cek.kategori && (
                <View style={styles.detailRow}>
                  <Text variant="caption" color="secondary">
                    {t('checks:labels.category')}:
                  </Text>
                  <Text variant="body">{cek.kategori.name}</Text>
                </View>
              )}
              {cek.aciklama && (
                <View style={styles.detailRow}>
                  <Text variant="caption" color="secondary">
                    {t('checks:labels.description')}:
                  </Text>
                  <Text variant="body">{cek.aciklama}</Text>
                </View>
              )}
            </View>

            {/* Aksiyon butonları */}
            <View style={styles.actions}>
              <Button
                variant="primary"
                size="sm"
                icon={<Check size={16} color={colors.surface} />}
                onPress={() => handleComplete(cek)}
                loading={completeCek.isPending}
                style={styles.actionButton}
              >
                {t('checks:actions.complete')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<Pencil size={16} color={colors.text} />}
                onPress={() => handleEdit(cek)}
                style={styles.actionButton}
              >
                {t('common:buttons.edit')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<XCircle size={16} color={colors.error} />}
                onPress={() => handleCancel(cek)}
                loading={cancelCek.isPending}
                style={[styles.actionButton, styles.cancelButton]}
              >
                {t('checks:actions.cancel')}
              </Button>
            </View>
          </ExpandableCard>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  badge: {
    backgroundColor: colors.info,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '700',
  },
  spacer: {
    flex: 1,
  },
  totalAmount: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.infoLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemContent: {
    flex: 1,
  },
  itemTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  itemTitle: {
    flex: 1,
    marginRight: spacing.sm,
    fontWeight: '600',
  },
  itemSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cariInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  amount: {
    color: colors.error,
    fontWeight: '600',
  },
  details: {
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  cancelButton: {
    borderColor: colors.error,
  },
});
