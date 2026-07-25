import { View, StyleSheet, ScrollView } from 'react-native';
import { useContentBottomPadding } from '@/hooks/useContentBottomPadding';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text, Screen } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';

export default function GelistiriciNotuPage() {
  const contentPaddingBottom = useContentBottomPadding();
  const { t } = useTranslation('help');
  const paragraphs = t('developerNote.body').split('\n\n');

  return (
    <Screen>
      <ScrollView
          contentContainerStyle={{ paddingBottom: contentPaddingBottom }} style={styles.scrollView} showsVerticalScrollIndicator={false}>
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
  paragraph: {
    lineHeight: 25,
    marginBottom: spacing.md,
  },
});
