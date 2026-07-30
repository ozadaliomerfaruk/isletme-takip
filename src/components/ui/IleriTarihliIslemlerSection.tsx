import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  CalendarClock,
  Check,
  Pencil,
  Trash2,
} from 'lucide-react-native';
import { Text } from './Text';
import { ExpandableCard } from './ExpandableCard';
import { TransactionIcon } from './TransactionIcon';
import { Button } from './Button';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { upperTr } from '@/lib/turkishTextUtils';
import { getTransactionColor, getTransactionPrefix } from '@/lib/transactionColors';
import {
  Currency,
  IleriTarihliIslemWithRelations,
} from '@/types/database';
import {
  useCompleteIleriTarihliIslem,
  useDeleteIleriTarihliIslem,
} from '@/hooks/useIleriTarihliIslemler';
import { isCrossCurrencyRateRequiredError } from '@/lib/crossCurrency';
import { toErrorMessage } from '@/lib/errors';
import { usePermissions } from '@/hooks/usePermissions';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar/QuickTransactionBar';
import { ExchangeRateBar } from '@/components/transaction/ExchangeRateBar';
import { canAccessTransactionSources } from '@/lib/transactionSourceModules';

interface IleriTarihliIslemlerSectionProps {
  ileriTarihliIslemler: IleriTarihliIslemWithRelations[] | undefined;
  isLoading: boolean;
  title?: string;
  readOnly?: boolean;
}

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

function getTransactionCurrency(item: IleriTarihliIslemWithRelations): string | undefined {
  if (
    item.type === 'cari_odeme'
    || item.type === 'cari_tahsilat'
    || item.type === 'personel_odeme'
    || item.type === 'personel_tahsilat'
  ) {
    return item.hesap?.currency;
  }
  if (item.type.startsWith('cari_')) return item.cari?.currency;
  if (item.type.startsWith('personel_')) return item.personel?.currency;
  return item.hesap?.currency;
}

// Cari/personel işlemlerinde hesap adını göster
function getAccountText(item: IleriTarihliIslemWithRelations): string | null {
  if (item.type === 'transfer') return null;
  if ((item.cari || item.personel) && item.hesap?.name) {
    return item.hesap.name;
  }
  return null;
}

export function IleriTarihliIslemlerSection({
  ileriTarihliIslemler,
  isLoading,
  title,
  readOnly = false,
}: IleriTarihliIslemlerSectionProps) {
  const { t } = useTranslation(['transactions', 'common']);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editTransactionId, setEditTransactionId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const completingIdRef = useRef<string | null>(null);
  const {
    canAccessModule,
    canCreateTransactionType,
    canUpdate,
    canDelete,
    canSeeRecord,
  } = usePermissions();

  const completeIslem = useCompleteIleriTarihliIslem();
  const deleteIslem = useDeleteIleriTarihliIslem();

  // Çapraz-kurlu bir planı tamamlarken kur TAMAMLAMA ANINDA sorulur:
  // ileri_tarihli_islemler tablosu kur saklamıyor (kolon yok), bu yüzden planlama
  // anında kaydedilemiyor. Hook kursuz denemede CrossCurrencyRateRequiredError
  // fırlatıyor → burada yakalanıp ExchangeRateBar açılıyor, onay sonrası aynı id
  // kurla tekrar gönderiliyor. (Eskiden kur hiç sorulmadığı için kullanıcı ham
  // "Geçersiz döviz kuru: TRY → USD" hatası alıyor ve işlemi HİÇ tamamlayamıyordu.)
  const [pendingRate, setPendingRate] = useState<{
    id: string;
    sourceCurrency: Currency;
    targetCurrency: Currency;
    sourceAmount: number;
    completionToken: string | null;
  } | null>(null);
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;

  useEffect(() => {
    if (!readOnly) return;

    setEditTransactionId(null);
    setPendingRate(null);
  }, [readOnly]);

  const displayTitle = title ?? t('transactions:scheduled.title');

  if (isLoading || !ileriTarihliIslemler || ileriTarihliIslemler.length === 0) {
    return null;
  }

  const selectedEditTransaction = editTransactionId
    ? ileriTarihliIslemler.find((item) => item.id === editTransactionId)
    : undefined;
  const canEditSelectedTransaction =
    !readOnly
    && !!selectedEditTransaction
    && canAccessTransactionSources(
      [selectedEditTransaction.type],
      canAccessModule,
    )
    && canUpdate('ileri_tarihli', selectedEditTransaction.created_by ?? null);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const day = date.getDate();
    const monthsResult = t('common:date.months', { returnObjects: true });
    const months = Array.isArray(monthsResult) ? monthsResult : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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

  const runComplete = async (
    id: string,
    exchangeRate?: number,
    expectedToken?: string | null,
  ) => {
    // Alert callback'i aynı frame'de iki kez çalışsa bile ikinci finansal isteği başlatma.
    if (readOnlyRef.current || completingIdRef.current) return;
    completingIdRef.current = id;
    setCompletingId(id);

    try {
      await completeIslem.mutateAsync({ id, exchangeRate, expectedToken });
      Alert.alert(t('common:status.success'), t('transactions:messages.saveSuccess'));
    } catch (error) {
      if (isCrossCurrencyRateRequiredError(error)) {
        if (!readOnlyRef.current) {
          setPendingRate({
            id,
            sourceCurrency: error.sourceCurrency,
            targetCurrency: error.targetCurrency,
            sourceAmount: error.sourceAmount,
            completionToken: error.completionToken,
          });
        }
        return;
      }
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('transactions:messages.saveFailed'));
    } finally {
      if (completingIdRef.current === id) {
        completingIdRef.current = null;
        setCompletingId(null);
      }
    }
  };

  const handleComplete = (item: IleriTarihliIslemWithRelations) => {
    if (readOnlyRef.current || completingIdRef.current) return;

    Alert.alert(
      t('transactions:scheduled.execute'),
      t('transactions:scheduled.executeConfirm', { amount: formatCurrency(item.amount, getTransactionCurrency(item)), type: t(`transactions:types.${item.type}`).toLowerCase() }),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('transactions:scheduled.execute'),
          onPress: () => {
            if (readOnlyRef.current) return;
            void runComplete(item.id);
          },
        },
      ]
    );
  };

  const handleDelete = (item: IleriTarihliIslemWithRelations) => {
    if (readOnlyRef.current || completingIdRef.current) return;

    Alert.alert(
      t('transactions:scheduled.delete'),
      t('transactions:scheduled.deleteConfirm'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            if (readOnlyRef.current || completingIdRef.current) return;
            try {
              await deleteIslem.mutateAsync(item.id);
              Alert.alert(t('common:status.success'), t('transactions:messages.deleteSuccess'));
            } catch (error) {
              Alert.alert(t('common:status.error'), toErrorMessage(error) || t('transactions:messages.deleteFailed'));
            }
          },
        },
      ]
    );
  };

  const handleEdit = (item: IleriTarihliIslemWithRelations) => {
    if (readOnlyRef.current || completingIdRef.current) return;
    setEditTransactionId(item.id);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <CalendarClock size={20} color={colors.primary} />
        <Text variant="h3">{displayTitle}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{ileriTarihliIslemler.length}</Text>
        </View>
      </View>

      {/* QuickTransactionBar for editing */}
      {!readOnly && (
        <QuickTransactionBar
          visible={!!editTransactionId && canEditSelectedTransaction}
          onDismiss={() => setEditTransactionId(null)}
          mode="edit"
          transactionId={editTransactionId ?? undefined}
          isScheduledTransaction={true}
          onSuccess={() => setEditTransactionId(null)}
        />
      )}

      {/* Çapraz-kur barı — tamamlama anında kur (ana bar ile aynı bileşen) */}
      {!readOnly && pendingRate && (
        <ExchangeRateBar
          visible
          onDismiss={() => setPendingRate(null)}
          sourceAmount={pendingRate.sourceAmount}
          sourceCurrency={pendingRate.sourceCurrency}
          targetCurrency={pendingRate.targetCurrency}
          onConfirm={(exchangeRate) => {
            if (readOnlyRef.current) {
              setPendingRate(null);
              return;
            }
            const { id, completionToken } = pendingRate;
            setPendingRate(null);
            void runComplete(id, exchangeRate, completionToken);
          }}
        />
      )}

      {ileriTarihliIslemler.map((item) => {
        const overdue = isOverdue(item.scheduled_date);
        const today = isToday(item.scheduled_date);
        const txColor = getTransactionColor(item.type);
        const prefix = getTransactionPrefix(item.type);
        const entityText = getEntityText(item);
        const accountText = getAccountText(item);
        const typeLabel = t(`transactions:types.${item.type}`);
        const hasSourceAccess = canAccessTransactionSources(
          [item.type],
          canAccessModule,
        );
        const canCompleteItem =
          !readOnly
          && hasSourceAccess
          && canSeeRecord(item.created_by ?? null)
          && canUpdate('ileri_tarihli', item.created_by ?? null)
          && canCreateTransactionType(item.type);

        // Satır 3: açıklama veya kategori + hesap adı
        const secondaryParts: string[] = [];
        if (item.description) secondaryParts.push(item.description);
        if (item.kategori?.name) secondaryParts.push(upperTr(item.kategori.name));
        if (accountText) secondaryParts.push(accountText);

        return (
          <ExpandableCard
            key={item.id}
            expanded={expandedId === item.id}
            onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
            header={
              <View style={styles.itemHeader}>
                <TransactionIcon type={item.type} size={40} />
                <View style={styles.itemContent}>
                  {/* Satır 1: Entity adı + tarih */}
                  <View style={styles.row1}>
                    <Text style={styles.entityText} numberOfLines={1}>
                      {entityText || typeLabel}
                    </Text>
                    {overdue ? (
                      <View style={[styles.dateBadge, styles.dateBadgeOverdue]}>
                        <Text style={[styles.dateBadgeText, { color: colors.error }]}>
                          {t('transactions:scheduled.overdue')}
                        </Text>
                      </View>
                    ) : today ? (
                      <View style={[styles.dateBadge, styles.dateBadgeToday]}>
                        <Text style={[styles.dateBadgeText, { color: colors.warning }]}>
                          {t('transactions:scheduled.dueToday')}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.dateText}>
                        {formatDate(item.scheduled_date)}
                      </Text>
                    )}
                  </View>

                  {/* Satır 2: İşlem tipi + açıklama/kategori/hesap */}
                  <View style={styles.row2}>
                    {entityText && (
                      <Text style={[styles.typeLabel, { color: txColor }]} numberOfLines={1}>
                        {typeLabel}
                      </Text>
                    )}
                    {entityText && secondaryParts.length > 0 && (
                      <Text style={styles.dot}> · </Text>
                    )}
                    {secondaryParts.length > 0 && (
                      <Text style={styles.secondaryText} numberOfLines={1}>
                        {secondaryParts.join(' · ')}
                      </Text>
                    )}
                  </View>

                  {/* Satır 3: Tutar */}
                  <Text style={[styles.amountText, { color: txColor }]}>
                    {prefix}{formatCurrency(Math.abs(Number(item.amount)), getTransactionCurrency(item))}
                  </Text>
                </View>
              </View>
            }
          >
            <View style={styles.actions}>
              {canCompleteItem && (
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Check size={16} color={colors.surface} />}
                  onPress={() => handleComplete(item)}
                  loading={completeIslem.isPending && completingId === item.id}
                  disabled={completingId !== null && completingId !== item.id}
                  style={styles.actionButton}
                >
                  {t('transactions:scheduled.executed')}
                </Button>
              )}
              {!readOnly
                && hasSourceAccess
                && canUpdate('ileri_tarihli', item.created_by ?? null)
                && (
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Pencil size={16} color={colors.text} />}
                  onPress={() => handleEdit(item)}
                  disabled={completingId !== null}
                  style={styles.actionButton}
                >
                  {t('common:buttons.edit')}
                </Button>
              )}
              {!readOnly
                && hasSourceAccess
                && canDelete('ileri_tarihli', item.created_by ?? null)
                && (
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Trash2 size={16} color={colors.error} />}
                  onPress={() => handleDelete(item)}
                  loading={deleteIslem.isPending}
                  disabled={completingId !== null}
                  style={[styles.actionButton, styles.deleteButton]}
                >
                  {t('common:buttons.delete')}
                </Button>
              )}
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
    backgroundColor: colors.primary,
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
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  itemContent: {
    flex: 1,
    gap: 2,
  },
  // Satır 1: entity + tarih
  row1: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  entityText: {
    flex: 1,
    fontSize: 15,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  dateText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  dateBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  dateBadgeOverdue: {
    backgroundColor: colors.error + '15',
  },
  dateBadgeToday: {
    backgroundColor: colors.warning + '15',
  },
  dateBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  // Satır 2: tip + kategori/açıklama
  row2: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  dot: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  secondaryText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  // Satır 3: tutar
  amountText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    marginTop: 2,
  },
  // Actions
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  deleteButton: {
    borderColor: colors.error,
  },
});
