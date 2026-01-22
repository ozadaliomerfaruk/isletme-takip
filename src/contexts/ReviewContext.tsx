/**
 * ReviewContext
 * Provides in-app review functionality across the app
 * Uses ActionSheet for thank you prompt
 */

import { createContext, useContext, useState, useCallback, useEffect, ReactNode, useMemo } from 'react';
import { Platform, Linking } from 'react-native';
import * as StoreReview from 'expo-store-review';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  initializeReviewTracking,
  checkReviewEligibility,
  recordReviewPromptShown,
} from '@/lib/reviewStorage';
import { ActionSheet, ActionSheetOption } from '@/components/ui/ActionSheet';
import { useAuthContext } from '@/contexts/AuthContext';

// App Store ID - Update with your actual App Store ID
const APP_STORE_ID = '6740512078';
// Android package name
const ANDROID_PACKAGE_NAME = 'com.defterapp.isletmetakip';

interface ReviewContextValue {
  /** Trigger review flow if eligible (checks transaction count internally) */
  triggerReviewIfEligible: () => Promise<void>;
}

const ReviewContext = createContext<ReviewContextValue | null>(null);

interface ReviewProviderProps {
  children: ReactNode;
}

export function ReviewProvider({ children }: ReviewProviderProps) {
  const [showActionSheet, setShowActionSheet] = useState(false);
  const queryClient = useQueryClient();
  const { isletme } = useAuthContext();
  const { t } = useTranslation('common');

  // Initialize tracking on mount
  useEffect(() => {
    initializeReviewTracking().catch((error) => {
      console.error('[ReviewProvider] Error initializing tracking:', error);
    });
  }, []);

  /**
   * Open App Store/Play Store review page
   */
  const openWriteReview = useCallback(async () => {
    try {
      if (Platform.OS === 'ios') {
        const url = `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`;
        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) {
          await Linking.openURL(url);
        }
      } else if (Platform.OS === 'android') {
        const url = `market://details?id=${ANDROID_PACKAGE_NAME}&showAllReviews=true`;
        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) {
          await Linking.openURL(url);
        } else {
          // Fallback to web URL
          await Linking.openURL(
            `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_NAME}&showAllReviews=true`
          );
        }
      }
    } catch (error) {
      console.error('[ReviewProvider] Error opening store review:', error);
    }
  }, []);

  /**
   * Close the action sheet
   */
  const closeActionSheet = useCallback(() => {
    setShowActionSheet(false);
  }, []);

  /**
   * ActionSheet options
   */
  const actionSheetOptions = useMemo<ActionSheetOption[]>(
    () => [
      {
        label: t('review.writeReview'),
        onPress: openWriteReview,
      },
    ],
    [t, openWriteReview]
  );

  /**
   * Trigger review flow if user is eligible
   * Gets transaction count from React Query cache
   */
  const triggerReviewIfEligible = useCallback(async () => {
    try {
      // Get transaction count from cache
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cachedData = queryClient.getQueryData<any[]>(['islemler', isletme?.id, undefined]);
      const transactionCount = cachedData?.length ?? 0;

      console.log('[ReviewProvider] Checking eligibility, transaction count:', transactionCount);

      // Check if review is available on this device
      const isAvailable = await StoreReview.isAvailableAsync();
      if (!isAvailable) {
        console.log('[ReviewProvider] Store review not available on this device');
        return;
      }

      // Check eligibility
      const isEligible = await checkReviewEligibility(transactionCount);
      if (!isEligible) {
        return;
      }

      console.log('[ReviewProvider] User is eligible, showing review prompt');

      // Record that we're showing the prompt
      await recordReviewPromptShown();

      // Show native review prompt
      await StoreReview.requestReview();

      // Show thank you action sheet after a short delay
      // (We don't know if user actually rated, but we show thanks anyway)
      setTimeout(() => {
        setShowActionSheet(true);
      }, 1000);
    } catch (error) {
      console.error('[ReviewProvider] Error triggering review:', error);
    }
  }, [queryClient, isletme?.id]);

  return (
    <ReviewContext.Provider value={{ triggerReviewIfEligible }}>
      {children}
      <ActionSheet
        visible={showActionSheet}
        onClose={closeActionSheet}
        title={t('review.thankYouMessage')}
        options={actionSheetOptions}
        cancelLabel={t('review.done')}
      />
    </ReviewContext.Provider>
  );
}

/**
 * Hook to access review functionality
 */
export function useReview(): ReviewContextValue {
  const context = useContext(ReviewContext);
  if (!context) {
    throw new Error('useReview must be used within a ReviewProvider');
  }
  return context;
}
