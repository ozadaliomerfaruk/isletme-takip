import fs from 'fs';
import path from 'path';
import {
  ProductMovementPermissionError,
  getProductCreateDenialReason,
  getProductMovementDenialReason,
  type ProductMovementPermissionSnapshot,
} from '../productMovementPermissions';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

const ownOnly: ProductMovementPermissionSnapshot = {
  isletmeId: 'business-a',
  userId: 'viewer',
  canCreate: true,
  canAccessCari: true,
  canCreateIslem: true,
  canUpdate: (createdBy) => createdBy === 'viewer',
  canDelete: (createdBy) => createdBy === 'viewer',
};

describe('ürün hareketi mutation izin kapıları', () => {
  it('create iznini ve mutation sırasında değişen tenantı fail-closed değerlendirir', () => {
    expect(getProductCreateDenialReason(ownOnly, 'business-a')).toBeNull();
    expect(
      getProductCreateDenialReason(
        { ...ownOnly, canCreate: false },
        'business-a',
      ),
    ).toBe('permission');
    expect(getProductCreateDenialReason(ownOnly, 'business-b')).toBe('tenant');
  });

  it('edit_own hareketin güncel created_by değerini kullanır', () => {
    expect(
      getProductMovementDenialReason(
        ownOnly,
        'business-a',
        'update',
        { isletme_id: 'business-a', created_by: 'viewer' },
      ),
    ).toBeNull();
    expect(
      getProductMovementDenialReason(
        ownOnly,
        'business-a',
        'update',
        { isletme_id: 'business-a', created_by: 'other' },
      ),
    ).toBe('ownership');
  });

  it('eksik creator ve tenant sapmasını fail-closed tutar', () => {
    expect(
      getProductMovementDenialReason(
        ownOnly,
        'business-a',
        'delete',
        { isletme_id: 'business-a', created_by: null },
      ),
    ).toBe('permission');
    expect(
      getProductMovementDenialReason(
        ownOnly,
        'business-a',
        'delete',
        { isletme_id: 'business-b', created_by: 'viewer' },
      ),
    ).toBe('tenant');
  });

  it('edit_all/owner benzeri kapı güncel hareketi geçirir', () => {
    const full: ProductMovementPermissionSnapshot = {
      ...ownOnly,
      canUpdate: () => true,
      canDelete: () => true,
    };
    expect(
      getProductMovementDenialReason(
        full,
        'business-a',
        'update',
        { isletme_id: 'business-a', created_by: null },
      ),
    ).toBeNull();
  });

  it('typed hata kararlı 42501 kodunu ve nedeni korur', () => {
    const error = new ProductMovementPermissionError(
      'update',
      'ownership',
      'denied',
    );
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('42501');
    expect(error.module).toBe('urunler');
    expect(error.action).toBe('update');
    expect(error.reason).toBe('ownership');
  });

  it('tüm ürün write hookları mutationFn içinde güncel ref kapısını çağırır', () => {
    const hook = read('src/hooks/useUrunHareketler.ts');
    const directCreateHooks = [
      'useCreateUrunHareket',
      'useSetUrunMiktarHedef',
    ];
    for (const hookName of directCreateHooks) {
      const start = hook.indexOf(`export function ${hookName}()`);
      expect(start).toBeGreaterThanOrEqual(0);
      const nextExport = hook.indexOf('\nexport function ', start + 1);
      const body = hook.slice(start, nextExport < 0 ? undefined : nextExport);
      expect(body).toContain('useLatestProductMovementPermissions()');
      expect(body).toContain('assertProductCreatePermission(');
    }

    const cariLinkedCreateHooks = [
      'useCreateUrunHareketWithCari',
      'useCreateBulkUrunHareketWithCari',
    ];
    for (const hookName of cariLinkedCreateHooks) {
      const start = hook.indexOf(`export function ${hookName}()`);
      expect(start).toBeGreaterThanOrEqual(0);
      const nextExport = hook.indexOf('\nexport function ', start + 1);
      const body = hook.slice(start, nextExport < 0 ? undefined : nextExport);
      expect(body).toContain('useLatestProductMovementPermissions()');
      expect(body).toContain('assertCariLinkedCreatePermission(');
    }
    expect(hook).toContain("canAccessCari: canAccessModule('cariler')");
    expect(hook).toContain("canCreateIslem: canCreate('islemler')");

    for (const [hookName, assertion] of [
      ['useUpdateUrunHareket', "'update'"],
      ['useDeleteUrunHareket', "'delete'"],
    ] as const) {
      const start = hook.indexOf(`export function ${hookName}()`);
      expect(start).toBeGreaterThanOrEqual(0);
      const nextExport = hook.indexOf('\nexport function ', start + 1);
      const body = hook.slice(start, nextExport < 0 ? undefined : nextExport);
      expect(body).toContain('useLatestProductMovementPermissions()');
      expect(body).toContain('assertProductMovementPermission(');
      expect(body).toContain(assertion);
    }

    // Reapply/reverse parent işlem yazımından sonra çalıştığı için burada yeni
    // bir client deny eklemek partial-state üretir; atomik server-v2'ye bırakılır.
    for (const hookName of [
      'useReapplyUrunHareketlerForIslem',
      'useReverseAndDeleteUrunHareketlerForIslem',
    ]) {
      const start = hook.indexOf(`export function ${hookName}()`);
      const nextExport = hook.indexOf('\nexport function ', start + 1);
      const body = hook.slice(start, nextExport < 0 ? undefined : nextExport);
      expect(body).not.toContain('assertProductReapplyPermission(');
      expect(body).not.toContain('assertProductMovementPermission(');
    }
  });

  it('ürün detay aksiyonları hareket created_by değerine bağlıdır', () => {
    const detail = read('src/app/urunler/[id].tsx');
    expect(detail).toContain(
      "canUpdate('urunler', hareket.created_by ?? null)",
    );
    expect(detail).toContain(
      "canDelete('urunler', hareket.created_by ?? null)",
    );
    expect(detail).toContain('getLinkedProductMutationDecision');
    expect(detail).toContain(
      "canUpdate('islemler', hareket.islemCreatedBy ?? null)",
    );
    expect(detail).toContain(
      "canUpdate('urunler', hareket.islemCreatedBy ?? null)",
    );
    expect(detail).toContain(
      '&& canUpdate(\'urunler\', selectedEditHareket.created_by ?? null)',
    );
    expect(detail).toContain(
      'editMode ? canEdit : canAddStock',
    );
    expect(detail).toContain(
      "toErrorMessage(error, t('common:errors.permissionDenied'))",
    );
  });
});
