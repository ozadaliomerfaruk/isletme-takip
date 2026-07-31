import { View, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text, Screen } from '@/components/ui';
import { useContentBottomPadding } from '@/hooks/useContentBottomPadding';
import { spacing } from '@/constants/spacing';

const SECTION_KEYS = [
  'responsibleParty',
  'information',
  'collectionAndUse',
  'sharing',
  'retentionAndSecurity',
  'rightsAndRequests',
] as const;

export default function PrivacyNoticePage() {
  const contentPaddingBottom = useContentBottomPadding();
  const { t } = useTranslation('legal');

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingBottom: contentPaddingBottom }}
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <Text variant="h3" style={styles.title}>
            {t('privacyNotice.title')}
          </Text>
          <Text variant="caption" color="secondary" style={styles.date}>
            {t('privacyNotice.subtitle')}{'\n'}
            {t('privacyNotice.lastUpdated')}
          </Text>

          <View style={styles.section}>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              {t('privacyNotice.intro')}
            </Text>
          </View>

          {SECTION_KEYS.map((sectionKey) => (
            <View key={sectionKey} style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                {t(`privacyNotice.sections.${sectionKey}.title`)}
              </Text>
              <Text variant="body" color="secondary" style={styles.paragraph}>
                {t(`privacyNotice.sections.${sectionKey}.content`)}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
