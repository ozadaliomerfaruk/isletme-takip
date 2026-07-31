import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../../..');

function source(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('final client permission audit fixes', () => {
  it('publishes exact batch readiness and applies the common item-aware gate', () => {
    const hook = source('src/hooks/useUrunHareketler.ts');
    expect(hook).toContain('const isProductItemsResolved =');
    expect(hook).toContain('!result.isPlaceholderData');
    expect(hook).toContain('!result.isRefetchError');

    for (const file of [
      'src/app/hesaplar/[id].tsx',
      'src/app/cariler/[id].tsx',
      'src/app/personel/[id].tsx',
      'src/app/islemler/index.tsx',
      'src/app/raporlar/hesap/[id].tsx',
      'src/components/reports/EntityTransactionList.tsx',
    ]) {
      const screen = source(file);
      expect(screen).toContain('getTransactionProductMutationDecision');
      expect(screen).toContain('isProductItemsResolved');
    }
  });

  it('keeps read-only product item inspection available without Product module access', () => {
    const modal = source('src/components/transaction/ProductDetailModal.tsx');
    expect(modal).toContain('useUrunKalemlerByIslemIds(');
    expect(modal).toContain('islemId && !canSeeUrunler ? [islemId] : []');
    expect(modal).toContain('summaryItems.map(');
  });

  it('prevents QTB edit transport from treating unresolved persisted items as productless', () => {
    const bar = source(
      'src/components/transaction/QuickTransactionBar/QuickTransactionBar.tsx',
    );
    const submit = source(
      'src/components/transaction/QuickTransactionBar/hooks/useTransactionSubmit.ts',
    );
    expect(bar).toContain('productItemsResolved: isProductItemsResolved');
    expect(bar).toContain('persistedProductItemCount');
    expect(bar).toContain('productEditDataResolved: form.productEditDataResolved');
    expect(bar).toContain(
      'editTransactionCreatedBy: form.editTransactionCreatedBy',
    );
    expect(submit).toContain('const guardRegularProductEdit = useCallback');
    expect(submit).toContain('isEditableProductPayloadComplete({');
    expect(submit).toContain('getTransactionProductMutationDecision({');
    expect(submit).toContain(
      "canUpdate('islemler', editTransactionCreatedBy ?? null)",
    );
    expect(submit).toContain(
      "canUpdate('urunler', editTransactionCreatedBy ?? null)",
    );
    expect(submit).toContain(
      'const creatorResolved = editTransactionCreatedBy !== undefined',
    );
    expect(submit).toContain(
      'persistedProductItemCount > 0 || urunItems.length > 0',
    );
    expect(submit).not.toContain(
      '&& (hadOriginalUrunHareketler || urunItems.length > 0)',
    );

    const mutationHook = source('src/hooks/useIslemler.ts');
    expect(mutationHook).toContain(
      'requiredActionModules: readonly TransactionSourceModule[] = []',
    );
    expect(mutationHook).toContain(
      '(module) => snapshot.canModify(module, createdBy)',
    );
    expect(mutationHook).toMatch(
      /productItems !== undefined \? \['urunler'\] : \[\],[\s\S]{0,100}productItems !== undefined \? \['urunler'\] : \[\]/,
    );
    expect(mutationHook).toMatch(
      /useCariProductV3 \? \['urunler'\] : \[\],[\s\S]{0,100}useCariProductV3 \? \['urunler'\] : \[\]/,
    );
  });

  it('counts raw movement presence independently from a missing product label', () => {
    const hook = source('src/hooks/useUrunHareketler.ts');
    expect(hook).toContain(
      'counts.set(islemId, (counts.get(islemId) ?? 0) + 1)',
    );
    expect(hook).toContain("ad: ad || '-'");
    expect(hook).toContain('getProductItemCount');
  });

  it('gives report editors the same scoped minimal account context as detail pages', () => {
    const cari = source('src/components/reports/tabs/CariTabContent.tsx');
    expect(cari).toContain('createScope="cari"');
    expect(cari).toContain(
      "!canAccessModule('hesaplar') ? 'cari' : undefined",
    );

    const personel = source('src/components/reports/tabs/PersonelTabContent.tsx');
    expect(personel).toContain('createScope="personel"');
    expect(personel).toContain(
      "!canAccessModule('hesaplar') ? 'personel' : undefined",
    );
  });

  it('limits category management and note assignment to the intended actors', () => {
    const category = source('src/components/ui/CategoryPicker.tsx');
    expect(category).toContain('const { canManageCategories } = usePermissions()');
    expect(category).toContain('{canManageCategories && (');
    expect(category).not.toContain("canCreateCategory('kategoriler')");

    const notes = source('src/components/notes/NoteInputModal.tsx');
    expect(notes).toContain("user.status === 'active'");
    expect(notes).toContain('activeIsletmeUsers.map');
    expect(notes).toContain('activeIsletmeUsers.length <= 1');
  });

  it('shows contextual notes on archived active records without reopening finance FABs', () => {
    for (const [file, entity] of [
      ['src/app/hesaplar/[id].tsx', 'hesap'],
      ['src/app/cariler/[id].tsx', 'cari'],
      ['src/app/personel/[id].tsx', 'personel'],
      ['src/app/urunler/[id].tsx', 'urun'],
    ] as const) {
      const detail = source(file);
      expect(detail).toContain(`${entity}.is_active !== false`);
      expect(detail).toContain('<AddNoteButton');
    }

    expect(source('src/app/hesaplar/[id].tsx')).toContain(
      '!hesap.is_archived && canCreateAccountTransactions',
    );
    expect(source('src/app/cariler/[id].tsx')).toContain(
      '!cari.is_archived && canCreateCariTransactions',
    );
    expect(source('src/app/personel/[id].tsx')).toContain(
      '!personel.is_archived && canCreatePersonelTransactions',
    );
  });

  it('separates product list cache by archive and current module scope', () => {
    const hook = source('src/hooks/useUrunler.ts');
    const keys = source('src/lib/queryKeys.ts');

    expect(keys).toContain(
      'list: (isletmeId: string, includeArchived?: boolean)',
    );
    expect(hook).toContain(
      "queryKeys.urunler.list(isletme?.id || '', includeArchived)",
    );
    expect(hook).toContain("'module-scope'");
    expect(hook).toContain(
      'data: enabled && canSeeUrunler ? result.data ?? [] : []',
    );
  });
});
