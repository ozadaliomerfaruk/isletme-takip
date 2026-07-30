import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('geniş işlem bağlamı UI sözleşmesi', () => {
  it.each([
    'src/app/(tabs)/index.tsx',
  ])('%s owner-only geçici QTB kapısını yeniden kurmaz', (screenPath) => {
    const source = read(screenPath);

    expect(source).not.toContain('canUseUnprojectedTransactions');
    expect(source).toContain('canCreateAccountTransactions');
    expect(source).toContain('createScope="hesap"');
  });

  it('Cari ve Personel listeleri type-scoped create kapisini kullanir', () => {
    const clients = read('src/app/(tabs)/cariler.tsx');
    const staff = read('src/app/(tabs)/personel.tsx');

    for (const source of [clients, staff]) {
      expect(source).not.toContain('canUseUnprojectedTransactions');
    }
    expect(clients).toContain('canCreateSameTenantCariTransactions');
    expect(clients).toContain(
      "createScope={selectedCariIsLinked ? undefined : 'cari'}",
    );
    expect(staff).toContain('canCreatePersonelTransactions');
    expect(staff).toContain('createScope="personel"');
  });

  it('ana sayfa ve hesap detayi Hesaplar-only create baglamini dar QTB ile acar', () => {
    const home = read('src/app/(tabs)/index.tsx');
    const account = read('src/app/hesaplar/[id].tsx');
    const creditCard = read(
      'src/components/transaction/CreditCardTransactionBar/index.tsx',
    );

    for (const source of [home, account]) {
      expect(source).toContain("scope: 'hesap'");
      expect(source).toContain('createScope="hesap"');
      expect(source).toContain('canCreateTransactionType');
    }
    expect(home).toContain('canShowTransactionFab');
    expect(home).not.toContain(
      '{canCreateTransactions && canSeeAccounts && (',
    );
    expect(creditCard).toContain(
      "const canCreateExpense = canCreateTransactionType('gider');",
    );
    expect(creditCard).toContain('allowedTypes={allowedTypes}');
    expect(creditCard).toContain(
      '!canCreateTransactionType(permissionApiType, productModules)',
    );
  });

  it('edit QTB yuzeylerini secili islemin canonical kaynak scope una daraltir', () => {
    const account = read('src/app/hesaplar/[id].tsx');
    const allTransactions = read('src/app/islemler/index.tsx');
    const accountReport = read('src/app/raporlar/hesap/[id].tsx');
    const categoryReport = read('src/app/raporlar/kategori/[id].tsx');
    const leaveHistory = read('src/app/personel/izin-gecmisi/[id].tsx');

    expect(account).toContain('getQuickTransactionScopeForApiType');
    expect(account).toMatch(
      /mode="edit"[\s\S]{0,320}createScope=\{/,
    );
    for (const source of [
      allTransactions,
      accountReport,
      categoryReport,
    ]) {
      expect(source).toContain('getQuickTransactionScopeForApiType');
      expect(source).toContain('defaultCariType={editTransaction?.cari?.type}');
    }
    expect(leaveHistory).toMatch(
      /mode="edit"[\s\S]{0,220}createScope="personel"/,
    );
  });

  it.each([
    'src/app/hesaplar/[id].tsx',
    'src/app/cariler/[id].tsx',
    'src/app/personel/[id].tsx',
    'src/app/personel/izin-gecmisi/[id].tsx',
  ])('%s temiz create QTB ve FAB akışını merkezi yazma kapısına bağlar', (screenPath) => {
    const source = read(screenPath);

    expect(source).toContain('canCreateTransactions');
    expect(source).not.toContain('{canUseFullTransactionContext && (');
  });

  it('hesap ham edit yolunu ve tüm copy yollarını owner-only tutar; cari/personel/izin V2 editi kayıt kapısıyla açar', () => {
    const account = read('src/app/hesaplar/[id].tsx');
    const client = read('src/app/cariler/[id].tsx');
    const staff = read('src/app/personel/[id].tsx');
    const leaveHistory = read('src/app/personel/izin-gecmisi/[id].tsx');

    expect(account).toContain('const canUpdateTransaction = useCallback(');
    expect(account).toContain('getTransactionProductMutationDecision');
    expect(account).toContain(
      'visible={showEditBar && !!editTransactionId && canUpdateTransaction(editTransactionId)}',
    );
    expect(account).toMatch(/Copy Transaction Bar[\s\S]{0,100}\{isOwner && \(/);
    expect(client).toContain(
      "&& (!isViewer || linkStatus.permission === 'full');",
    );
    expect(client).toContain('const canUpdateTransactionRecord = useCallback(');
    expect(client).toMatch(
      /Quick Transaction Bar - Edit Mode[\s\S]{0,100}\{canRenderEditTransactionBar && \(/,
    );
    expect(client).toMatch(
      /Copy Transaction Bar[\s\S]{0,100}\{canCopyTransactions && \(/,
    );
    expect(staff).toContain('const canUpdateTransactionRecord = useCallback(');
    expect(staff).toMatch(
      /Quick Transaction Bar - Edit Mode[\s\S]{0,100}\{canRenderEditTransactionBar && \(/,
    );
    expect(staff).toMatch(/Copy Transaction Bar[\s\S]{0,100}\{isOwner && \(/);
    expect(leaveHistory).toContain('const canUpdateTransactionRecord = useCallback(');
    expect(leaveHistory).toMatch(
      /Edit QuickTransactionBar[\s\S]{0,100}\{canRenderEditTransactionBar && \(/,
    );
    expect(leaveHistory).toMatch(/Copy QuickTransactionBar[\s\S]{0,100}\{isOwner && \(/);
  });

  it('hesap ve personel ileri tarihli ham sorgularini owner-only gizler', () => {
    const account = read('src/app/hesaplar/[id].tsx');
    const staff = read('src/app/personel/[id].tsx');

    expect(account).toContain('<IleriTarihliIslemlerSection');
    expect(account).not.toMatch(
      /\{isOwner && \(\s*<IleriTarihliIslemlerSection/,
    );
    expect(account).not.toContain('readOnly={!isOwner}');
    expect(staff).toContain('<IleriTarihliIslemlerSection');
    expect(staff).not.toMatch(
      /\{isOwner && \(\s*<View[\s\S]{0,220}<IleriTarihliIslemlerSection/,
    );
    expect(staff).not.toContain('readOnly={!isOwner}');
  });

  it('izin daralınca detay formlarının bekleyen stateini temizler', () => {
    const account = read('src/app/hesaplar/[id].tsx');
    const staff = read('src/app/personel/[id].tsx');

    expect(account).toMatch(
      /if \(canCreateAccountTransactions\) return;[\s\S]{0,160}setShowTransactionBar\(false\)/,
    );
    expect(staff).toMatch(
      /if \(canCreatePersonelTransactions\) return;[\s\S]{0,160}setQuickBarVisible\(false\)/,
    );
    expect(account).toContain(
      'visible={showEditBar && !!editTransactionId && canUpdateTransaction(editTransactionId)}',
    );
    expect(account).toMatch(
      /if \(isOwner\) return;[\s\S]{0,160}setCopySourceId\(null\)/,
    );
    expect(staff).toMatch(
      /if \(isOwner\) return;[\s\S]{0,160}setCopySourceId\(null\)/,
    );
    expect(staff).toMatch(
      /if \(!showEditBar \|\| canRenderEditTransactionBar\) return;[\s\S]{0,120}setEditTransactionId\(null\)/,
    );
  });

  it('acilis bakiyesi modalini daralan guncel yetkiden sonra kaydetmez', () => {
    const account = read('src/app/hesaplar/[id].tsx');
    const staff = read('src/app/personel/[id].tsx');

    for (const source of [account, staff]) {
      expect(source).toContain(
        'isBalanceEditableRef.current = isBalanceEditable;',
      );
      expect(source).toMatch(
        /if \(isBalanceEditable\) return;\s*setEditBalanceModalVisible\(false\)/,
      );
      expect(source).toContain(
        'visible={editBalanceModalVisible && isBalanceEditable}',
      );
    }

    expect(account).toMatch(
      /if \(!hesap \|\| !isBalanceEditableRef\.current\) \{\s*setEditBalanceModalVisible\(false\)/,
    );
    expect(staff.match(/if \(!isBalanceEditableRef\.current\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(staff).toMatch(
      /text: t\('common:buttons\.confirm'\),\s*onPress: async \(\) => \{\s*if \(!isBalanceEditableRef\.current\)/,
    );
  });

  it('personel izin ekleme aksiyonunu create yetenegine baglar', () => {
    const staff = read('src/app/personel/[id].tsx');
    const quotaCard = read('src/components/personel/LeaveQuotaCard.tsx');

    expect(staff).toContain(
      'onAddLeave={canCreatePersonelTransactions ? handleAddLeave : undefined}',
    );
    expect(quotaCard).toContain('onAddLeave?: () => void;');
    expect(quotaCard).toContain('{onAddLeave && <Plus');
    expect(quotaCard).toMatch(/\{onAddLeave && \(\s*<TouchableOpacity/);
  });

  it('toplu personel odemesini Personel + Hesaplar kaynak sozlesmesine baglar', () => {
    const staff = read('src/app/(tabs)/personel.tsx');
    const bulkPayment = read('src/app/personel/toplu-odeme.tsx');
    const guard = read('src/hooks/usePagePermission.ts');

    expect(staff).toContain(
      "canCreateTransactionType('personel_odeme')",
    );
    expect(staff).toContain('...(canCreatePersonelPayments ? [{');
    expect(bulkPayment).toContain(
      "transactionType: 'personel_odeme'",
    );
    expect(guard).toContain(
      'allowed = canCreateTransactionType(transactionType);',
    );
  });

  it('bilinen-ID cari ve personel tam-gecmis sorgularini kaynak modulunde fail-closed tutar', () => {
    const hooks = read('src/hooks/useIslemler.ts');
    const personelBlock = hooks.slice(
      hooks.indexOf('export function useAllIslemlerByPersonel'),
      hooks.indexOf('export function useAllLeaveByPersonel'),
    );
    const cariBlock = hooks.slice(
      hooks.indexOf('export function useAllIslemlerByCari'),
      hooks.indexOf('// İşlem güncelleme'),
    );

    expect(personelBlock).toContain("canAccessModule('personel')");
    expect(personelBlock).toContain(
      "allowReportAccess && canAccessModule('raporlar')",
    );
    expect(personelBlock).toContain(
      'if (!canReadPersonel || !isletme || !personelId) return [];',
    );
    expect(personelBlock).toMatch(
      /enabled:\s*canReadPersonel\s*&& !!isletme\s*&& !!personelId\s*&& \(!isShared \|\| !!user\?\.id\)/,
    );
    expect(personelBlock).toContain('meta: isShared');
    expect(personelBlock).toContain('persist: false');
    expect(personelBlock).toContain('persist: true');

    expect(cariBlock).toContain("canAccessModule('cariler')");
    expect(cariBlock).toContain(
      "allowReportAccess && canAccessModule('raporlar')",
    );
    expect(cariBlock).toContain(
      'if (!canReadCariler || !isletme || !cariId) return [];',
    );
    expect(cariBlock).toMatch(
      /enabled:\s*canReadCariler\s*&& !!isletme\s*&& !!cariId\s*&& enabled/,
    );
    expect(cariBlock).toContain('meta: isShared');
    expect(cariBlock).toContain('persist: false');
    expect(cariBlock).toContain('persist: true');
  });
});
