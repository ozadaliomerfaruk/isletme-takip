import { View, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';

export default function GelistiriciNotuPage() {
  const { t } = useTranslation('help');
  const paragraphs = t('developerNote.body').split('\n\n');

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {paragraphs.map((paragraph, index) => (
            <Text
              key={index}
              variant="body"
              color={index === 0 ? 'primary' : 'secondary'}
              style={styles.paragraph}
            >
              {paragraph}
            </Text>
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
  paragraph: {
    lineHeight: 25,
    marginBottom: spacing.md,
  },
});
