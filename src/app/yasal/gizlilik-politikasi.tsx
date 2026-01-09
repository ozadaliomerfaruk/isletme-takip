import { View, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';

export default function GizlilikPolitikasiPage() {
  const { t } = useTranslation('legal');

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <Text variant="h3" style={styles.title}>
            {t('privacy.title')}
          </Text>
          <Text variant="caption" color="secondary" style={styles.date}>
            {t('privacy.lastUpdated')}
          </Text>

          <View style={styles.section}>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              {t('privacy.intro')}
            </Text>
          </View>

          {/* Section 1: Collected Data */}
          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              {t('privacy.sections.collectedData.title')}
            </Text>

            <Text variant="body" style={styles.subTitle}>
              {t('privacy.sections.collectedData.identity.title')}
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              {t('privacy.sections.collectedData.identity.content').split('\n').map((item, i) => `• ${item}`).join('\n')}
            </Text>

            <Text variant="body" style={styles.subTitle}>
              {t('privacy.sections.collectedData.userContent.title')}
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              {t('privacy.sections.collectedData.userContent.intro')}{'\n'}
              {t('privacy.sections.collectedData.userContent.content').split('\n').map((item, i) => `• ${item}`).join('\n')}
            </Text>

            <Text variant="body" style={styles.subTitle}>
              {t('privacy.sections.collectedData.optional.title')}
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              {t('privacy.sections.collectedData.optional.content')}
            </Text>
          </View>

          {/* Section 2: Data Usage */}
          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              {t('privacy.sections.dataUsage.title')}
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              {t('privacy.sections.dataUsage.intro')}{'\n\n'}
              {t('privacy.sections.dataUsage.items').split('\n').map((item, i) => `• ${item}`).join('\n')}{'\n\n'}
              {t('privacy.sections.dataUsage.outro')}
            </Text>
          </View>

          {/* Section 3: App Store */}
          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              {t('privacy.sections.appStore.title')}
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              {t('privacy.sections.appStore.content').split('\n').map((item, i) => `• ${item}`).join('\n')}
            </Text>
          </View>

          {/* Section 4: Data Security */}
          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              {t('privacy.sections.dataSecurity.title')}
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              {t('privacy.sections.dataSecurity.intro')}{'\n\n'}
              {t('privacy.sections.dataSecurity.items').split('\n').map((item, i) => `• ${item}`).join('\n')}
            </Text>
          </View>

          {/* Section 5: Third Party */}
          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              {t('privacy.sections.thirdParty.title')}
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              {t('privacy.sections.thirdParty.intro')}{'\n\n'}
              {t('privacy.sections.thirdParty.items').split('\n').map((item, i) => `• ${item}`).join('\n')}{'\n\n'}
              {t('privacy.sections.thirdParty.outro')}
            </Text>
          </View>

          {/* Section 6: Retention */}
          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              {t('privacy.sections.retention.title')}
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              {t('privacy.sections.retention.content').split('\n').map((item, i) => `• ${item}`).join('\n')}
            </Text>
          </View>

          {/* Section 7: Children */}
          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              {t('privacy.sections.children.title')}
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              {t('privacy.sections.children.content')}
            </Text>
          </View>

          {/* Section 8: User Rights */}
          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              {t('privacy.sections.userRights.title')}
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              {t('privacy.sections.userRights.intro')}{'\n\n'}
              {t('privacy.sections.userRights.items').split('\n').map((item, i) => `• ${item}`).join('\n')}{'\n\n'}
              {t('privacy.sections.userRights.outro')}
            </Text>
          </View>

          {/* Section 9: Contact */}
          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              {t('privacy.sections.contact.title')}
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              {t('privacy.sections.contact.content')}
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
  subTitle: {
    fontWeight: '600',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  paragraph: {
    lineHeight: 22,
  },
});
