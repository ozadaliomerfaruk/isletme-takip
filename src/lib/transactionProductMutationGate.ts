import { supportsSharedProductMutationV3 } from '@/lib/sharedProductMutationTypes';
import {
  canAccessTransactionSources,
  type TransactionSourceModule,
} from '@/lib/transactionSourceModules';

export type TransactionProductMutationDenyReason =
  | 'items_unresolved'
  | 'source_denied'
  | 'transaction_denied'
  | 'product_module_denied'
  | 'product_action_denied'
  | 'shared_product_type_unsupported';

export interface TransactionProductMutationDecision {
  allowed: boolean;
  reason: TransactionProductMutationDenyReason | null;
  hasProductItems: boolean | null;
  useProductMutationV3: boolean;
}

interface TransactionProductMutationGateInput {
  type: unknown;
  productItemsResolved: boolean;
  productItemCount: number;
  isOwner: boolean;
  canAccessModule: (module: TransactionSourceModule) => boolean;
  canMutateTransaction: boolean;
  canMutateProduct: boolean;
}

interface EditableProductPayloadState {
  productItemsResolved: boolean;
  persistedProductItemCount: number;
  productEditDataResolved: boolean;
  editableProductItemCount: number;
}

/**
 * A resolved presence query is not enough for editing: every persisted raw
 * movement must also have a corresponding full editable row. Missing labels or
 * relation visibility must never turn a partial payload into an empty V2 edit.
 */
export function isEditableProductPayloadComplete({
  productItemsResolved,
  persistedProductItemCount,
  productEditDataResolved,
  editableProductItemCount,
}: EditableProductPayloadState): boolean {
  if (!productItemsResolved) return false;
  if (persistedProductItemCount <= 0) return true;
  return productEditDataResolved
    && editableProductItemCount === persistedProductItemCount;
}

/**
 * A single fail-closed decision for every transaction mutation entry point.
 *
 * Product presence must be known before a row may be treated as productless.
 * A productful shared mutation additionally requires both Product module write
 * scope and an atomic V3 transaction family. Read-only product inspection is
 * deliberately outside this gate.
 */
export function getTransactionProductMutationDecision({
  type,
  productItemsResolved,
  productItemCount,
  isOwner,
  canAccessModule,
  canMutateTransaction,
  canMutateProduct,
}: TransactionProductMutationGateInput): TransactionProductMutationDecision {
  if (!productItemsResolved) {
    return {
      allowed: false,
      reason: 'items_unresolved',
      hasProductItems: null,
      useProductMutationV3: false,
    };
  }

  const hasProductItems = productItemCount > 0;

  if (!canAccessTransactionSources([type], canAccessModule)) {
    return {
      allowed: false,
      reason: 'source_denied',
      hasProductItems,
      useProductMutationV3: false,
    };
  }

  if (!canMutateTransaction) {
    return {
      allowed: false,
      reason: 'transaction_denied',
      hasProductItems,
      useProductMutationV3: false,
    };
  }

  if (!hasProductItems) {
    return {
      allowed: true,
      reason: null,
      hasProductItems: false,
      useProductMutationV3: false,
    };
  }

  if (!canAccessModule('urunler')) {
    return {
      allowed: false,
      reason: 'product_module_denied',
      hasProductItems: true,
      useProductMutationV3: false,
    };
  }

  if (!canMutateProduct) {
    return {
      allowed: false,
      reason: 'product_action_denied',
      hasProductItems: true,
      useProductMutationV3: false,
    };
  }

  if (!isOwner && !supportsSharedProductMutationV3(type)) {
    return {
      allowed: false,
      reason: 'shared_product_type_unsupported',
      hasProductItems: true,
      useProductMutationV3: false,
    };
  }

  return {
    allowed: true,
    reason: null,
    hasProductItems: true,
    useProductMutationV3: !isOwner,
  };
}
