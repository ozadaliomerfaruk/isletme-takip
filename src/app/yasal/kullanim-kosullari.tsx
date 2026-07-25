import { View, StyleSheet, ScrollView } from 'react-native';
import { useContentBottomPadding } from '@/hooks/useContentBottomPadding';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text, Screen } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';

export default function KullanimKosullariPage() {
  const contentPaddingBottom = useContentBottomPadding();
  const { t } = useTranslation('legal');

  const sections = [
    'serviceDescription',
    'usageTerms',
    'accountSecurity',
    'multiUser',
    'dataSecurity',
    'accountDeletion',
    'dataExport',
    'thirdParty',
    'serviceChanges',
    'intellectualProperty',
    'liability',
    'disputes',
    'contact',
  ] as const;

  return (
    <Screen>
      <ScrollView
          contentContainerStyle={{ paddingBottom: contentPaddingBottom }} style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <Text variant="h3" style={styles.title}>
            {t('terms.title')}
          </Text>
          <Text variant="caption" color="secondary" style={styles.date}>
            {t('terms.lastUpdated')}
          </Text>

          <View style={styles.section}>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              {t('terms.intro')}
            </Text>
          </View>

          {sections.map((sectionKey) => (
            <View key={sectionKey} style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                {t(`terms.sections.${sectionKey}.title`)}
              </Text>
              <Text variant="body" color="secondary" style={styles.paragraph}>
                {t(`terms.sections.${sectionKey}.content`)}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
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
});
