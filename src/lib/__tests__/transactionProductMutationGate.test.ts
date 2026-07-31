import {
  getTransactionProductMutationDecision,
  isEditableProductPayloadComplete,
} from '../transactionProductMutationGate';
import type { TransactionSourceModule } from '../transactionSourceModules';

function accessTo(...modules: TransactionSourceModule[]) {
  const allowed = new Set(modules);
  return (module: TransactionSourceModule) => allowed.has(module);
}

describe('transaction product mutation gate', () => {
  const base = {
    type: 'cari_alis',
    productItemsResolved: true,
    productItemCount: 0,
    isOwner: false,
    canAccessModule: accessTo('cariler'),
    canMutateTransaction: true,
    canMutateProduct: false,
  };

  it('fails closed while exact product presence is unresolved', () => {
    expect(getTransactionProductMutationDecision({
      ...base,
      productItemsResolved: false,
    })).toEqual({
      allowed: false,
      reason: 'items_unresolved',
      hasProductItems: null,
      useProductMutationV3: false,
    });
  });

  it('allows a settled productless mutation without Product module access', () => {
    expect(getTransactionProductMutationDecision(base)).toMatchObject({
      allowed: true,
      hasProductItems: false,
      useProductMutationV3: false,
    });
  });

  it('requires both Product module visibility and matching Product write scope', () => {
    expect(getTransactionProductMutationDecision({
      ...base,
      productItemCount: 1,
    })).toMatchObject({
      allowed: false,
      reason: 'product_module_denied',
    });

    expect(getTransactionProductMutationDecision({
      ...base,
      productItemCount: 1,
      canAccessModule: accessTo('cariler', 'urunler'),
    })).toMatchObject({
      allowed: false,
      reason: 'product_action_denied',
    });
  });

  it('routes a supported shared product mutation only through V3', () => {
    expect(getTransactionProductMutationDecision({
      ...base,
      productItemCount: 2,
      canAccessModule: accessTo('cariler', 'urunler'),
      canMutateProduct: true,
    })).toMatchObject({
      allowed: true,
      hasProductItems: true,
      useProductMutationV3: true,
    });
  });

  it('never lets shared personel_satis fall through to the normal mutation path', () => {
    expect(getTransactionProductMutationDecision({
      ...base,
      type: 'personel_satis',
      productItemCount: 1,
      canAccessModule: accessTo('personel', 'urunler'),
      canMutateProduct: true,
    })).toMatchObject({
      allowed: false,
      reason: 'shared_product_type_unsupported',
      useProductMutationV3: false,
    });
  });

  it('keeps owner product writes on the existing owner path', () => {
    expect(getTransactionProductMutationDecision({
      ...base,
      productItemCount: 1,
      isOwner: true,
      canAccessModule: accessTo('cariler', 'urunler'),
      canMutateProduct: true,
    })).toMatchObject({
      allowed: true,
      useProductMutationV3: false,
    });
  });

  it('also fails closed for unknown sources and denied transaction scope', () => {
    expect(getTransactionProductMutationDecision({
      ...base,
      type: 'future_unknown_type',
    }).reason).toBe('source_denied');
    expect(getTransactionProductMutationDecision({
      ...base,
      canMutateTransaction: false,
    }).reason).toBe('transaction_denied');
  });

  it('rejects a partial editable payload even when raw presence is settled', () => {
    expect(isEditableProductPayloadComplete({
      productItemsResolved: true,
      persistedProductItemCount: 2,
      productEditDataResolved: true,
      editableProductItemCount: 1,
    })).toBe(false);
    expect(isEditableProductPayloadComplete({
      productItemsResolved: true,
      persistedProductItemCount: 2,
      productEditDataResolved: true,
      editableProductItemCount: 2,
    })).toBe(true);
    expect(isEditableProductPayloadComplete({
      productItemsResolved: true,
      persistedProductItemCount: 0,
      productEditDataResolved: false,
      editableProductItemCount: 0,
    })).toBe(true);
  });
});
