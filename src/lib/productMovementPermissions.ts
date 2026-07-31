export type ProductMovementPermissionAction =
  | 'create'
  | 'update'
  | 'delete';

export type ProductMovementPermissionReason =
  | 'ownership'
  | 'permission'
  | 'tenant';

export interface ProductMovementPermissionSnapshot {
  isletmeId: string | null;
  userId: string | null;
  canCreate: boolean;
  canAccessCari: boolean;
  canCreateIslem: boolean;
  canUpdate: (createdBy: string | null) => boolean;
  canDelete: (createdBy: string | null) => boolean;
}

export interface ProductMovementPermissionRecord {
  isletme_id: string | null;
  created_by: string | null;
}

/**
 * Ürün hareketi istemci preflight'ının kararlı hata tipi.
 *
 * `code=42501`, üst katmanın bu reddi ağ/genel hatadan ayırmasını sağlar. Bu
 * istemci kontrolü savunma katmanıdır; sunucu RLS/RPC yetkilendirmesinin yerine
 * geçmez.
 */
export class ProductMovementPermissionError extends Error {
  readonly code = '42501';

  constructor(
    readonly action: ProductMovementPermissionAction,
    readonly reason: ProductMovementPermissionReason,
    message: string,
    readonly module: 'urunler' | 'cariler' | 'islemler' = 'urunler',
  ) {
    super(message);
    this.name = 'ProductMovementPermissionError';
  }
}

export function getProductCreateDenialReason(
  snapshot: ProductMovementPermissionSnapshot,
  expectedIsletmeId: string,
): ProductMovementPermissionReason | null {
  if (
    !snapshot.isletmeId
    || snapshot.isletmeId !== expectedIsletmeId
  ) {
    return 'tenant';
  }
  return snapshot.canCreate ? null : 'permission';
}

export function getProductMovementDenialReason(
  snapshot: ProductMovementPermissionSnapshot,
  expectedIsletmeId: string,
  action: Exclude<ProductMovementPermissionAction, 'create'>,
  record: ProductMovementPermissionRecord,
): ProductMovementPermissionReason | null {
  if (
    !snapshot.isletmeId
    || snapshot.isletmeId !== expectedIsletmeId
    || !record.isletme_id
    || record.isletme_id !== expectedIsletmeId
  ) {
    return 'tenant';
  }

  const check =
    action === 'delete'
      ? snapshot.canDelete
      : snapshot.canUpdate;
  if (check(record.created_by)) return null;

  const canMutateOwnRecord =
    !!snapshot.userId && check(snapshot.userId);
  if (
    canMutateOwnRecord
    && !!record.created_by
    && record.created_by !== snapshot.userId
  ) {
    return 'ownership';
  }
  return 'permission';
}
