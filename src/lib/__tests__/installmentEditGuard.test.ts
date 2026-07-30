import {
  canSubmitThroughInstallmentEditGuard,
  getInstallmentEditGuardReason,
} from '../installmentEditGuard';

describe('installment edit guard', () => {
  it('does not block create and scheduled-edit flows that do not require the check', () => {
    const reason = getInstallmentEditGuardReason({
      required: false,
      data: undefined,
      isSuccess: false,
      isFetching: false,
      isError: false,
    });

    expect(reason).toBe('not_required');
    expect(canSubmitThroughInstallmentEditGuard(reason)).toBe(true);
  });

  it.each([
    {
      name: 'initial loading',
      data: undefined,
      isSuccess: false,
      isFetching: true,
      isError: false,
      expected: 'checking',
    },
    {
      name: 'cached false while the server is being refreshed',
      data: false,
      isSuccess: true,
      isFetching: true,
      isError: false,
      expected: 'checking',
    },
    {
      name: 'query error even if old false data remains',
      data: false,
      isSuccess: false,
      isFetching: false,
      isError: true,
      expected: 'query_error',
    },
    {
      name: 'installment plan exists',
      data: true,
      isSuccess: true,
      isFetching: false,
      isError: false,
      expected: 'installment',
    },
  ] as const)('fails closed for $name', (snapshot) => {
    const reason = getInstallmentEditGuardReason({
      required: true,
      data: snapshot.data,
      isSuccess: snapshot.isSuccess,
      isFetching: snapshot.isFetching,
      isError: snapshot.isError,
    });

    expect(reason).toBe(snapshot.expected);
    expect(canSubmitThroughInstallmentEditGuard(reason)).toBe(false);
  });

  it('allows edit only after a successful fresh false result', () => {
    const reason = getInstallmentEditGuardReason({
      required: true,
      data: false,
      isSuccess: true,
      isFetching: false,
      isError: false,
    });

    expect(reason).toBe('allowed');
    expect(canSubmitThroughInstallmentEditGuard(reason)).toBe(true);
  });
});
