import { useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  FlatList,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Wallet,
  Users,
  TrendingUp,
  ChevronRight,
} from 'lucide-react-native';
import { Text, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';

const { width } = Dimensions.get('window');

const ONBOARDING_KEY = '@defter_onboarding_completed';

interface OnboardingSlide {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  backgroundColor: string;
  iconBgColor: string;
}

export default function OnboardingScreen() {
  const { t } = useTranslation(['auth', 'common']);
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);

  const slides: OnboardingSlide[] = [
    {
      id: '1',
      title: t('auth:onboarding.accountsTitle'),
      description: t('auth:onboarding.accountsDescription'),
      icon: <Wallet size={80} color={colors.primary} />,
      backgroundColor: colors.background,
      iconBgColor: colors.primaryLight + '40',
    },
    {
      id: '2',
      title: t('auth:onboarding.clientsPersonnelTitle'),
      description: t('auth:onboarding.clientsPersonnelDescription'),
      icon: <Users size={80} color={colors.info} />,
      backgroundColor: colors.background,
      iconBgColor: colors.infoLight + '40',
    },
    {
      id: '3',
      title: t('auth:onboarding.incomeExpenseTitle'),
      description: t('auth:onboarding.incomeExpenseDescription'),
      icon: <TrendingUp size={80} color={colors.success} />,
      backgroundColor: colors.background,
      iconBgColor: colors.successLight + '40',
    },
  ];
  const scrollX = useRef(new Animated.Value(0)).current;
  const slidesRef = useRef<FlatList>(null);

  const viewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems[0]) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;

  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const scrollTo = () => {
    if (currentIndex < slides.length - 1) {
      slidesRef.current?.scrollToIndex({ index: currentIndex + 1 });
    } else {
      completeOnboarding();
    }
  };

  const completeOnboarding = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
      router.replace('/(tabs)');
    } catch (error) {
      // TODO i18n: This is a console.error, not user-facing - keep as-is or use logging key
      console.error('Onboarding kayıt hatası:', error);
      router.replace('/(tabs)');
    }
  };

  const skipOnboarding = async () => {
    await completeOnboarding();
  };

  const renderSlide = ({ item }: { item: OnboardingSlide }) => {
    return (
      <View style={[styles.slide, { width }]}>
        <View style={[styles.iconContainer, { backgroundColor: item.iconBgColor }]}>
          {item.icon}
        </View>
        <Text variant="h1" style={styles.title}>
          {item.title}
        </Text>
        <Text variant="body" color="secondary" style={styles.description}>
          {item.description}
        </Text>
      </View>
    );
  };

  const Paginator = () => {
    return (
      <View style={styles.paginatorContainer}>
        {slides.map((_, index) => {
          const inputRange = [(index - 1) * width, index * width, (index + 1) * width];

          const dotWidth = scrollX.interpolate({
            inputRange,
            outputRange: [8, 24, 8],
            extrapolate: 'clamp',
          });

          const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.3, 1, 0.3],
            extrapolate: 'clamp',
          });

          return (
            <Animated.View
              key={index.toString()}
              style={[
                styles.dot,
                {
                  width: dotWidth,
                  opacity,
                  backgroundColor: colors.primary,
                },
              ]}
            />
          );
        })}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Skip Button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={skipOnboarding} style={styles.skipButton}>
          <Text variant="label" color="secondary">
            {t('auth:onboarding.skip')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Slides */}
      <View style={styles.slidesContainer}>
        <FlatList
          data={slides}
          renderItem={renderSlide}
          horizontal
          showsHorizontalScrollIndicator={false}
          pagingEnabled
          bounces={false}
          keyExtractor={(item) => item.id}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: false }
          )}
          scrollEventThrottle={32}
          onViewableItemsChanged={viewableItemsChanged}
          viewabilityConfig={viewConfig}
          ref={slidesRef}
        />
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Paginator />

        <View style={styles.buttonContainer}>
          {currentIndex === slides.length - 1 ? (
            <Button
              variant="primary"
              size="lg"
              onPress={completeOnboarding}
              style={styles.startButton}
            >
              {t('auth:onboarding.start')}
            </Button>
          ) : (
            <TouchableOpacity style={styles.nextButton} onPress={scrollTo}>
              <Text variant="label" style={{ color: colors.surface }}>
                {t('auth:onboarding.next')}
              </Text>
              <ChevronRight size={20} color={colors.surface} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  skipButton: {
    padding: spacing.sm,
  },
  slidesContainer: {
    flex: 3,
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  iconContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing['2xl'],
  },
  title: {
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  description: {
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: spacing.md,
  },
  footer: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  paginatorContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: 40,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  buttonContainer: {
    alignItems: 'center',
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['2xl'],
    borderRadius: 30,
    gap: spacing.xs,
  },
  startButton: {
    width: '100%',
  },
});
