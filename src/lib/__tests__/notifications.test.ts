/**
 * Notifications utility tests - Bug #14
 */

import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { scheduleTransactionReminder } from '../notifications';

describe('Bug #14: scheduleTransactionReminder - past date check', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  });

  it('should reject a date clearly in the past', async () => {
    const pastDate = new Date(Date.now() - 60000); // 1 minute ago
    const result = await scheduleTransactionReminder(
      'tx-1', 'Title', 'Body', pastDate,
      { type: 'test', transaction_id: 'tx-1' }
    );
    expect(result).toBeNull();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('should accept a date in the near future', async () => {
    const futureDate = new Date(Date.now() + 60000); // 1 minute from now
    const result = await scheduleTransactionReminder(
      'tx-2', 'Title', 'Body', futureDate,
      { type: 'test', transaction_id: 'tx-2' }
    );
    expect(result).toBe('mock-notification-id');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
  });

  it('should reject a date far in the past', async () => {
    const oldDate = new Date(2020, 0, 1);
    const result = await scheduleTransactionReminder(
      'tx-3', 'Title', 'Body', oldDate,
      { type: 'test', transaction_id: 'tx-3' }
    );
    expect(result).toBeNull();
  });
});
