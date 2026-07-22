import { View, StyleSheet } from 'react-native';
import {
  FileSpreadsheet,
  Upload,
  Download,
  Undo2,
} from 'lucide-react-native';
import { Text, Card, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { styles } from '../styles';

// Desteklenen işlem tipleri — kategoriye göre gruplu (anlaşılırlık için).
// TRANSACTION_TYPE_MAP ile eşleşir; iade tipleri dahil (eksik değil).
const TYPE_GROUPS: { labelKey: string; keys: string[] }[] = [
  { labelKey: 'typeGroups.basic', keys: ['gelir', 'gider'] },
  { labelKey: 'typeGroups.cari', keys: ['cariAlis', 'cariSatis', 'cariAlisIade', 'cariSatisIade', 'odeme', 'tahsilat'] },
  { labelKey: 'typeGroups.personel', keys: ['personelGider', 'personelOdeme', 'personelTahsilat'] },
  { labelKey: 'typeGroups.other', keys: ['transfer', 'baslangicBakiyesi'] },
];

interface ImportHistoryItem {
  id: string;
  fileName: string;
  importedAt: string;
  transactionsCreated: number;
  accountsCreated: number;
  clientsCreated: number;
  categoriesCreated: number;
  transactionsSkipped: number;
}

interface LastImportItem {
  fileName: string;
  canUndo: boolean;
  importedAt: string;
  transactionIds: string[];
  createdAccountIds?: string[];
  createdClientIds?: string[];
  createdPersonelIds?: string[];
  createdCategoryIds?: string[];
}

interface Step1SelectProps {
  onDownloadTemplate: () => void;
  downloadingTemplate: boolean;
  onSelectFile: () => void;
  lastImport: LastImportItem | null;
  isUndoing: boolean;
  onUndoLastImport: () => void;
  history: ImportHistoryItem[];
  formatDateShort: (date: string) => string;
  language: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export function Step1Select({
  onDownloadTemplate,
  downloadingTemplate,
  onSelectFile,
  lastImport,
  isUndoing,
  onUndoLastImport,
  history,
  formatDateShort,
  language,
  t,
}: Step1SelectProps) {
  return (
    <View style={styles.content}>
      <View style={styles.iconContainer}>
        <FileSpreadsheet size={64} color={colors.primary} />
      </View>

      <Text variant="h2" style={styles.title}>
        {t('dataImport.pageTitle')}
      </Text>

      <Text variant="body" color="secondary" style={styles.description}>
        {t('dataImport.pageDescription')}
      </Text>

      <Card style={styles.stepCard}>
        <View style={styles.stepHeader}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>1</Text>
          </View>
          <View style={styles.stepInfo}>
            <Text variant="body" style={{ fontWeight: '600' }}>{t('dataImport.steps.downloadTemplate')}</Text>
            <Text variant="bodySmall" color="secondary">
              {t('dataImport.steps.downloadTemplateDesc')}
            </Text>
          </View>
        </View>
        <Button
          variant="outline"
          size="sm"
          icon={<Download size={18} color={colors.primary} />}
          onPress={onDownloadTemplate}
          loading={downloadingTemplate}
          style={styles.stepButton}
        >
          {t('dataImport.buttons.downloadTemplate')}
        </Button>
      </Card>

      <Card style={styles.stepCard}>
        <View style={styles.stepHeader}>
          <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
            <Text style={[styles.stepNumberText, { color: colors.surface }]}>2</Text>
          </View>
          <View style={styles.stepInfo}>
            <Text variant="body" style={{ fontWeight: '600' }}>{t('dataImport.steps.selectFile')}</Text>
            <Text variant="bodySmall" color="secondary">
              {t('dataImport.steps.selectFileDesc')}
            </Text>
          </View>
        </View>
        <Button
          variant="primary"
          size="sm"
          icon={<Upload size={18} color={colors.surface} />}
          onPress={onSelectFile}
          style={styles.stepButton}
        >
          {t('dataImport.buttons.selectFile')}
        </Button>
      </Card>

      <Card style={styles.infoCard}>
        <Text variant="h3" style={local.supportedTitle}>
          {t('dataImport.info.supportedTypes')}
        </Text>
        {TYPE_GROUPS.map((group) => (
          <View key={group.labelKey} style={local.typeGroup}>
            <Text variant="label" style={local.typeGroupLabel}>
              {t(`dataImport.${group.labelKey}`)}
            </Text>
            {group.keys.map((k) => (
              <Text key={k} color="secondary" style={local.typeItem}>
                • {t(`dataImport.typeDescriptions.${k}`)}
              </Text>
            ))}
          </View>
        ))}
      </Card>

      {lastImport && lastImport.canUndo && (
        <Card style={[styles.stepCard, { borderColor: colors.warning, borderWidth: 1 }]}>
          <View style={styles.stepHeader}>
            <View style={[styles.stepNumber, { backgroundColor: colors.warning }]}>
              <Undo2 size={16} color={colors.surface} />
            </View>
            <View style={styles.stepInfo}>
              <Text variant="label">{t('dataImport.undo.title')}</Text>
              <Text variant="caption" color="secondary">
                {lastImport.fileName} - {t('dataImport.undo.transactionCount', { count: lastImport.transactionIds.length })}
              </Text>
              <Text variant="caption" color="muted">
                {new Date(lastImport.importedAt).toLocaleDateString(language === 'tr' ? 'tr-TR' : 'en-US', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          </View>
          <Button
            variant="outline"
            size="sm"
            icon={<Undo2 size={18} color={colors.warning} />}
            onPress={onUndoLastImport}
            loading={isUndoing}
            style={[styles.stepButton, { borderColor: colors.warning }]}
          >
            <Text style={{ color: colors.warning }}>{t('dataImport.buttons.undoImport')}</Text>
          </Button>
        </Card>
      )}

      {history.length > 0 && (
        <Card style={styles.infoCard}>
          <Text variant="label" style={styles.infoTitle}>
            {t('dataImport.history.title')}
          </Text>
          <View style={styles.typesList}>
            {history.map((item) => (
              <View key={item.id} style={{ paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text variant="body" style={{ fontWeight: '600', fontSize: 14 }}>
                  {item.fileName}
                </Text>
                <Text variant="caption" color="secondary">
                  {formatDateShort(item.importedAt)} • {item.transactionsCreated} {t('dataImport.results.transaction')}
                  {item.accountsCreated > 0 ? ` • ${item.accountsCreated} ${t('dataImport.results.account')}` : ''}
                  {item.clientsCreated > 0 ? ` • ${item.clientsCreated} ${t('dataImport.results.client')}` : ''}
                  {item.categoriesCreated > 0 ? ` • ${item.categoriesCreated} ${t('dataImport.results.category')}` : ''}
                </Text>
                {item.transactionsSkipped > 0 && (
                  <Text variant="caption" color="muted">
                    {item.transactionsSkipped} {t('dataImport.results.skipped')}
                  </Text>
                )}
              </View>
            ))}
          </View>
        </Card>
      )}
    </View>
  );
}

const local = StyleSheet.create({
  supportedTitle: {
    marginBottom: spacing.md,
  },
  typeGroup: {
    marginBottom: spacing.md,
  },
  typeGroupLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  typeItem: {
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.textSecondary,
    marginBottom: 3,
  },
});
