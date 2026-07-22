import { View, TouchableOpacity } from 'react-native';
import {
  CheckCircle2,
  XCircle,
  Receipt,
  Building2,
  Users,
  Tag,
  ChevronRight,
  AlertTriangle,
  Info,
} from 'lucide-react-native';
import { Text, Card, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import i18n from '@/i18n';
import type { ImportPreview, ValidationResult } from '@/lib/excelImport';
import type { ModalType } from '../types';
import { styles } from '../styles';

interface Step2PreviewProps {
  preview: ImportPreview;
  fileName: string;
  validation: ValidationResult | null;
  countByType: (type: 'hesap' | 'cari' | 'personel') => number;
  countCariAndPersonel: number;
  onSetActiveModal: (modal: ModalType) => void;
  onStartImport: (dryRun: boolean) => void;
  onReset: () => void;
  translateError: (error: string) => string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export function Step2Preview({
  preview,
  fileName,
  validation,
  countByType,
  countCariAndPersonel,
  onSetActiveModal,
  onStartImport,
  onReset,
  translateError,
  t,
}: Step2PreviewProps) {
  return (
    <View style={styles.content}>
      <View style={styles.iconContainer}>
        <CheckCircle2 size={48} color={colors.success} />
      </View>

      <Text variant="h2" style={styles.title}>
        {t('dataImport.preview.fileAnalyzed')}
      </Text>

      <Text variant="body" color="secondary" style={styles.description}>
        {fileName}
      </Text>

      <Text variant="caption" color="muted" style={styles.tapHint}>
        {t('dataImport.preview.tapForDetails')}
      </Text>

      <View style={styles.summaryGrid}>
        <TouchableOpacity
          style={styles.summaryCardTouchable}
          onPress={() => onSetActiveModal('transactions')}
          activeOpacity={0.7}
        >
          <Card style={styles.summaryCardInner}>
            <Receipt size={24} color={colors.primary} />
            <Text variant="h3" style={styles.summaryNumber}>
              {preview.totalRows.toLocaleString(i18n.language === 'tr' ? 'tr-TR' : 'en-US')}
            </Text>
            <Text variant="caption" color="secondary">{t('dataImport.labels.transaction')}</Text>
            <ChevronRight size={14} color={colors.textMuted} style={styles.cardChevron} />
          </Card>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.summaryCardTouchable}
          onPress={() => onSetActiveModal('accounts')}
          activeOpacity={0.7}
        >
          <Card style={styles.summaryCardInner}>
            <Building2 size={24} color={colors.info} />
            <Text variant="h3" style={styles.summaryNumber}>
              {countByType('hesap')}
            </Text>
            <Text variant="caption" color="secondary">{t('dataImport.labels.account')}</Text>
            <ChevronRight size={14} color={colors.textMuted} style={styles.cardChevron} />
          </Card>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.summaryCardTouchable}
          onPress={() => onSetActiveModal('clients')}
          activeOpacity={0.7}
        >
          <Card style={styles.summaryCardInner}>
            <Users size={24} color={colors.warning} />
            <Text variant="h3" style={styles.summaryNumber}>
              {countCariAndPersonel}
            </Text>
            <Text variant="caption" color="secondary">{t('dataImport.labels.clientStaff')}</Text>
            <ChevronRight size={14} color={colors.textMuted} style={styles.cardChevron} />
          </Card>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.summaryCardTouchable}
          onPress={() => onSetActiveModal('categories')}
          activeOpacity={0.7}
        >
          <Card style={styles.summaryCardInner}>
            <Tag size={24} color={colors.success} />
            <Text variant="h3" style={styles.summaryNumber}>
              {preview.uniqueCategories.length}
            </Text>
            <Text variant="caption" color="secondary">{t('dataImport.labels.category')}</Text>
            <ChevronRight size={14} color={colors.textMuted} style={styles.cardChevron} />
          </Card>
        </TouchableOpacity>
      </View>

      <Card style={styles.dateRangeCard}>
        <Text variant="label">{t('dataImport.preview.dateRange')}</Text>
        <Text variant="body" color="secondary">
          {preview.dateRange.min} → {preview.dateRange.max}
        </Text>
      </Card>

      {(preview.skippedEmptyRows > 0 || preview.skippedNoDateOrType > 0 || preview.skippedNoEntity > 0) && (
        <Card style={[styles.dateRangeCard, { backgroundColor: colors.warningLight }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Info size={16} color={colors.warning} style={{ marginRight: 6 }} />
            <Text variant="label" color="warning">{t('dataImport.skippedRows.title')}</Text>
          </View>
          {preview.skippedEmptyRows > 0 && (
            <Text variant="caption" color="secondary">
              • {t('dataImport.skippedRows.emptyRows', { count: preview.skippedEmptyRows })}
            </Text>
          )}
          {preview.skippedNoDateOrType > 0 && (
            <Text variant="caption" color="secondary">
              • {t('dataImport.skippedRows.noDateOrType', { count: preview.skippedNoDateOrType })}
            </Text>
          )}
          {preview.skippedNoEntity > 0 && (
            <Text variant="caption" color="secondary">
              • {t('dataImport.skippedRows.noEntity', { count: preview.skippedNoEntity })}
            </Text>
          )}
        </Card>
      )}

      <Card style={styles.typesCard}>
        <Text variant="label" style={styles.typesTitle}>{t('dataImport.labels.transactionTypes')}</Text>
        {Object.entries(preview.transactionTypes).map(([type, count]) => (
          <View key={type} style={styles.typeRow}>
            <Text variant="body">{type}</Text>
            <Text variant="body" color="secondary">{count}</Text>
          </View>
        ))}
      </Card>

      {validation && (
        <Card style={styles.validationCard}>
          <View style={styles.validationHeader}>
            <Text variant="label">{t('dataImport.validation.title')}</Text>
            <View style={[
              styles.scoreBadge,
              {
                backgroundColor: validation.score >= 90 ? colors.success :
                  validation.score >= 70 ? colors.warning :
                  colors.error,
              },
            ]}>
              <Text style={styles.scoreBadgeText}>{validation.score}%</Text>
            </View>
          </View>

          <View style={styles.qualityBar}>
            <View
              style={[
                styles.qualityBarFill,
                {
                  width: `${validation.score}%`,
                  backgroundColor: validation.score >= 90 ? colors.success :
                    validation.score >= 70 ? colors.warning :
                    colors.error,
                },
              ]}
            />
          </View>

          <View style={styles.validationSummary}>
            <View style={styles.validationItem}>
              <CheckCircle2 size={16} color={colors.success} />
              <Text variant="caption" color="secondary">
                {t('dataImport.validation.validTransactions', { count: validation.validCount })}
              </Text>
            </View>
            {validation.warningCount > 0 && (
              <View style={styles.validationItem}>
                <Info size={16} color={colors.warning} />
                <Text variant="caption" color="secondary">
                  {t('dataImport.validation.warningTransactions', { count: validation.warningCount })}
                </Text>
              </View>
            )}
            {validation.errorCount > 0 && (
              <View style={styles.validationItem}>
                <XCircle size={16} color={colors.error} />
                <Text variant="caption" color="secondary">
                  {t('dataImport.validation.errorTransactions', { count: validation.errorCount })}
                </Text>
              </View>
            )}
          </View>

          {validation.issues.length > 0 && (
            <View style={styles.validationIssues}>
              {validation.issues.slice(0, 3).map((issue, i) => (
                <View key={i} style={styles.issueRow}>
                  <View style={styles.issueIcon}>
                    {issue.type === 'error' ? (
                      <XCircle size={14} color={colors.error} />
                    ) : issue.type === 'warning' ? (
                      <AlertTriangle size={14} color={colors.warning} />
                    ) : (
                      <Info size={14} color={colors.info} />
                    )}
                  </View>
                  <View style={styles.issueContent}>
                    <Text variant="caption" color={issue.type === 'error' ? 'error' : 'secondary'}>
                      {t(`${issue.messageKey}Desc`, { count: issue.count, defaultValue: issue.message })}
                    </Text>
                    {issue.suggestion && (
                      <Text variant="caption" color="muted" style={styles.issueSuggestion}>
                        {t(`${issue.messageKey}Suggestion`, { defaultValue: issue.suggestion })}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </Card>
      )}

      {preview.errors.length > 0 && (
        <Card style={styles.errorCard}>
          <View style={styles.errorHeader}>
            <AlertTriangle size={20} color={colors.warning} />
            <Text variant="label" style={styles.errorTitle}>
              {t('dataImport.warnings.warningCount', { count: preview.errors.length })}
            </Text>
          </View>
          {preview.errors.slice(0, 5).map((err, i) => (
            <Text key={i} variant="caption" color="secondary">
              • {translateError(err)}
            </Text>
          ))}
        </Card>
      )}

      <Button
        variant="outline"
        onPress={() => onStartImport(true)}
        style={styles.dryRunButton}
      >
        {t('dataImport.dryRun.button')}
      </Button>

      <View style={styles.buttonRow}>
        <Button variant="outline" onPress={onReset} style={styles.halfButton}>
          {t('common:buttons.cancel')}
        </Button>
        <Button
          variant="primary"
          onPress={() => onStartImport(false)}
          style={styles.halfButton}
        >
          {t('dataImport.buttons.startImport')}
        </Button>
      </View>
    </View>
  );
}
