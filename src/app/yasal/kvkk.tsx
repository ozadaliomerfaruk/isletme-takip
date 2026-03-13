import { View, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';

export default function KVKKPage() {
  const { t } = useTranslation('legal');

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <Text variant="h3" style={styles.title}>
            {t('kvkk.title')}
          </Text>
          <Text variant="caption" color="secondary" style={styles.date}>
            {t('kvkk.subtitle')}
          </Text>

          <View style={styles.section}>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              {t('kvkk.intro')}
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              {t('kvkk.sections.dataController.title')}
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              {t('kvkk.sections.dataController.content')}
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              {t('kvkk.sections.processedData.title')}
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              {t('kvkk.sections.processedData.intro')}{'\n\n'}
              <Text style={styles.bold}>{t('kvkk.sections.processedData.identity')}</Text>{'\n'}
              {t('kvkk.sections.processedData.identityItems')}{'\n\n'}
              <Text style={styles.bold}>{t('kvkk.sections.processedData.contact')}</Text>{'\n'}
              {t('kvkk.sections.processedData.contactItems')}{'\n\n'}
              <Text style={styles.bold}>{t('kvkk.sections.processedData.auth')}</Text>{'\n'}
              {t('kvkk.sections.processedData.authItems')}{'\n\n'}
              <Text style={styles.bold}>{t('kvkk.sections.processedData.financial')}</Text>{'\n'}
              {t('kvkk.sections.processedData.financialItems')}{'\n\n'}
              <Text style={styles.bold}>{t('kvkk.sections.processedData.visual')}</Text>{'\n'}
              {t('kvkk.sections.processedData.visualItems')}{'\n\n'}
              <Text style={styles.bold}>{t('kvkk.sections.processedData.technical')}</Text>{'\n'}
              {t('kvkk.sections.processedData.technicalItems')}
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              {t('kvkk.sections.purposes.title')}
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              {t('kvkk.sections.purposes.intro')}{'\n\n'}
              {t('kvkk.sections.purposes.items').split('\n').map((item, i) => `• ${item}`).join('\n')}
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              {t('kvkk.sections.legalBasis.title')}
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              {t('kvkk.sections.legalBasis.intro')}{'\n\n'}
              {t('kvkk.sections.legalBasis.items').split('\n').map((item, i) => `• ${item}`).join('\n')}{'\n\n'}
              {t('kvkk.sections.legalBasis.consent')}
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              {t('kvkk.sections.transfer.title')}
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              {t('kvkk.sections.transfer.intro')}{'\n\n'}
              {t('kvkk.sections.transfer.items').split('\n').map((item, i) => `• ${item}`).join('\n')}{'\n\n'}
              {t('kvkk.sections.transfer.outro')}
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              {t('kvkk.sections.rights.title')}
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              {t('kvkk.sections.rights.intro')}{'\n\n'}
              {t('kvkk.sections.rights.items')}{'\n\n'}
              {t('kvkk.sections.rights.outro')}
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              {t('kvkk.sections.application.title')}
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              {t('kvkk.sections.application.intro')}{'\n\n'}
              {t('kvkk.sections.application.email')}{'\n\n'}
              {t('kvkk.sections.application.outro')}
            </Text>
          </View>
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
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  title: {
    marginBottom: spacing.xs,
  },
  date: {
    marginBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
  },
  paragraph: {
    lineHeight: 22,
  },
  bold: {
    fontWeight: '600',
  },
});
