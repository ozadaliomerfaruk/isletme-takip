import { View, ActivityIndicator } from 'react-native';
import { Text, Card } from '@/components/ui';
import { colors } from '@/constants/colors';
import i18n from '@/i18n';
import { PhaseItemEnhanced } from '../helpers';
import { styles } from '../styles';

interface ImportProgress {
  message: string;
  current: number;
  total: number;
  percentage?: number;
  phase: string;
  phaseDetails?: Record<string, number>;
  itemsPerSecond: number;
  estimatedTimeRemaining?: number;
}

interface StepImportingProps {
  progress: ImportProgress;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export function StepImporting({ progress, t }: StepImportingProps) {
  return (
    <View style={styles.content}>
      <View style={styles.iconContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>

      <Text variant="h2" style={styles.title}>
        {t('dataImport.status.importing')}
      </Text>

      <Text variant="body" color="secondary" style={styles.description}>
        {progress.message}
      </Text>

      <View style={styles.progressContainer}>
        <View style={styles.progressBarRow}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progress.percentage || (progress.total > 0 ? (progress.current / progress.total) * 100 : 0)}%`,
                },
              ]}
            />
          </View>
          <Text variant="label" style={styles.progressPercentage}>
            {progress.percentage || Math.round(progress.total > 0 ? (progress.current / progress.total) * 100 : 0)}%
          </Text>
        </View>
        <Text variant="caption" color="secondary" style={styles.progressText}>
          {progress.current.toLocaleString(i18n.language === 'tr' ? 'tr-TR' : 'en-US')} / {progress.total.toLocaleString(i18n.language === 'tr' ? 'tr-TR' : 'en-US')}
        </Text>

        {progress.phase === 'transactions' && progress.itemsPerSecond > 0 && (
          <View style={styles.progressStats}>
            <Text variant="caption" color="muted">
              {t('dataImport.progressStats.speed', { count: progress.itemsPerSecond })}
            </Text>
            {progress.estimatedTimeRemaining !== undefined && progress.estimatedTimeRemaining > 0 && (
              <Text variant="caption" color="muted">
                {t('dataImport.progressStats.remaining', { seconds: progress.estimatedTimeRemaining })}
              </Text>
            )}
          </View>
        )}
      </View>

      <Card style={styles.phaseCard}>
        <PhaseItemEnhanced
          label={t('dataImport.phases.categories')}
          active={progress.phase === 'categories'}
          done={['accounts', 'clients', 'personel', 'transactions', 'done'].includes(progress.phase)}
          count={progress.phaseDetails?.categories}
        />
        <PhaseItemEnhanced
          label={t('dataImport.phases.accounts')}
          active={progress.phase === 'accounts'}
          done={['clients', 'personel', 'transactions', 'done'].includes(progress.phase)}
          count={progress.phaseDetails?.accounts}
        />
        <PhaseItemEnhanced
          label={t('dataImport.phases.clients')}
          active={progress.phase === 'clients'}
          done={['personel', 'transactions', 'done'].includes(progress.phase)}
          count={progress.phaseDetails?.clients}
        />
        <PhaseItemEnhanced
          label={t('dataImport.phases.personel')}
          active={progress.phase === 'personel'}
          done={['transactions', 'done'].includes(progress.phase)}
          count={progress.phaseDetails?.personel}
        />
        <PhaseItemEnhanced
          label={t('dataImport.phases.transactions')}
          active={progress.phase === 'transactions'}
          done={progress.phase === 'done'}
          count={progress.phaseDetails?.transactions}
          showProgress={progress.phase === 'transactions'}
          current={progress.current}
          total={progress.total}
        />
      </Card>
    </View>
  );
}
