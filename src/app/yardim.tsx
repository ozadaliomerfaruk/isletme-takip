import { View, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';

// Bölümler sabit sırayla render edilir (i18n: help namespace).
const SECTIONS = [
  'home',
  'hesaplar',
  'birikim',
  'cariler',
  'personel',
  'urunler',
  'kategoriler',
  'islemler',
  'ileri',
  'raporlar',
  'mutabakat',
  'paylasim',
  'disaAktarma',
  'tips',
] as const;

export default function YardimPage() {
  const { t } = useTranslation('help');

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <Text variant="h2" bold style={styles.title}>
            {t('title')}
          </Text>
          <Text variant="body" color="secondary" style={styles.intro}>
            {t('intro')}
          </Text>

          {SECTIONS.map((key) => (
            <View key={key} style={styles.section}>
              <Text variant="h3" bold style={styles.sectionTitle}>
                {t(`sections.${key}.title`)}
              </Text>
              <Text variant="body" color="secondary" style={styles.paragraph}>
                {t(`sections.${key}.content`)
                  .split('\n')
                  .map((item) => `• ${item}`)
                  .join('\n')}
              </Text>
            </View>
          ))}
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
    marginBottom: spacing.sm,
  },
  intro: {
    marginBottom: spacing.xl,
    lineHeight: 24,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  paragraph: {
    lineHeight: 25,
  },
});
