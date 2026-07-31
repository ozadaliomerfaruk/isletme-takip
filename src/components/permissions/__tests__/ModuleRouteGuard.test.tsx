import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import {
  ModuleRouteGuard,
  OwnerRouteGuard,
} from '../ModuleRouteGuard';

const mockUseAuthContext = jest.fn();
const mockCanAccessModule = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => mockUseAuthContext(),
}));

jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    canAccessModule: mockCanAccessModule,
  }),
}));

jest.mock('expo-router', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return {
    Redirect: ({ href }: { href: string }) => (
      <MockText testID="redirect">{href}</MockText>
    ),
    Slot: () => <MockText testID="slot">slot</MockText>,
  };
});

function SecretQueryScreen() {
  return <Text testID="secret-query-screen">yasak sorgu ekrani</Text>;
}

describe('ModuleRouteGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuthContext.mockReturnValue({
      initialized: true,
      loading: false,
      isletmeLoading: false,
      isOwner: false,
    });
  });

  it('yasak modülde çocuk ekranı mount etmeden güvenli routea yönlendirir', () => {
    mockCanAccessModule.mockReturnValue(false);

    render(
      <ModuleRouteGuard module="raporlar">
        <SecretQueryScreen />
      </ModuleRouteGuard>,
    );

    expect(screen.queryByTestId('secret-query-screen')).toBeNull();
    expect(screen.getByTestId('redirect')).toHaveTextContent('/(tabs)');
  });

  it('izinli modülde çocuk ekranı render eder', () => {
    mockCanAccessModule.mockReturnValue(true);

    render(
      <ModuleRouteGuard module="cariler">
        <SecretQueryScreen />
      </ModuleRouteGuard>,
    );

    expect(screen.getByTestId('secret-query-screen')).toBeTruthy();
    expect(screen.queryByTestId('redirect')).toBeNull();
  });

  it('yetki yüklenirken ne çocuğu ne yönlendirmeyi render eder', () => {
    mockUseAuthContext.mockReturnValue({
      initialized: false,
      loading: true,
      isletmeLoading: true,
      isOwner: false,
    });
    mockCanAccessModule.mockReturnValue(false);

    render(
      <ModuleRouteGuard module="hesaplar">
        <SecretQueryScreen />
      </ModuleRouteGuard>,
    );

    expect(screen.queryByTestId('secret-query-screen')).toBeNull();
    expect(screen.queryByTestId('redirect')).toBeNull();
  });

  it('owner tüm modülleri açabilir', () => {
    mockUseAuthContext.mockReturnValue({
      initialized: true,
      loading: false,
      isletmeLoading: false,
      isOwner: true,
    });
    mockCanAccessModule.mockReturnValue(false);

    render(
      <ModuleRouteGuard module="raporlar">
        <SecretQueryScreen />
      </ModuleRouteGuard>,
    );

    expect(screen.getByTestId('secret-query-screen')).toBeTruthy();
  });
});

describe('OwnerRouteGuard', () => {
  it('shared kullanıcıda owner-only çocuğu mount etmez', () => {
    mockUseAuthContext.mockReturnValue({
      initialized: true,
      loading: false,
      isletmeLoading: false,
      isOwner: false,
    });

    render(
      <OwnerRouteGuard>
        <SecretQueryScreen />
      </OwnerRouteGuard>,
    );

    expect(screen.queryByTestId('secret-query-screen')).toBeNull();
    expect(screen.getByTestId('redirect')).toBeTruthy();
  });
});
