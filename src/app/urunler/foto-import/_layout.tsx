import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FotoImportProvider } from '@/contexts/FotoImportContext';
import { colors } from '@/constants/colors';

export default function FotoImportLayout() {
  const { t } = useTranslation('ocrImport');

  return (
    <FotoImportProvider>
      <Stack
        screenOptions={{
          headerShown: true,
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            headerTitle: t('title'),
          }}
        />
        <Stack.Screen
          name="review"
          options={{
            headerTitle: t('review.title'),
          }}
        />
      </Stack>
    </FotoImportProvider>
  );
}
