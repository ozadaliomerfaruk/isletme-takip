import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('S-07 taksit önizleme → RPC sözleşmesi', () => {
  it('QTB 2–48 gerçek satır önizlemesini iç içe native modal açmadan sunar', () => {
    const source = read(
      'src/components/transaction/QuickTransactionBar/QuickTransactionBar.tsx'
    );
    const header = read(
      'src/components/transaction/QuickTransactionBar/sections/HeaderSection.tsx'
    );

    expect(source).toContain('buildInstallmentPlan(');
    expect(source).toContain('MAX_INSTALLMENT_COUNT');
    expect(source).toContain('[2, 3, 4, 5, 6, 9, 10, 12]');
    // Cari/Personel-only dar hesap referansı, taksit planı oluşturmayı kapatmaz.
    // Editör ana QTB içinde inline kalır; hesap bakiyesi görünürlüğü ayrı kapıdır.
    expect(source).toContain('{showTaksitConfig && (');
    expect(source).toContain('showBalances={!minimalAccountRefsAllowed}');
    expect(source).toContain('<FlatList');
    expect(source).toContain('setTaksitPlan(candidate)');
    expect(source).toContain('pendingEditedTaksitResult?.ok === true');
    expect(source).toContain('data={effectiveTaksitPreviewPlan?.rows ?? []}');
    expect(source).toContain(
      'onEndEditing={(event) => onCommitEditing(index, event.nativeEvent.text)}'
    );
    expect(source).toContain('lockControlsDisabled={editingTaksitIndex !== null}');
    expect(source).toContain("Platform.OS === 'ios' && animation.isKeyboardVisible");
    expect(source).toContain(
      'formatDateForDB(effectiveTaksitPreviewPlan.ilkVade)'
    );
    expect(source).toContain('installmentEditWarningShownRef');
    expect(source).toContain("t('transactions:taksit.editEngel')");
    expect(source).toContain('installmentEditQuery.isFetching');
    expect(source).toContain('handleInstallmentGuardedSave');
    expect(source).toContain('await installmentEditQuery.refetch()');
    expect(source).toContain('onSave={handleInstallmentGuardedSave}');
    expect(source).not.toContain('<Modal visible={showTaksitConfig');
    expect(header).toContain('taksitStale?: boolean;');
    expect(header).toContain("t('transactions:taksit.planGuncelle'");
  });

  it('standalone owner edit route uses the same fail-closed installment gate', () => {
    const source = read('src/app/islemler/duzenle/[id].tsx');

    expect(source).toContain('useIslemTaksitliMi(');
    expect(source).toContain('getInstallmentEditGuardReason({');
    expect(source).toContain('await installmentEditQuery.refetch()');
    expect(source).toContain("t('transactions:taksit.editEngel')");
    expect(source).toContain(
      "installmentEditGuardReason !== 'allowed'",
    );
  });

  it('submit güncel toplamı yazmadan önce doğrular ve önizleme satırlarını yeniden bölmez', () => {
    const source = read(
      'src/components/transaction/QuickTransactionBar/hooks/useTransactionSubmit.ts'
    );

    expect(source).toContain(
      'validateInstallmentPlan(taksitPlan, currentTotalCents, safeDate)'
    );
    expect(source).toContain("'FIRST_DUE_BEFORE_TRANSACTION_DATE'");
    expect(source).toContain("validation?.error.code === 'STALE_TOTAL_CENTS'");
    expect(source).toContain('const taksitler = installmentRowsForSubmit;');
    expect(source).toContain("kind: 'installment_create'");
    expect(source).toContain('installments: taksitler');
    expect(source).toContain('createIslemTaksitli.mutateAsync({');
    expect(source).not.toContain('roundCurrency(toplam / adet)');
    expect(source).not.toContain('Array.from({ length: adet');
  });

  it('Supabase hooku onaylanan satırları p_taksitler alanına dönüşümsüz geçirir', () => {
    const source = read('src/hooks/useIslemler.ts');

    expect(source).toContain('export type TaksitSatiri = InstallmentRpcRow;');
    expect(source).toContain('p_taksitler: taksitler');
    expect(source).not.toMatch(/p_taksitler:\s*taksitler\.map/);
  });

  it('Türkçe ve İngilizce stale/dağıtım metinleri aynı anahtarlarla vardır', () => {
    const tr = JSON.parse(read('src/i18n/locales/tr/transactions.json'));
    const en = JSON.parse(read('src/i18n/locales/en/transactions.json'));
    const keys = [
      'planGuncelle',
      'tutarDegistiAciklama',
      'islemTarihiDegistiAciklama',
      'planGuncellenmeli',
      'planGuncellenmeliAciklama',
      'enAzBirKurus',
      'dagitimGecersiz',
      'taksitToplami',
      'islemToplami',
      'fark',
      'editEngel',
    ];

    for (const key of keys) {
      expect(tr.taksit[key]).toBeTruthy();
      expect(en.taksit[key]).toBeTruthy();
    }
  });
});
