import { act, render, screen } from '@testing-library/react-native';

import { ExchangeRateBar } from '../ExchangeRateBar';

jest.mock('@/components/ui', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');

  return {
    Text,
    Modal: ({
      children,
      onRequestClose,
    }: {
      children: React.ReactNode;
      onRequestClose?: () => void;
    }) =>
      React.createElement(
        View,
        {
          testID: 'native-modal-shell',
          onAccessibilityEscape: onRequestClose,
        },
        children,
      ),
  };
});

jest.mock('@/hooks/useExchangeRates', () => ({
  useExchangeRates: () => ({
    data: {
      rates: {
        USD: 40,
      },
    },
  }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
  },
  NotificationFeedbackType: {
    Error: 'error',
  },
}));

jest.mock('lucide-react-native', () => ({
  X: () => null,
  ArrowRight: () => null,
  RefreshCw: () => null,
}));

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual<
    typeof import('react-native-safe-area-context')
  >('react-native-safe-area-context');

  return {
    ...actual,
    useSafeAreaInsets: () => ({
      top: 47,
      right: 0,
      bottom: 34,
      left: 0,
    }),
  };
});

const defaultProps = {
  visible: true,
  sourceAmount: 100,
  sourceCurrency: 'USD' as const,
  targetCurrency: 'TRY' as const,
  onDismiss: jest.fn(),
  onConfirm: jest.fn(),
};

describe('ExchangeRateBar presentation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('bağımsız kullanımda native modal sarmalayıcıyı korur', () => {
    render(<ExchangeRateBar {...defaultProps} />);

    expect(screen.getByTestId('native-modal-shell')).toBeTruthy();
    expect(screen.getByTestId('exchange-rate-overlay')).toBeTruthy();
  });

  it('inline kullanımda ikinci native modal oluşturmadan erişilebilir overlay gösterir', () => {
    render(<ExchangeRateBar {...defaultProps} presentation="inline" />);

    expect(screen.queryByTestId('native-modal-shell')).toBeNull();
    expect(screen.getByTestId('exchange-rate-overlay').props).toMatchObject({
      accessibilityViewIsModal: true,
      importantForAccessibility: 'yes',
    });
  });
});
