/**
 * Review Tracking Storage
 * AsyncStorage operations for in-app review feature
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const REVIEW_TRACKING_KEY = '@app_review_tracking';

export interface ReviewTrackingData {
  /** First app launch date (ISO string) */
  firstLaunchDate: string;
  /** History of review prompts shown */
  promptHistory: {
    date: string;
  }[];
  /** Total number of prompts shown */
  totalPromptCount: number;
}

/**
 * Get review tracking data from storage
 */
export async function getReviewTrackingData(): Promise<ReviewTrackingData | null> {
  try {
    const data = await AsyncStorage.getItem(REVIEW_TRACKING_KEY);
    if (data) {
      return JSON.parse(data) as ReviewTrackingData;
    }
    return null;
  } catch (error) {
    console.error('[ReviewStorage] Error reading tracking data:', error);
    return null;
  }
}

/**
 * Save review tracking data to storage
 */
export async function saveReviewTrackingData(data: ReviewTrackingData): Promise<boolean> {
  try {
    await AsyncStorage.setItem(REVIEW_TRACKING_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('[ReviewStorage] Error saving tracking data:', error);
    return false;
  }
}

/**
 * Initialize tracking data if not exists
 * Called on app launch
 */
export async function initializeReviewTracking(): Promise<void> {
  try {
    const existing = await getReviewTrackingData();

    if (!existing) {
      const initialData: ReviewTrackingData = {
        firstLaunchDate: new Date().toISOString(),
        promptHistory: [],
        totalPromptCount: 0,
      };
      await saveReviewTrackingData(initialData);
      console.log('[ReviewStorage] Initialized tracking data');
    }
  } catch (error) {
    console.error('[ReviewStorage] Error initializing tracking:', error);
  }
}

/**
 * Record that a review prompt was shown
 */
export async function recordReviewPromptShown(): Promise<boolean> {
  try {
    const data = await getReviewTrackingData();

    if (!data) {
      console.error('[ReviewStorage] No tracking data found');
      return false;
    }

    const updatedData: ReviewTrackingData = {
      ...data,
      promptHistory: [
        ...data.promptHistory,
        { date: new Date().toISOString() },
      ],
      totalPromptCount: data.totalPromptCount + 1,
    };

    await saveReviewTrackingData(updatedData);
    console.log('[ReviewStorage] Recorded prompt shown, total:', updatedData.totalPromptCount);
    return true;
  } catch (error) {
    console.error('[ReviewStorage] Error recording prompt:', error);
    return false;
  }
}

/**
 * Check if user is eligible for review prompt
 * Conditions:
 * - At least 7 days since first launch
 * - At least 180 days since last prompt (if any)
 * - Total prompts < 2 (lifetime limit)
 */
export async function checkReviewEligibility(transactionCount: number): Promise<boolean> {
  try {
    const data = await getReviewTrackingData();

    if (!data) {
      console.log('[ReviewStorage] No tracking data, not eligible');
      return false;
    }

    const now = new Date();
    const firstLaunch = new Date(data.firstLaunchDate);

    // Check minimum usage time (7 days)
    const daysSinceFirstLaunch = Math.floor(
      (now.getTime() - firstLaunch.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceFirstLaunch < 7) {
      console.log('[ReviewStorage] Not enough days since first launch:', daysSinceFirstLaunch);
      return false;
    }

    // Check minimum transaction count (10)
    if (transactionCount < 10) {
      console.log('[ReviewStorage] Not enough transactions:', transactionCount);
      return false;
    }

    // Check lifetime limit (2)
    if (data.totalPromptCount >= 2) {
      console.log('[ReviewStorage] Lifetime limit reached:', data.totalPromptCount);
      return false;
    }

    // Check last prompt date (180 days)
    if (data.promptHistory.length > 0) {
      const lastPrompt = new Date(data.promptHistory[data.promptHistory.length - 1].date);
      const daysSinceLastPrompt = Math.floor(
        (now.getTime() - lastPrompt.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceLastPrompt < 180) {
        console.log('[ReviewStorage] Not enough days since last prompt:', daysSinceLastPrompt);
        return false;
      }
    }

    console.log('[ReviewStorage] User is eligible for review prompt');
    return true;
  } catch (error) {
    console.error('[ReviewStorage] Error checking eligibility:', error);
    return false;
  }
}
