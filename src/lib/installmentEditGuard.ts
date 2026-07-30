export type InstallmentEditGuardReason =
  | 'not_required'
  | 'checking'
  | 'query_error'
  | 'installment'
  | 'allowed';

export interface InstallmentEditQuerySnapshot {
  required: boolean;
  data: boolean | undefined;
  isSuccess: boolean;
  isFetching: boolean;
  isError: boolean;
}

/**
 * Taksitli işlem düzenleme kapısı fail-closed çalışır:
 * eski `false` cache'i arka planda yenilenirken, sorgu hata verdiğinde veya henüz
 * sonuçlanmadığında düzenleme kaydı başlatılmaz.
 */
export function getInstallmentEditGuardReason({
  required,
  data,
  isSuccess,
  isFetching,
  isError,
}: InstallmentEditQuerySnapshot): InstallmentEditGuardReason {
  if (!required) return 'not_required';
  if (isError) return 'query_error';
  if (isFetching || !isSuccess) return 'checking';
  if (data === true) return 'installment';
  if (data === false) return 'allowed';
  return 'checking';
}

export function canSubmitThroughInstallmentEditGuard(
  reason: InstallmentEditGuardReason,
): boolean {
  return reason === 'not_required' || reason === 'allowed';
}
