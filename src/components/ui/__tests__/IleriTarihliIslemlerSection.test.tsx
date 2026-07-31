import { Alert, type AlertButton } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type {
  IleriTarihliIslemWithRelations,
  IslemType,
} from '@/types/database';
import { CrossCurrencyRateRequiredError } from '@/lib/crossCurrency';
import { IleriTarihliIslemlerSection } from '../IleriTarihliIslemlerSection';

const mockCompleteMutateAsync = jest.fn();
const mockDeleteMutateAsync = jest.fn();
const mockFormatCurrency = jest.fn(
  (amount: number | string, currency?: string) => `${currency ?? 'NONE'}:${amount}`,
);
const mockCanCreate = jest.fn((_module: string) => true);
const mockCanUpdate = jest.fn(
  (_module: string, _createdBy?: string | null) => true
);
const mockCanDelete = jest.fn(
  (_module: string, _createdBy?: string | null) => true
);
const mockCanSeeRecord = jest.fn((_createdBy: string | null) => true);
const mockCanAccessModule = jest.fn((_module: string) => true);
const mockCanCreateTransactionType = jest.fn(
  (_type: IslemType) => mockCanCreate('islemler'),
);

jest.mock('@/hooks/useIleriTarihliIslemler', () => ({
  useCompleteIleriTarihliIslem: () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const [isPending, setIsPending] = React.useState(false);

    return {
      isPending,
      mutateAsync: async (input: {
        id: string;
        exchangeRate?: number;
        expectedToken?: string | null;
      }) => {
        setIsPending(true);
        try {
          return await mockCompleteMutateAsync(input);
        } finally {
          setIsPending(false);
        }
      },
    };
  },
  useDeleteIleriTarihliIslem: () => ({
    isPending: false,
    mutateAsync: mockDeleteMutateAsync,
  }),
}));

jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    canAccessModule: (module: string) => mockCanAccessModule(module),
    canCreateTransactionType: (type: IslemType) =>
      mockCanCreateTransactionType(type),
    canCreate: (module: string) => mockCanCreate(module),
    canUpdate: (module: string, createdBy?: string | null) =>
      mockCanUpdate(module, createdBy),
    canDelete: (module: string, createdBy?: string | null) =>
      mockCanDelete(module, createdBy),
    canSeeRecord: (createdBy: string | null) =>
      mockCanSeeRecord(createdBy),
  }),
}));

jest.mock('../ExpandableCard', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');

  return {
    // İki kartın aksiyonlarını aynı anda gözlemleyebilmek için testte içerik hep açık.
    ExpandableCard: ({
      header,
      children,
    }: {
      header: React.ReactNode;
      children: React.ReactNode;
    }) => React.createElement(View, null, header, children),
  };
});

jest.mock('../Button', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const {
    Pressable,
    Text,
  } = jest.requireActual<typeof import('react-native')>('react-native');

  return {
    Button: ({
      children,
      loading = false,
      disabled = false,
      onPress,
    }: {
      children: React.ReactNode;
      loading?: boolean;
      disabled?: boolean;
      onPress?: () => void;
    }) => {
      const isDisabled = disabled || loading;
      return React.createElement(
        Pressable,
        {
          accessibilityRole: 'button',
          accessibilityLabel: typeof children === 'string' ? children : undefined,
          accessibilityState: {
            busy: loading,
            disabled: isDisabled,
          },
          disabled: isDisabled,
          onPress,
        },
        React.createElement(Text, null, children),
      );
    },
  };
});

jest.mock('../TransactionIcon', () => ({
  TransactionIcon: () => null,
}));

jest.mock('lucide-react-native', () => ({
  CalendarClock: () => null,
  Check: () => null,
  Pencil: () => null,
  Trash2: () => null,
}));

jest.mock('@/components/transaction/QuickTransactionBar/QuickTransactionBar', () => ({
  QuickTransactionBar: ({ visible }: { visible: boolean }) => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { View } = jest.requireActual<typeof import('react-native')>('react-native');

    return visible
      ? React.createElement(View, { testID: 'scheduled-edit-bar' })
      : null;
  },
}));

jest.mock('@/components/transaction/ExchangeRateBar', () => ({
  ExchangeRateBar: ({
    onConfirm,
  }: {
    onConfirm: (exchangeRate: number, targetAmount: number) => void;
  }) => {
    const React = jest.requireActual<typeof import('react')>('react');
    const {
      Pressable,
      Text,
    } = jest.requireActual<typeof import('react-native')>('react-native');

    return React.createElement(
      Pressable,
      {
        accessibilityRole: 'button',
        accessibilityLabel: 'confirm-rate',
        onPress: () => onConfirm(32.5, 0),
      },
      React.createElement(Text, null, 'confirm-rate'),
    );
  },
}));

jest.mock('@/lib/currency', () => ({
  formatCurrency: (amount: number | string, currency?: string) =>
    mockFormatCurrency(amount, currency),
}));

function scheduledItem(
  id: string,
  type: IslemType = 'gider'
): IleriTarihliIslemWithRelations {
  return {
    id,
    isletme_id: 'isletme-1',
    type,
    amount: 100,
    description: id,
    scheduled_date: '2026-07-28',
    hesap_id: null,
    hedef_hesap_id: null,
    kategori_id: null,
    cari_id: null,
    personel_id: null,
    status: 'pending',
    notified_at: null,
    created_by: 'user-1',
    updated_by: 'user-1',
    created_at: '2026-07-28T10:00:00.000Z',
    updated_at: '2026-07-28T10:00:00.000Z',
  };
}

describe('IleriTarihliIslemlerSection completion kilidi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanCreate.mockReturnValue(true);
    mockCanUpdate.mockReturnValue(true);
    mockCanDelete.mockReturnValue(true);
    mockCanSeeRecord.mockReturnValue(true);
    mockCanAccessModule.mockReturnValue(true);
    mockCanCreateTransactionType.mockImplementation(
      (_type: IslemType) => mockCanCreate('islemler'),
    );
  });

  it('yalnız çalışan kartı busy gösterir, diğerini kilitler ve çift callback tek mutation başlatır', async () => {
    let resolveCompletion: ((value: unknown) => void) | undefined;
    let completionPromise: Promise<unknown> | undefined;
    mockCompleteMutateAsync.mockImplementation(() => {
      completionPromise = new Promise((resolve) => {
        resolveCompletion = resolve;
      });
      return completionPromise;
    });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    render(
      <IleriTarihliIslemlerSection
        ileriTarihliIslemler={[scheduledItem('scheduled-a'), scheduledItem('scheduled-b')]}
        isLoading={false}
      />,
    );

    const executeButtons = screen.getAllByRole('button', {
      name: 'transactions:scheduled.executed',
    });
    fireEvent.press(executeButtons[0]);

    const confirmationButtons = alertSpy.mock.calls[0]?.[2] as AlertButton[] | undefined;
    const confirm = confirmationButtons?.find(
      (button) => button.text === 'transactions:scheduled.execute',
    );
    expect(confirm?.onPress).toBeDefined();

    await act(async () => {
      confirm?.onPress?.();
      confirm?.onPress?.();
      await Promise.resolve();
    });

    expect(mockCompleteMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockCompleteMutateAsync).toHaveBeenCalledWith({
      id: 'scheduled-a',
      exchangeRate: undefined,
      expectedToken: undefined,
    });

    const pendingButtons = screen.getAllByRole('button', {
      name: 'transactions:scheduled.executed',
    });
    expect(pendingButtons[0].props.accessibilityState).toEqual({
      busy: true,
      disabled: true,
    });
    expect(pendingButtons[1].props.accessibilityState).toEqual({
      busy: false,
      disabled: true,
    });
    expect(pendingButtons[1]).toBeDisabled();

    await act(async () => {
      resolveCompletion?.({ id: 'scheduled-a' });
      await completionPromise;
    });

    const settledButtons = screen.getAllByRole('button', {
      name: 'transactions:scheduled.executed',
    });
    expect(settledButtons[0].props.accessibilityState).toEqual({
      busy: false,
      disabled: false,
    });
    expect(settledButtons[1].props.accessibilityState).toEqual({
      busy: false,
      disabled: false,
    });
  });

  it('kur retryında server snapshot tokenını geri yollar', async () => {
    const token = '0123456789abcdef0123456789abcdef';
    mockCompleteMutateAsync
      .mockRejectedValueOnce(
        new CrossCurrencyRateRequiredError('TRY', 'USD', 100, token),
      )
      .mockResolvedValueOnce({ id: 'scheduled-a' });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    render(
      <IleriTarihliIslemlerSection
        ileriTarihliIslemler={[scheduledItem('scheduled-a')]}
        isLoading={false}
      />,
    );

    fireEvent.press(
      screen.getByRole('button', {
        name: 'transactions:scheduled.executed',
      }),
    );
    const confirmationButtons = alertSpy.mock.calls[0]?.[2] as AlertButton[] | undefined;

    await act(async () => {
      confirmationButtons
        ?.find((button) => button.text === 'transactions:scheduled.execute')
        ?.onPress?.();
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'confirm-rate' }));
      await Promise.resolve();
    });

    expect(mockCompleteMutateAsync).toHaveBeenNthCalledWith(2, {
      id: 'scheduled-a',
      exchangeRate: 32.5,
      expectedToken: token,
    });
  });

  it('readOnly modunda tamamlama, duzenleme ve silme aksiyonlarini gostermez', () => {
    render(
      <IleriTarihliIslemlerSection
        ileriTarihliIslemler={[scheduledItem('scheduled-a')]}
        isLoading={false}
        readOnly
      />,
    );

    expect(
      screen.queryByRole('button', {
        name: 'transactions:scheduled.executed',
      }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: 'common:buttons.edit',
      }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: 'common:buttons.delete',
      }),
    ).toBeNull();
    expect(mockCanCreate).not.toHaveBeenCalled();
    expect(mockCanUpdate).not.toHaveBeenCalled();
    expect(mockCanDelete).not.toHaveBeenCalled();
  });

  it('readOnly gecisinde acik editor stateini temizler', () => {
    const item = scheduledItem('scheduled-a');
    const { rerender } = render(
      <IleriTarihliIslemlerSection
        ileriTarihliIslemler={[item]}
        isLoading={false}
      />,
    );

    fireEvent.press(
      screen.getByRole('button', {
        name: 'common:buttons.edit',
      }),
    );
    expect(screen.getByTestId('scheduled-edit-bar')).toBeTruthy();

    rerender(
      <IleriTarihliIslemlerSection
        ileriTarihliIslemler={[item]}
        isLoading={false}
        readOnly
      />,
    );
    expect(screen.queryByTestId('scheduled-edit-bar')).toBeNull();

    rerender(
      <IleriTarihliIslemlerSection
        ileriTarihliIslemler={[item]}
        isLoading={false}
      />,
    );
    expect(screen.queryByTestId('scheduled-edit-bar')).toBeNull();
  });

  it('readOnly gecisinde acik kur paneli stateini temizler', async () => {
    const token = '0123456789abcdef0123456789abcdef';
    mockCompleteMutateAsync.mockRejectedValueOnce(
      new CrossCurrencyRateRequiredError('TRY', 'USD', 100, token),
    );
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const item = scheduledItem('scheduled-a');
    const { rerender } = render(
      <IleriTarihliIslemlerSection
        ileriTarihliIslemler={[item]}
        isLoading={false}
      />,
    );

    fireEvent.press(
      screen.getByRole('button', {
        name: 'transactions:scheduled.executed',
      }),
    );
    const confirmationButtons = alertSpy.mock.calls[0]?.[2] as AlertButton[] | undefined;

    await act(async () => {
      confirmationButtons
        ?.find((button) => button.text === 'transactions:scheduled.execute')
        ?.onPress?.();
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'confirm-rate' })).toBeTruthy();

    rerender(
      <IleriTarihliIslemlerSection
        ileriTarihliIslemler={[item]}
        isLoading={false}
        readOnly
      />,
    );
    expect(screen.queryByRole('button', { name: 'confirm-rate' })).toBeNull();

    rerender(
      <IleriTarihliIslemlerSection
        ileriTarihliIslemler={[item]}
        isLoading={false}
      />,
    );
    expect(screen.queryByRole('button', { name: 'confirm-rate' })).toBeNull();
    expect(mockCompleteMutateAsync).toHaveBeenCalledTimes(1);
  });

  it('izin dustukten sonra eski Alert callbackleri tamamlamaz veya silmez', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const item = scheduledItem('scheduled-a');
    const view = render(
      <IleriTarihliIslemlerSection
        ileriTarihliIslemler={[item]}
        isLoading={false}
      />,
    );

    fireEvent.press(
      screen.getByRole('button', {
        name: 'transactions:scheduled.executed',
      }),
    );
    const executeButtons = alertSpy.mock.calls[0]?.[2] as AlertButton[] | undefined;

    alertSpy.mockClear();
    fireEvent.press(
      screen.getByRole('button', {
        name: 'common:buttons.delete',
      }),
    );
    const deleteButtons = alertSpy.mock.calls[0]?.[2] as AlertButton[] | undefined;

    view.rerender(
      <IleriTarihliIslemlerSection
        ileriTarihliIslemler={[item]}
        isLoading={false}
        readOnly
      />,
    );

    await act(async () => {
      executeButtons
        ?.find((button) => button.text === 'transactions:scheduled.execute')
        ?.onPress?.();
      await deleteButtons
        ?.find((button) => button.text === 'common:buttons.delete')
        ?.onPress?.();
      await Promise.resolve();
    });

    expect(mockCompleteMutateAsync).not.toHaveBeenCalled();
    expect(mockDeleteMutateAsync).not.toHaveBeenCalled();
  });

  it.each([
    {
      type: 'cari_tahsilat' as IslemType,
      sourceModules: ['cariler'],
    },
    {
      type: 'gelir' as IslemType,
      sourceModules: ['hesaplar'],
    },
    {
      type: 'gider' as IslemType,
      sourceModules: ['hesaplar'],
    },
    {
      type: 'transfer' as IslemType,
      sourceModules: ['hesaplar'],
    },
    {
      type: 'personel_odeme' as IslemType,
      sourceModules: ['personel'],
    },
    {
      type: 'personel_tahsilat' as IslemType,
      sourceModules: ['personel'],
    },
  ])(
    '$type tamamlama butonu server ile aynı kaynak modül ve create kapılarını ister',
    ({ type, sourceModules }) => {
      render(
        <IleriTarihliIslemlerSection
          ileriTarihliIslemler={[scheduledItem('scheduled-a', type)]}
          isLoading={false}
        />,
      );

      expect(
        screen.getByRole('button', {
          name: 'transactions:scheduled.executed',
        }),
      ).toBeEnabled();
      expect(mockCanAccessModule.mock.calls.map(([module]) => module)).toEqual(
        sourceModules,
      );
      expect(mockCanCreate).toHaveBeenCalledWith('islemler');
      expect(mockCanCreateTransactionType).toHaveBeenCalledWith(type);
      expect(mockCanSeeRecord).toHaveBeenCalledWith('user-1');
    },
  );

  it.each([
    {
      type: 'cari_tahsilat' as IslemType,
      deniedModule: 'cariler',
    },
    {
      type: 'gider' as IslemType,
      deniedModule: 'hesaplar',
    },
    {
      type: 'personel_odeme' as IslemType,
      deniedModule: 'personel',
    },
  ])(
    '$type için $deniedModule kaynak erişimi yoksa tamamlama butonunu göstermez',
    ({ type, deniedModule }) => {
      mockCanAccessModule.mockImplementation(
        (module: string) => module !== deniedModule,
      );

      render(
        <IleriTarihliIslemlerSection
          ileriTarihliIslemler={[scheduledItem('scheduled-a', type)]}
          isLoading={false}
        />,
      );

      expect(
        screen.queryByRole('button', {
          name: 'transactions:scheduled.executed',
        }),
      ).toBeNull();
    },
  );

  it('kayıt görünürlüğü yoksa diğer yetkiler açık olsa da tamamlama butonunu göstermez', () => {
    mockCanSeeRecord.mockReturnValue(false);

    render(
      <IleriTarihliIslemlerSection
        ileriTarihliIslemler={[
          scheduledItem('scheduled-a', 'cari_tahsilat'),
        ]}
        isLoading={false}
      />,
    );

    expect(
      screen.queryByRole('button', {
        name: 'transactions:scheduled.executed',
      }),
    ).toBeNull();
    expect(mockCanCreate).not.toHaveBeenCalled();
  });

  it('cari tahsilat tutarını cari değil kaynak hesap para birimiyle gösterir', () => {
    const item: IleriTarihliIslemWithRelations = {
      ...scheduledItem('scheduled-a'),
      type: 'cari_tahsilat',
      hesap_id: 'hesap-1',
      cari_id: 'cari-1',
      hesap: {
        id: 'hesap-1',
        name: 'Kasa',
        currency: 'TRY',
      } as IleriTarihliIslemWithRelations['hesap'],
      cari: {
        id: 'cari-1',
        name: 'USD Cari',
        currency: 'USD',
      } as IleriTarihliIslemWithRelations['cari'],
    };

    render(
      <IleriTarihliIslemlerSection
        ileriTarihliIslemler={[item]}
        isLoading={false}
      />,
    );

    expect(mockFormatCurrency).toHaveBeenCalledWith(100, 'TRY');
    expect(mockFormatCurrency).not.toHaveBeenCalledWith(100, 'USD');
  });
});
