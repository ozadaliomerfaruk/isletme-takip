import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('işlem mutation yetki ve hata sözleşmesi', () => {
  it('normal işlem hooku 42501 kodunu typed hata olarak korur', () => {
    const source = read('src/hooks/useIslemler.ts');

    expect(source).toContain('TransactionPermissionError');
    expect(source).toContain("transactionPermissionError('update'");
    expect(source).toContain("transactionPermissionError('delete'");
    expect(source).not.toContain(".includes('policy')");
    expect(source).not.toContain(".includes('Yetkisiz')");
  });

  it('QTB yalnız sonucu belirsiz ağ hatasında kayıt sonucunu sorgular', () => {
    const source = read(
      'src/components/transaction/QuickTransactionBar/hooks/useTransactionSubmit.ts',
    );

    expect(source).toContain('classifyMutationError(error)');
    expect(source).toContain("errorKind === 'network_unknown'");
    expect(source).toContain('const shouldProbe =');
    expect(source).toContain('getTransactionMutationMessageKey(');
    expect(source).toContain(
      "type MutationOutcomeProbe = 'landed' | 'not_landed' | 'partial' | 'unknown'",
    );
    expect(source).toContain("outcome === 'not_landed'");
    expect(source).toContain("outcome === 'partial'");
    expect(source).toContain(
      'regularMutationIdRef.current ?? Crypto.randomUUID()',
    );
    expect(source).toContain('if (!visible)');
    expect(source).toContain('resetMutationIds();');
    expect(source).toContain('new ProductAtomicWriteUnavailableError(rpcError)');
    expect(source).not.toContain('createUrunHareketler(');
    expect(source).toContain('regularMutationFingerprintRef');
    expect(source).toContain('scheduledMutationFingerprintRef');
    expect(source).toContain(
      "invalidateRelatedQueries(queryClient, 'ileriTarihliIslem')",
    );
    expect(source).toContain('probeCreatedScheduledTransaction(');
    expect(source).toContain('probeRegularToScheduledConversion(');
    expect(source).toContain('probeScheduledToRegularConversion(');
    expect(source).toContain("t('transactions:messages.checkingSaveOutcome')");
    expect(source).toContain("t('transactions:messages.conversionIncomplete')");
  });

  it('QTB edit/copy yükleme hatasını fail-closed kapatır; fotoğrafı owner-only, ürünlü Cari editi V3 tutar', () => {
    const qtb = read(
      'src/components/transaction/QuickTransactionBar/QuickTransactionBar.tsx',
    );
    const form = read(
      'src/components/transaction/QuickTransactionBar/hooks/useQuickTransactionForm.ts',
    );
    const submit = read(
      'src/components/transaction/QuickTransactionBar/hooks/useTransactionSubmit.ts',
    );

    expect(form).toContain('transactionLoadError: unknown | null;');
    expect(form).toContain('normalTransactionError');
    expect(form).toContain('scheduledTransactionError');
    expect(form).toContain('urunHareketlerError');
    expect(qtb).toContain('transactionLoadErrorShownRef');
    expect(qtb).toContain('(!form.isEditMode && !form.isCopyMode)');
    expect(qtb).toContain('handleDismiss();');
    expect(qtb).toContain('allowedTypes={visibleTransactionTypes}');
    expect(qtb).toContain('showPhotoButton={isOwner}');
    expect(qtb).toContain('visible={isOwner && showPhotoViewer}');
    expect(qtb).toContain('urunItems={form.urunItems}');
    expect(qtb).not.toContain('sharedRegularEdit');
    expect(qtb).not.toContain('minimalModeAllowed');
    expect(submit).toContain('productItems: sharedProductItems');
    expect(submit).toMatch(
      /syncTransactionPhotoBestEffort[\s\S]{0,180}if \(\s*!isOwner/,
    );
  });

  it('account source report gates shared editing by record and source permissions', () => {
    const source = read('src/app/raporlar/hesap/[id].tsx');

    expect(source).toContain('getTransactionActionDeniedMessageKey');
    expect(source).toContain('canAccessTransactionSources');
    expect(source).not.toContain('ownerOnlyRestriction');
    expect(source).toMatch(
      /\{canRenderEditTransactionBar && \(\s*<QuickTransactionBar/,
    );
  });

  it.each([
    'src/app/raporlar/kategori/[id].tsx',
  ])('%s rapor satırında edit_own/edit_all ve kaynak modülü kapısını birlikte kullanır', (file) => {
    const source = read(file);

    expect(source).toContain('getTransactionActionDeniedMessageKey');
    expect(source).toContain('getTransactionProductMutationDecision');
    expect(source).toContain('getProductItemCount(transaction.id)');
    expect(source).toContain('isProductItemsResolved');
    expect(source).toContain('urunKalemleriLoading');
    expect(source).toContain('urunKalemleriFetching');
    expect(source).toContain('urunKalemleriError');
    expect(source).toContain(
      "canMutateTransaction: canUpdate('islemler', createdBy)",
    );
    expect(source).toContain(
      "canMutateProduct: canUpdate('urunler', createdBy)",
    );
    expect(source).not.toContain('ownerOnlyRestriction');
    expect(source).toMatch(
      /\{canRenderEditTransactionBar && \(\s*<QuickTransactionBar/,
    );
  });

  it.each([
    'src/components/reports/tabs/CariTabContent.tsx',
    'src/components/reports/tabs/PersonelTabContent.tsx',
  ])('%s rapor satırı shared edit_all için kaynak-modül kapısı kullanır', (file) => {
    const source = read(file);

    expect(source).toContain('getTransactionActionDeniedMessageKey');
    expect(source).toContain('canAccessTransactionSources');
    expect(source).not.toContain('ownerOnlyRestriction');
    expect(source).toMatch(/\{!!editTransactionId && \(\s*<QuickTransactionBar/);
  });

  it('rapor ürün modalı yetkisiz kayıtta Düzenle aksiyonunu kaldırır', () => {
    const source = read('src/components/reports/EntityTransactionList.tsx');

    expect(source).toContain('canEditTransaction?:');
    expect(source).toContain('canEditProductTransaction ? handleProductEdit : undefined');
    expect(source).toContain('getTransactionProductMutationDecision({');
    expect(source).toContain(
      'canEditTransaction?.(transaction) ?? false',
    );
  });

  it('hesap fotoğrafı değişiklikleri işlem güncelleme izniyle kapatılır', () => {
    const source = read('src/app/hesaplar/[id].tsx');

    expect(source).toMatch(
      /onDelete=\{\s*viewPhotoIslemId && canUpdateTransaction\(viewPhotoIslemId\)/,
    );
    expect(source).toMatch(
      /onChange=\{\s*viewPhotoIslemId && canUpdateTransaction\(viewPhotoIslemId\)/,
    );
  });

  it('ileri tarihli editör seçili satırın güncel izni olmadan açılmaz', () => {
    const source = read('src/components/ui/IleriTarihliIslemlerSection.tsx');

    expect(source).toContain('readOnly = false');
    expect(source).toContain('readOnlyRef.current = readOnly');
    expect(source).toContain('canEditSelectedTransaction');
    expect(source).toContain(
      'visible={!!editTransactionId && canEditSelectedTransaction}',
    );
    expect(source).toMatch(
      /\{!readOnly && \(\s*<QuickTransactionBar/,
    );
    expect(source).toMatch(
      /\{!readOnly && pendingRate && \(\s*<ExchangeRateBar/,
    );
  });

  it('Türkçe ve İngilizce kullanıcı mesajları eksiksizdir', () => {
    const tr = JSON.parse(read('src/i18n/locales/tr/transactions.json'));
    const en = JSON.parse(read('src/i18n/locales/en/transactions.json'));

    expect(tr.permissions.otherUserUpdateDenied).toBe(
      'Bu işlem başka bir kullanıcı tarafından oluşturulduğu için düzenleyemezsiniz.',
    );
    expect(tr.permissions.otherUserDeleteDenied).toBe(
      'Bu işlem başka bir kullanıcı tarafından oluşturulduğu için silemezsiniz.',
    );
    expect(tr.permissions.updateDenied).toBe('Bu işlemi düzenleme yetkiniz yok.');
    expect(tr.permissions.deleteDenied).toBe('Bu işlemi silme yetkiniz yok.');
    expect(tr.permissions.createDenied).toBe('Yeni işlem oluşturma yetkiniz yok.');
    expect(tr.messages.saveNotLanded).toBe(
      'Bağlantı kesildi ve işlem kaydedilmedi. Bilgileriniz korunuyor; tekrar deneyebilirsiniz.',
    );
    expect(tr.messages.checkingSaveOutcome).toBe(
      'Bağlantı kesildi. İşlemin kaydedilip kaydedilmediğini kontrol ediyoruz.',
    );
    expect(tr.messages.saveOutcomeUnknown).toBe(
      'İşlemin kaydedilip kaydedilmediğini doğrulayamadık. Tekrar kaydetmeden önce işlem listesini kontrol edin.',
    );
    expect(tr.messages.deleteNotSent).toBe(
      'Bağlantı olmadığı için silme isteği gönderilmedi. Kayıt silinmedi.',
    );
    expect(tr.messages.deleteOutcomeUnknown).toBe(
      'İşlemin silinip silinmediğini doğrulayamadık. Tekrar silmeden önce işlem listesini kontrol edin.',
    );
    expect(tr.messages.conversionIncomplete).toBe(
      'Yeni kayıt oluşturuldu ancak eski kayıt kaldırılamadı. Listeyi yenileyip iki kaydı kontrol edin; tekrar kaydetmeyin.',
    );

    expect(en.permissions.otherUserUpdateDenied).toBeTruthy();
    expect(en.permissions.otherUserDeleteDenied).toBeTruthy();
    expect(en.permissions.updateDenied).toBeTruthy();
    expect(en.permissions.deleteDenied).toBeTruthy();
    expect(en.messages.saveNotLanded).toBeTruthy();
    expect(en.messages.checkingSaveOutcome).toBeTruthy();
    expect(en.messages.deleteNotSent).toBeTruthy();
    expect(en.messages.saveOutcomeUnknown).toBeTruthy();
    expect(en.messages.deleteOutcomeUnknown).toBeTruthy();
    expect(en.messages.conversionIncomplete).toBeTruthy();
  });

  it('hesap ve personel silme kaynak-modül + own/all kayıt kapsamıyla açılır', () => {
    const hesap = read('src/app/hesaplar/[id].tsx');
    const personel = read('src/app/personel/[id].tsx');
    const izin = read('src/app/personel/izin-gecmisi/[id].tsx');

    expect(hesap).not.toContain(
      "isOwner && canDelete('islemler', islem.created_by ?? null)",
    );
    expect(hesap).toContain('getTransactionProductMutationDecision');
    expect(hesap).toContain(
      "canDelete('islemler', createdBy)",
    );
    expect(personel).not.toContain(
      "isOwner && canDelete('islemler', islem.created_by ?? null)",
    );
    expect(personel).toContain('getTransactionProductMutationDecision');
    expect(personel).toContain(
      "canDelete('islemler', createdBy)",
    );
    expect(izin).not.toContain(
      "isOwner && canDelete('islemler', islem.created_by ?? null)",
    );
  });

  it('bağlantılı cari karşı taraf satırını düzenleme, kopyalama ve silmeye açmaz', () => {
    const source = read('src/app/cariler/[id].tsx');

    expect(source).toContain('const canEditProductDetailTransaction =');
    expect(source).toMatch(
      /const canEditProductDetailTransaction =[\s\S]{0,180}canUpdateTransactionRecord\(productDetailTransaction\)/,
    );
    expect(source).toContain(
      'const isOwnBusinessRecord = islem.isletme_id === isletme?.id',
    );
    expect(source).toContain(
      'const canActionItem = !isViewer && canCreateCariTransactions',
    );
    expect(source).toContain('const linkWriteStatusReady =');
    expect(source).toContain("linkStatus.permission === 'full'");
    expect(source).toContain("linkStatusFetchStatus === 'idle'");
    expect(source).toContain('linkStatusFetchedAfterMount');
    expect(source).toContain('if (!canCreateCariTransactions)');
    expect(source).toContain('visible={showMenu && canOpenCariWriteMenu}');
    expect(source).toMatch(
      /<IleriTarihliIslemlerSection[\s\S]{0,240}readOnly=\{!canMutateCariTransactions\}/,
    );
    expect(source).toMatch(
      /Copy Transaction Bar[\s\S]{0,100}\{canCopyTransactions && \(/,
    );
    expect(source).toMatch(
      /\{cari\.is_archived && canUpdateCariRecord && \([\s\S]{0,160}<ArchivedBanner/,
    );
    expect(source).toContain('if (!canUpdateCariRecord) return;');
    expect(source).toMatch(
      /useUndoDelete<CariIslemListRow>[\s\S]{0,1200}if \(!canMutateCariTransactions\) \{\s*undoDelete\(\);/,
    );
    expect(source).toMatch(
      /onCommitDelete: async \(id: string, item: CariIslemListRow\) => \{\s*const decision = getTransactionMutationDecision\(item, 'delete'\);\s*if \(!decision\.allowed\) \{\s*throw CARI_DELETE_PERMISSION_REVOKED;/,
    );
    expect(source).toContain(
      'useCariProductV3: decision.useProductMutationV3',
    );
  });

  it('tum islemler gecikmeli silme oncesinde urun sorgusunu fail-closed tutar', () => {
    const source = read('src/app/islemler/index.tsx');

    expect(source).toMatch(
      /onCommitDelete: async \(id: string, item: IslemWithRelations\) => \{\s*const decision = getMutationDecision\(item, 'delete'\);\s*if \(!decision\.allowed\) \{\s*throw new Error\(t\('common:errors\.permissionDenied'\)\);/,
    );
    expect(source).toContain(
      'useCariProductV3: decision.useProductMutationV3',
    );
  });

  it('bağlantılı cari izin durumu her açılışta tazelenir ve pending durumda yazma açılmaz', () => {
    const source = read('src/hooks/useCariSharing.ts');
    const noteRow = read('src/components/notes/NoteListRow.tsx');

    expect(source).toContain('staleTime: 0');
    expect(source).toContain("refetchOnMount: 'always'");
    expect(source).toContain('refetchOnWindowFocus: true');
    expect(noteRow).toContain('const canUpdateNote =');
    expect(noteRow).toContain(
      'canUpdateContextNote(contextModule, note.created_by)',
    );
    expect(noteRow).toContain("canUpdate('notlar', note.created_by)");
  });

  it('geri al penceresi sunucu sonucu gelmeden silindi iddiasında bulunmaz', () => {
    const source = read('src/hooks/useUndoDelete.ts');

    expect(source).toContain('`"${description}" silinecek`');
    expect(source).not.toContain('setSnackbarMessage(`"${description}" silindi`)');
  });

  it.each([
    'src/app/islemler/index.tsx',
    'src/app/hesaplar/[id].tsx',
    'src/app/cariler/[id].tsx',
    'src/app/personel/[id].tsx',
    'src/app/personel/izin-gecmisi/[id].tsx',
    'src/app/islemler/duzenle/[id].tsx',
  ])('%s silme hatasını merkezi aksiyon mesajına bağlar', (file) => {
    const source = read(file);

    expect(source).toContain("getTransactionMutationMessageKey(error, 'delete')");
  });

  it.each([
    'src/app/hesaplar/[id].tsx',
    'src/app/cariler/[id].tsx',
    'src/app/personel/[id].tsx',
  ])('%s detay deep-link reddini sessizce yutmaz', (file) => {
    const source = read(file);

    expect(source).toContain('showTransactionUpdateDenied(expandIslemId)');
  });
});
