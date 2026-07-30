import { renderHook } from '@testing-library/react-native';
import { buildPermissions } from '@/lib/permissions';
import type { ModuleName, PermissionLevel } from '@/types/multiUser';
import { usePermissions } from '../usePermissions';

const mockUseAuthContext = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => mockUseAuthContext(),
}));

function permissions(
  enabled: ModuleName[],
  level: PermissionLevel,
) {
  return buildPermissions(
    Object.fromEntries(enabled.map((module) => [module, true])),
    level,
  );
}

function authContext(
  enabled: ModuleName[],
  level: PermissionLevel,
  isOwner = false,
) {
  return {
    isOwner,
    currentPermissions: permissions(enabled, level),
    currentUserRole: isOwner ? null : 'custom',
    user: { id: 'user-1' },
    isSharedMode: !isOwner,
  };
}

const allTransactionSources: ModuleName[] = [
  'hesaplar',
  'cariler',
  'urunler',
  'personel',
];

describe('usePermissions geniş işlem bağlamı', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('tüm kaynakları ve ekleme seviyesi olan shared kullanıcıya QTB oluşturmayı açar', () => {
    mockUseAuthContext.mockReturnValue(
      authContext(allTransactionSources, 'edit_all'),
    );

    const { result } = renderHook(() => usePermissions());

    expect(result.current.canUseFullTransactionContext).toBe(true);
    expect(result.current.canCreateTransactions).toBe(true);
  });

  it('tüm kaynakları gören view kullanıcısına geniş okumayı açar, oluşturmayı kapatır', () => {
    mockUseAuthContext.mockReturnValue(
      authContext(allTransactionSources, 'view'),
    );

    const { result } = renderHook(() => usePermissions());

    expect(result.current.canUseFullTransactionContext).toBe(true);
    expect(result.current.canCreateTransactions).toBe(false);
  });

  it('bir kaynak modül eksikse edit_all olsa bile geniş QTB bağlamını kapatır', () => {
    mockUseAuthContext.mockReturnValue(
      authContext(['hesaplar', 'cariler', 'personel'], 'edit_all'),
    );

    const { result } = renderHook(() => usePermissions());

    expect(result.current.canUseFullTransactionContext).toBe(false);
    expect(result.current.canCreateTransactions).toBe(false);
    expect(result.current.canCreateTransactionType('cari_alis')).toBe(true);
    expect(result.current.canCreateTransactionType('personel_gider')).toBe(true);
    expect(result.current.canCreateTransactionType('personel_odeme')).toBe(true);
    expect(result.current.canCreateTransactionType('gelir')).toBe(true);
  });

  it('işletme sahibinin mevcut işlem yeteneğini korur', () => {
    mockUseAuthContext.mockReturnValue(authContext([], 'view', true));

    const { result } = renderHook(() => usePermissions());

    expect(result.current.canUseFullTransactionContext).toBe(true);
    expect(result.current.canCreateTransactions).toBe(true);
  });

  it('Cariler + Personel rolunde yalniz gereken kaynagi acik tipleri olusturur', () => {
    mockUseAuthContext.mockReturnValue(
      authContext(['cariler', 'personel'], 'edit_all'),
    );

    const { result } = renderHook(() => usePermissions());

    expect(result.current.canCreateTransactions).toBe(false);
    expect(result.current.canCreateTransactionType('cari_satis')).toBe(true);
    expect(result.current.canCreateTransactionType('personel_gider')).toBe(true);
    expect(
      result.current.canCreateTransactionType('personel_izin_kullanimi'),
    ).toBe(true);
    expect(result.current.canCreateTransactionType('personel_odeme')).toBe(true);
    expect(result.current.canCreateTransactionType('personel_tahsilat')).toBe(true);
    expect(result.current.canCreateTransactionType('gelir')).toBe(false);
    expect(result.current.canCreateTransactionType('future_type')).toBe(false);
  });

  it('Personel odeme ve tahsilatini Hesaplar kapaliyken minimal referansla acar', () => {
    mockUseAuthContext.mockReturnValue(
      authContext(['personel'], 'add'),
    );

    const { result } = renderHook(() => usePermissions());

    expect(result.current.canCreateTransactionType('personel_odeme')).toBe(true);
    expect(result.current.canCreateTransactionType('personel_tahsilat')).toBe(true);
    expect(result.current.canCreatePersonelMinimalTransactions).toBe(true);
  });

  it('Hesaplar da aciksa Personel odeme ve tahsilatini tam referansla acar', () => {
    mockUseAuthContext.mockReturnValue(
      authContext(['hesaplar', 'personel'], 'add'),
    );

    const { result } = renderHook(() => usePermissions());

    expect(result.current.canCreateTransactionType('personel_odeme')).toBe(true);
    expect(result.current.canCreateTransactionType('personel_tahsilat')).toBe(true);
    expect(result.current.canCreatePersonelMinimalTransactions).toBe(false);
  });

  it('Hesaplar kapali + Cariler add shared kullanicida yalniz dar cari create kapisini acar', () => {
    mockUseAuthContext.mockReturnValue(authContext(['cariler'], 'add'));

    const { result } = renderHook(() => usePermissions());

    expect(result.current.canCreateTransactions).toBe(false);
    expect(result.current.canCreateCariMinimalTransactions).toBe(true);
  });

  it('Cariler view seviyesinde dar cari create kapisini fail-closed tutar', () => {
    mockUseAuthContext.mockReturnValue(authContext(['cariler'], 'view'));

    const { result } = renderHook(() => usePermissions());

    expect(result.current.canCreateCariMinimalTransactions).toBe(false);
  });

  it('Hesaplar aciksa dar DTO kapisini kullanmaz', () => {
    mockUseAuthContext.mockReturnValue(
      authContext(['cariler', 'hesaplar'], 'edit_all'),
    );

    const { result } = renderHook(() => usePermissions());

    expect(result.current.canCreateCariMinimalTransactions).toBe(false);
  });

  it('shared oturum askida gibi kapanirsa cache izinleri kalsa da fail-closed olur', () => {
    mockUseAuthContext.mockReturnValue({
      ...authContext(['cariler'], 'edit_all'),
      isSharedMode: false,
    });

    const { result } = renderHook(() => usePermissions());

    expect(result.current.canCreateCariMinimalTransactions).toBe(false);
  });
});

describe('usePermissions yeni yetki sozlesmesi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('acik modulde creator ayrimi olmadan read-all uygular', () => {
    mockUseAuthContext.mockReturnValue(authContext(['cariler'], 'view'));

    const { result } = renderHook(() => usePermissions());

    expect(result.current.canSeeAllUsersData).toBe(true);
    expect(result.current.canSeeRecord('other-user')).toBe(true);
  });

  it('Ana Sayfayi yalniz Hesaplar Birikim veya Raporlar ile acar', () => {
    mockUseAuthContext.mockReturnValue(authContext(['cariler'], 'view'));
    const cariOnly = renderHook(() => usePermissions());
    expect(cariOnly.result.current.canAccessHome).toBe(false);
    cariOnly.unmount();

    mockUseAuthContext.mockReturnValue(authContext(['raporlar'], 'view'));
    const reportsOnly = renderHook(() => usePermissions());
    expect(reportsOnly.result.current.canAccessHome).toBe(true);
  });

  it('kategori yonetimini custom edit_all yerine gercek managera verir', () => {
    mockUseAuthContext.mockReturnValue(authContext(allTransactionSources, 'edit_all'));
    const custom = renderHook(() => usePermissions());
    expect(custom.result.current.canManageCategories).toBe(false);
    custom.unmount();

    mockUseAuthContext.mockReturnValue({
      ...authContext(allTransactionSources, 'edit_all'),
      currentUserRole: 'manager',
    });
    const manager = renderHook(() => usePermissions());
    expect(manager.result.current.canManageCategories).toBe(true);
  });

  it('pasif kayitlari owner disinda hicbir role gostermez', () => {
    mockUseAuthContext.mockReturnValue({
      ...authContext(allTransactionSources, 'edit_all'),
      currentUserRole: 'manager',
    });
    const manager = renderHook(() => usePermissions());
    expect(manager.result.current.canSeePassiveRecords).toBe(false);
    manager.unmount();

    mockUseAuthContext.mockReturnValue(authContext([], 'view', true));
    const owner = renderHook(() => usePermissions());
    expect(owner.result.current.canSeePassiveRecords).toBe(true);
  });

  it('context notunu view seviyesinde ekletir ve kendi notunu yonettirir', () => {
    mockUseAuthContext.mockReturnValue(authContext(['cariler'], 'view'));

    const { result } = renderHook(() => usePermissions());

    expect(result.current.canCreateContextNote('cariler')).toBe(true);
    expect(result.current.canUpdateContextNote('cariler', 'user-1')).toBe(true);
    expect(result.current.canDeleteContextNote('cariler', 'user-1')).toBe(true);
    expect(result.current.canUpdateContextNote('cariler', 'other-user')).toBe(false);
    expect(result.current.canDeleteContextNote('cariler', 'other-user')).toBe(false);
  });

  it('edit_all ile baskasinin context notunu yonettirir', () => {
    mockUseAuthContext.mockReturnValue(authContext(['personel'], 'edit_all'));

    const { result } = renderHook(() => usePermissions());

    expect(result.current.canUpdateContextNote('personel', 'other-user')).toBe(true);
    expect(result.current.canDeleteContextNote('personel', null)).toBe(true);
  });
});
