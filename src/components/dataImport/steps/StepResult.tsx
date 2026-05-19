import { useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Download,
  Info,
} from 'lucide-react-native';
import { Text, Card, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import type { ImportPreview } from '@/lib/excelImport';
import { groupSkippedByReason } from '@/lib/excelImport';
import type { SkippedTransaction } from '@/hooks/useDataImport';
import type { ModalType } from '../types';
import { ResultItem } from '../helpers';
import { styles } from '../styles';

interface ImportResult {
  success: boolean;
  categoriesCreated: number;
  accountsCreated: number;
  clientsCreated: number;
  personelCreated: number;
  transactionsCreated: number;
  startingBalancesApplied: number;
  startingBalancesUpdated: number;
  skipped: number;
  skippedTransactions: SkippedTransaction[];
  totalRowsProcessed: number;
  errors: string[];
}

interface StepResultProps {
  result: ImportResult;
  isDryRun: boolean;
  preview: ImportPreview | null;
  onStartImport: (dryRun: boolean) => void;
  onReset: () => void;
  onBack: () => void;
  onSetActiveModal: (modal: ModalType) => void;
  onSetActiveTab: (tab: 'skipped') => void;
  onExportSkipped: () => void;
  translateError: (error: string) => string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export function StepResult({
  result,
  isDryRun,
  preview,
  onStartImport,
  onReset,
  onBack,
  onSetActiveModal,
  onSetActiveTab,
  onExportSkipped,
  translateError,
  t,
}: StepResultProps) {
  const [showSilentlySkipped, setShowSilentlySkipped] = useState(false);

  return (
    <View style={styles.content}>
      <View style={styles.iconContainer}>
        {result.success ? (
          <CheckCircle2 size={64} color={isDryRun ? colors.info : colors.success} />
        ) : (
          <XCircle size={64} color={colors.error} />
        )}
      </View>

      <Text variant="h2" style={styles.title}>
        {isDryRun
          ? t('dataImport.dryRun.result')
          : result.success
            ? t('dataImport.success.complete')
            : t('dataImport.status.importFailed')}
      </Text>

      {isDryRun && (
        <Text variant="body" color="secondary" style={styles.description}>
          {t('dataImport.dryRun.description')}
        </Text>
      )}

      {result.success && (
        <View style={styles.resultGrid}>
          <ResultItem label={t('dataImport.results.category')} value={result.categoriesCreated} isDryRun={isDryRun} />
          <ResultItem label={t('dataImport.results.account')} value={result.accountsCreated} isDryRun={isDryRun} />
          <ResultItem label={t('dataImport.results.client')} value={result.clientsCreated} isDryRun={isDryRun} />
          <ResultItem label={t('dataImport.results.staff')} value={result.personelCreated} isDryRun={isDryRun} />
          <ResultItem label={t('dataImport.results.transaction')} value={result.transactionsCreated} isDryRun={isDryRun} />
        </View>
      )}

      {result.success && (result.startingBalancesApplied > 0 || result.totalRowsProcessed > 0) && (
        <Card style={styles.rowSummaryCard}>
          <View style={styles.rowSummaryRow}>
            <Text variant="body" color="secondary">{t('dataImport.results.transaction')}</Text>
            <Text variant="body" style={{ fontWeight: '600' }}>{result.transactionsCreated.toLocaleString()}</Text>
          </View>
          {result.startingBalancesApplied > 0 && (
            <View style={styles.rowSummaryRow}>
              <Text variant="body" color="secondary">{t('dataImport.results.startingBalance')}</Text>
              <Text variant="body" style={{ fontWeight: '600', color: colors.info }}>{result.startingBalancesApplied.toLocaleString()}</Text>
            </View>
          )}
          {result.startingBalancesUpdated > 0 && (
            <View style={styles.rowSummaryRow}>
              <Text variant="body" color="secondary">{t('dataImport.results.startingBalancesUpdated')}</Text>
              <Text variant="body" style={{ fontWeight: '600', color: colors.success }}>{result.startingBalancesUpdated.toLocaleString()}</Text>
            </View>
          )}
          {result.skipped > 0 && (
            <View style={styles.rowSummaryRow}>
              <Text variant="body" color="secondary">{t('dataImport.results.skipped')}</Text>
              <Text variant="body" style={{ fontWeight: '600', color: colors.warning }}>{result.skipped.toLocaleString()}</Text>
            </View>
          )}
          {preview?.silentlySkipped && preview.silentlySkipped.length > 0 && (
            <TouchableOpacity
              style={styles.rowSummaryRow}
              onPress={() => setShowSilentlySkipped(!showSilentlySkipped)}
            >
              <Text variant="body" color="secondary">
                {t('dataImport.silentlySkipped.title')} {showSilentlySkipped ? '▲' : '▼'}
              </Text>
              <Text variant="body" style={{ fontWeight: '600', color: colors.textMuted }}>
                {preview.silentlySkipped.length.toLocaleString()}
              </Text>
            </TouchableOpacity>
          )}
          <View style={styles.rowSummaryDivider} />
          <View style={styles.rowSummaryRow}>
            <Text variant="label">{t('dataImport.results.totalRows')}</Text>
            <Text variant="label" style={{ fontWeight: '700' }}>{result.totalRowsProcessed.toLocaleString()}</Text>
          </View>
        </Card>
      )}

      {preview?.silentlySkipped && preview.silentlySkipped.length > 0 && showSilentlySkipped && (
        <Card style={styles.silentlySkippedCard}>
          <View style={styles.silentlySkippedHeader}>
            <AlertTriangle size={18} color={colors.textMuted} />
            <Text variant="label" style={{ marginLeft: spacing.sm, color: colors.textMuted }}>
              {t('dataImport.silentlySkipped.count', { count: preview.silentlySkipped.length })}
            </Text>
          </View>
          <View style={styles.silentlySkippedList}>
            {preview.silentlySkipped.slice(0, 20).map((item, idx) => (
              <View key={idx} style={styles.silentlySkippedItem}>
                <Text variant="caption" style={{ color: colors.textMuted, width: 70 }}>
                  {t('dataImport.silentlySkipped.row', { row: item.rowNumber })}
                </Text>
                <Text variant="caption" color="secondary" style={{ flex: 1 }}>
                  {item.reason === 'empty'
                    ? t('dataImport.silentlySkipped.empty')
                    : item.reason === 'no_date_or_type'
                      ? t('dataImport.silentlySkipped.noDateOrType')
                      : t('dataImport.silentlySkipped.noEntity')}
                </Text>
              </View>
            ))}
            {preview.silentlySkipped.length > 20 && (
              <Text variant="caption" color="muted" style={{ textAlign: 'center', marginTop: spacing.sm }}>
                +{preview.silentlySkipped.length - 20} more...
              </Text>
            )}
          </View>
        </Card>
      )}

      {result.skipped > 0 && result.skippedTransactions.length > 0 && (
        <Card style={styles.skippedCard}>
          <View style={styles.skippedHeader}>
            <AlertTriangle size={20} color={colors.warning} />
            <Text variant="label" style={{ color: colors.warning }}>
              {t('dataImport.skipped.count', { count: result.skipped })}
            </Text>
          </View>

          <View style={styles.skippedReasons}>
            {Object.entries(groupSkippedByReason(result.skippedTransactions)).map(([reason, count]) => (
              <View key={reason} style={styles.skippedReasonItem}>
                <Text variant="caption" color="secondary" style={{ flex: 1 }}>
                  • {reason}
                </Text>
                <Text variant="caption" style={{ color: colors.warning, fontWeight: '600' }}>
                  {count}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.skippedInfoBanner}>
            <Info size={16} color={colors.info} />
            <Text variant="caption" style={{ color: colors.info, flex: 1, marginLeft: spacing.sm }}>
              {t('dataImport.skippedTransactions.infoMessage')}
            </Text>
          </View>

          <View style={styles.skippedActions}>
            <Button
              variant="outline"
              size="sm"
              onPress={() => onSetActiveModal('skipped')}
              style={{ flex: 1, marginRight: spacing.sm }}
            >
              {t('dataImport.buttons.viewDetails')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<Download size={16} color={colors.primary} />}
              onPress={onExportSkipped}
              style={{ flex: 1 }}
            >
              {t('dataImport.buttons.downloadExcel')}
            </Button>
          </View>

          <Button
            variant="primary"
            size="sm"
            onPress={() => onSetActiveTab('skipped')}
            style={{ marginTop: spacing.md }}
          >
            {t('dataImport.skippedTransactions.goToSkipped')}
          </Button>
        </Card>
      )}

      {result.errors.length > 0 && (
        <Card style={styles.errorCard}>
          <Text variant="label" style={styles.errorTitle}>{t('dataImport.errors.title')}</Text>
          {result.errors.slice(0, 5).map((err, i) => (
            <Text key={i} variant="caption" color="error">
              • {translateError(err)}
            </Text>
          ))}
          {result.errors.length > 5 && (
            <Text variant="caption" color="secondary">
              {t('dataImport.errors.moreErrors', { count: result.errors.length - 5 })}
            </Text>
          )}
        </Card>
      )}

      {isDryRun ? (
        <>
          <Button
            variant="primary"
            onPress={() => onStartImport(false)}
            style={styles.doneButton}
          >
            {t('dataImport.buttons.startRealImport')}
          </Button>
          <Button variant="outline" onPress={onReset} style={styles.retryButton}>
            {t('common:buttons.cancel')}
          </Button>
        </>
      ) : (
        <>
          <Button variant="primary" onPress={onBack} style={styles.doneButton}>
            {t('common:buttons.ok')}
          </Button>
          {!result.success && (
            <Button variant="outline" onPress={onReset} style={styles.retryButton}>
              {t('common:buttons.retry')}
            </Button>
          )}
        </>
      )}
    </View>
  );
}
