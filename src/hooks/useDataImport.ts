/**
 * Data Import Hook
 * Excel'den parse edilen verileri Supabase'e batch olarak insert eder.
 *
 * Orchestration katmanı: Entity import, transaction import, bakiye güncelleme
 * ve duplicate kontrolünü koordine eder.
 */

import { useState, useCallback, useRef } from 'react';
import * as Crypto from 'expo-crypto';
import { useAuthContext } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys, invalidateRelatedQueries } from '@/lib/queryKeys';
import {
  ImportPreview,
  AccountMapping,
  ParsedTransaction,
  SkipReason,
  chunkArray,
} from '@/lib/excelImport';
import { IslemInsert, IslemType } from '@/types/database';
import { CARI_ISLEM_TYPES, PERSONEL_ISLEM_TYPES } from '@/constants/islemTypes';

import i18n from '@/i18n';
import { formatCurrency } from '@/lib/currency';
import { formatDateShort } from '@/lib/date';
import {
  ImportProgress,
  ImportResult,
  ImportOptions,
  SkippedTransaction,
  EntityIdMap,
  ProgressTranslations,
  DEFAULT_TRANSLATIONS,
  EMPTY_IMPORT_RESULT,
  EMPTY_PROGRESS,
} from './useDataImport.types';
import {
  applyImportOpeningBalance,
  createImportedIslemAtomically,
} from '@/lib/importFinancialSafety';
import { useImportDuplicates } from './useImportDuplicates';
import { useExistingEntities, useImportCategories, useImportAccounts, useImportClients, useImportPersonel } from './useImportEntities';

// Re-export types for backward compatibility
export type {
  ImportProgress,
  ImportResult,
  ImportOptions,
  SkippedTransaction,
  DuplicateInfo,
  ProgressTranslations,
} from './useDataImport.types';

/**
 * Yapısal atlama gerekçesini kullanıcının dilinde metne çevirir.
 *
 * Motor (excelImport) artık metin ÜRETMİYOR; { code, params } döndürüyor. Metin
 * BURADA üretiliyor — böylece İngilizce arayüzde "Account not found" ile
 * "Tutar boş veya bulunamadı" aynı listede yan yana çıkmıyor.
 *
 * Not: üretilen metin skippedTransactions üzerinden DB'ye de yazılıyor (skip_reason),
 * yani kayıt İÇE AKTARMA ANINDAKİ dilde saklanır — i18n'den gelen diğer 12 gerekçeyle
 * aynı davranış. Eski kayıtlar Türkçe kalır (geriye dönük veri; render değişmez).
 */
function renderSkipReason(reason: SkipReason | undefined, fallbackCode: string): string {
  const code = reason?.code || fallbackCode;
  return i18n.t('settings:dataImport.skipReasons.' + code, { ...(reason?.params ?? {}) });
}

export function useDataImport() {
  const { isletme, isOwner } = useAuthContext();
  const queryClient = useQueryClient();

  const translationsRef = useRef<ProgressTranslations>(DEFAULT_TRANSLATIONS);

  const [progress, setProgress] = useState<ImportProgress>(EMPTY_PROGRESS);
  const [result, setResult] = useState<ImportResult | null>(null);

  // Sub-hooks
  const { duplicates, runDuplicateCheck, resetDuplicates } = useImportDuplicates();
  const { getExistingCategories, getExistingAccounts, getExistingClients, getExistingPersonel } = useExistingEntities();
  const importCategories = useImportCategories();
  const importAccounts = useImportAccounts();
  const importClients = useImportClients();
  const importPersonel = useImportPersonel();

  /**
   * İşlemleri import et
   */
  const importTransactions = useCallback(async (
    transactions: ParsedTransaction[],
    idMaps: EntityIdMap,
    skipDuplicates: boolean = false,
    duplicatesMap: Map<number, import('./useDataImport.types').DuplicateInfo> = new Map()
  ): Promise<{ created: number; skipped: number; skippedTransactions: SkippedTransaction[]; errors: string[]; transactionIds: string[] }> => {
    if (!isletme) return { created: 0, skipped: 0, skippedTransactions: [], errors: [i18n.t('common:errors.businessNotFound')], transactionIds: [] };

    const errors: string[] = [];
    const skippedTransactions: SkippedTransaction[] = [];
    const transactionIds: string[] = [];
    let created = 0;
    let skipped = 0;

    const chunks = chunkArray(transactions, 500);
    const totalChunks = chunks.length;
    let globalIndex = 0;
    const startTime = Date.now();

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      const islemler: IslemInsert[] = [];
      const islemIndices: number[] = [];

      // Progress update
      const currentProgress = chunkIndex * 500;
      const elapsed = Date.now() - startTime;
      let estimatedTimeRemaining: number | undefined;
      if (currentProgress > 0 && elapsed > 0) {
        const rate = currentProgress / elapsed;
        const remaining = transactions.length - currentProgress;
        estimatedTimeRemaining = Math.ceil(remaining / rate / 1000);
      }

      const etaText = estimatedTimeRemaining !== undefined && estimatedTimeRemaining > 0
        ? ` (~${estimatedTimeRemaining}s ${translationsRef.current.etaRemaining || 'kaldı'})`
        : '';
      const percentage = transactions.length > 0 ? Math.round((currentProgress / transactions.length) * 100) : 0;
      const itemsPerSecond = elapsed > 0 ? Math.round(currentProgress / (elapsed / 1000)) : 0;

      setProgress(p => ({
        ...p,
        phase: 'transactions',
        current: currentProgress,
        total: transactions.length,
        message: `${translationsRef.current.transactions} (${chunkIndex + 1}/${totalChunks})${etaText}`,
        estimatedTimeRemaining,
        startTime,
        percentage,
        itemsPerSecond,
        phaseDetails: { ...p.phaseDetails, transactions: currentProgress },
      }));

      for (const tx of chunk) {
        const rowNumber = tx.rowNumber || (globalIndex + 2);
        globalIndex++;

        try {
          // Skip başlangıç bakiyesi
          if (tx.mappedType === 'baslangic_bakiyesi') continue;

          // Validation checks
          if (!tx.dateValid) {
            skipped++;
            skippedTransactions.push({ transaction: tx, reason: renderSkipReason(tx.dateReason, 'invalidDate'), rowNumber });
            continue;
          }
          if (!tx.amountValid) {
            skipped++;
            skippedTransactions.push({ transaction: tx, reason: renderSkipReason(tx.amountReason, 'invalidAmount'), rowNumber });
            continue;
          }
          if (!tx.entityValid) {
            skipped++;
            skippedTransactions.push({ transaction: tx, reason: renderSkipReason(tx.entityReason, 'missingEntity'), rowNumber });
            continue;
          }

          // Duplicate check
          if (skipDuplicates && duplicatesMap.has(globalIndex - 1)) {
            const dupInfo = duplicatesMap.get(globalIndex - 1)!;
            skipped++;
            skippedTransactions.push({
              transaction: tx,
              reason: i18n.t('settings:dataImport.skipReasons.duplicate', { date: formatDateShort(dupInfo.existingDate), amount: formatCurrency(dupInfo.existingAmount) }),
              rowNumber,
            });
            continue;
          }

          // Hesap ID resolution
          let hesapId = tx.account ? idMaps.accounts.get(tx.account.toLowerCase()) || null : null;
          if (!hesapId && tx.karsiHesap && tx.mappedType !== 'transfer') {
            hesapId = idMaps.accounts.get(tx.karsiHesap.toLowerCase()) || null;
          }

          const isCariIslemi = ['cari_alis', 'cari_satis', 'cari_alis_iade', 'cari_satis_iade'].includes(tx.mappedType);
          const isPersonelGider = tx.mappedType === 'personel_gider';
          if (!hesapId && !isCariIslemi && !isPersonelGider) {
            skipped++;
            skippedTransactions.push({ transaction: tx, reason: i18n.t('settings:dataImport.skipReasons.accountNotFound', { name: tx.account }), rowNumber });
            continue;
          }

          // Transfer kontrolü
          if (tx.mappedType === 'transfer') {
            if (!tx.karsiHesap) {
              skipped++;
              skippedTransactions.push({ transaction: tx, reason: i18n.t('settings:dataImport.skipReasons.transferMissingTarget'), rowNumber });
              continue;
            }
            const hedefHesapId = idMaps.accounts.get(tx.karsiHesap.toLowerCase()) || null;
            if (!hedefHesapId) {
              skipped++;
              skippedTransactions.push({ transaction: tx, reason: i18n.t('settings:dataImport.skipReasons.transferTargetNotFound', { name: tx.karsiHesap }), rowNumber });
              continue;
            }
          }

          // Cari kontrolü
          const cariIslemTipleri = ['cari_odeme', 'cari_tahsilat', 'cari_alis', 'cari_satis', 'cari_alis_iade', 'cari_satis_iade'];
          if (cariIslemTipleri.includes(tx.mappedType)) {
            const hasCari = tx.tedarikci || tx.musteri;
            if (!hasCari) {
              skipped++;
              skippedTransactions.push({ transaction: tx, reason: i18n.t('settings:dataImport.skipReasons.clientTransactionMissingClient', { type: tx.mappedType }), rowNumber });
              continue;
            }
            const cariName = tx.tedarikci || tx.musteri;
            const cariId = idMaps.clients.get(cariName!.toLowerCase()) || null;
            if (!cariId) {
              skipped++;
              skippedTransactions.push({ transaction: tx, reason: i18n.t('settings:dataImport.skipReasons.clientNotFound', { name: cariName }), rowNumber });
              continue;
            }
          }

          // Personel kontrolü
          if (['personel_gider', 'personel_odeme', 'personel_tahsilat', 'personel_satis'].includes(tx.mappedType)) {
            if (!tx.personel) {
              skipped++;
              skippedTransactions.push({ transaction: tx, reason: i18n.t('settings:dataImport.skipReasons.staffTransactionMissingStaff'), rowNumber });
              continue;
            }
            const personelId = idMaps.personel.get(tx.personel.toLowerCase()) || null;
            if (!personelId) {
              skipped++;
              skippedTransactions.push({ transaction: tx, reason: i18n.t('settings:dataImport.skipReasons.staffNotFound', { name: tx.personel }), rowNumber });
              continue;
            }
          }

          // ID lookups — entity bağları yalnız ilgili tip ailesine yazılır.
          // Kolonu dolu diye körlemesine bağlamak, gelir/gider/transfer
          // satırlarına cari/personel/hedef-hesap iliştirip ekstrelerde
          // yabancı-tip ve hayalet satırlar üretiyordu.
          const islemType: IslemType = tx.mappedType as IslemType;
          const hedefHesapId = islemType === 'transfer' && tx.karsiHesap
            ? idMaps.accounts.get(tx.karsiHesap.toLowerCase()) || null
            : null;
          let cariId: string | null = null;
          if (CARI_ISLEM_TYPES.includes(islemType)) {
            if (tx.tedarikci) cariId = idMaps.clients.get(tx.tedarikci.toLowerCase()) || null;
            else if (tx.musteri) cariId = idMaps.clients.get(tx.musteri.toLowerCase()) || null;
          }
          const personelId = PERSONEL_ISLEM_TYPES.includes(islemType) && tx.personel
            ? idMaps.personel.get(tx.personel.toLowerCase()) || null
            : null;
          const kategoriId = tx.category ? idMaps.categories.get(tx.category.toLowerCase()) || null : null;

          const finalAmount = Math.round(tx.amount * 100) / 100;

          if (finalAmount <= 0) {
            skipped++;
            skippedTransactions.push({ transaction: tx, reason: renderSkipReason({ code: 'amountTooSmall' }, 'amountTooSmall'), rowNumber });
            continue;
          }

          // Cross-currency detection
          let sourceCurrency: string | null = null;
          let targetCurrency: string | null = null;
          let exchangeRate: number | null = null;

          let bracketAmount: number | null = null;
          let bracketCurrency: string | null = null;
          if (islemType === 'transfer' && tx.karsiHesapAmount && tx.karsiHesapCurrency && tx.currency) {
            bracketAmount = tx.karsiHesapAmount;
            bracketCurrency = tx.karsiHesapCurrency;
          } else if (tx.entityBracketAmount && tx.entityBracketCurrency && tx.currency) {
            bracketAmount = tx.entityBracketAmount;
            bracketCurrency = tx.entityBracketCurrency;
          }

          if (bracketAmount && bracketCurrency && tx.currency && tx.currency !== bracketCurrency) {
            if (finalAmount > 0 && bracketAmount > 0) {
              const rate =
                tx.currency === 'TRY'
                  ? Math.round((finalAmount / bracketAmount) * 10000) / 10000
                  : Math.round((bracketAmount / finalAmount) * 10000) / 10000;
              // ÜÇLÜ BİRLİKTE yazılır: kur türetilebildiyse para birimleri de yazılır.
              // Eskiden source/target kur'dan BAĞIMSIZ set ediliyordu; kur null kalırsa
              // (tutarlardan biri 0) satır "para birimleri farklı ama kuru yok" hâlinde
              // DB'ye giriyor ve computeBalanceOps o satırda THROW ediyordu → işlem
              // sonradan düzenlenemez/silinemez hâle geliyordu.
              if (rate > 0 && isFinite(rate)) {
                sourceCurrency = tx.currency;
                targetCurrency = bracketCurrency;
                exchangeRate = rate;
              }
            }
          }

          islemler.push({
            id: Crypto.randomUUID(),
            isletme_id: isletme.id,
            type: islemType,
            amount: finalAmount,
            date: tx.date,
            description: tx.description,
            hesap_id: hesapId,
            hedef_hesap_id: hedefHesapId,
            cari_id: cariId,
            personel_id: personelId,
            kategori_id: kategoriId,
            source_currency: sourceCurrency,
            target_currency: targetCurrency,
            exchange_rate: exchangeRate,
          });
          islemIndices.push(globalIndex - 1);
        } catch (err) {
          errors.push(`İşlem hatası: ${err}`);
          skipped++;
          skippedTransactions.push({ transaction: tx, reason: renderSkipReason({ code: 'unknownError' }, 'unknownError'), rowNumber });
        }
      }

      // Her satır canonical atomik motorla yazılır: işlem + tüm bakiye bacakları
      // tek PostgreSQL transaction'ıdır. UUID istemcide bir kez üretildiği için
      // kayıp HTTP cevabı sonrası kontrollü tekrar çift işlem/bakiye yazamaz.
      if (islemler.length > 0) {
        const atomicItems = islemler.map((input, index) => ({
          input,
          sourceIndex: islemIndices[index],
        }));

        // 500 paralel native fetch açmak yerine kontrollü eşzamanlılık: toplu
        // import performansı korunur, auth/socket ve DB connection havuzu şişmez.
        const waves = chunkArray(atomicItems, 20);
        for (const wave of waves) {
          const results = await Promise.all(
            wave.map(async ({ input, sourceIndex }) => {
              try {
                const row = await createImportedIslemAtomically(isletme.id, input);
                return { ok: true as const, row, sourceIndex };
              } catch (error) {
                return { ok: false as const, error, sourceIndex };
              }
            }),
          );

          for (const result of results) {
            if (result.ok) {
              created += 1;
              transactionIds.push(result.row.id);
              continue;
            }

            skipped += 1;
            const tx = transactions[result.sourceIndex];
            const message = result.error instanceof Error
              ? result.error.message
              : String(result.error);
            errors.push(`İşlem hatası: ${message}`);
            skippedTransactions.push({
              transaction: tx,
              reason: renderSkipReason(
                { code: 'dbError', params: { message } },
                'dbError',
              ),
              rowNumber: tx?.rowNumber || result.sourceIndex + 2,
            });
          }
        }
      }
    }

    setProgress(p => ({ ...p, current: transactions.length, total: transactions.length }));
    return { created, skipped, skippedTransactions, errors, transactionIds };
  }, [isletme]);

  /**
   * Dry run simülasyonu
   */
  const simulateImport = useCallback(async (
    preview: ImportPreview,
    accountMappings: Record<string, AccountMapping>
  ): Promise<ImportResult> => {
    if (!isletme) return { ...EMPTY_IMPORT_RESULT, errors: [i18n.t('common:errors.businessNotFound')] };

    setProgress({
      ...EMPTY_PROGRESS,
      phase: 'categories',
      total: 100,
      message: translationsRef.current.simulation,
    });

    const [existingCategories, existingAccounts, existingClients, existingPersonel] = await Promise.all([
      getExistingCategories(), getExistingAccounts(), getExistingClients(), getExistingPersonel(),
    ]);

    let categoriesWouldCreate = 0, accountsWouldCreate = 0, clientsWouldCreate = 0, personelWouldCreate = 0;

    preview.uniqueCategories.forEach(name => {
      if (!existingCategories.has(name.toLowerCase())) categoriesWouldCreate++;
    });
    Object.values(accountMappings).forEach(mapping => {
      if (mapping.type === 'hesap' && !existingAccounts.has(mapping.name.toLowerCase())) accountsWouldCreate++;
      if (mapping.type === 'cari' && !existingClients.has(mapping.name.toLowerCase())) clientsWouldCreate++;
      if (mapping.type === 'personel' && !existingPersonel.has(mapping.name.toLowerCase())) personelWouldCreate++;
    });

    const startingBalanceTransactions = preview.transactions.filter(tx => tx.mappedType === 'baslangic_bakiyesi');
    const validTransactions = preview.transactions.filter(tx => tx.dateValid && tx.amountValid && tx.mappedType !== 'baslangic_bakiyesi');
    const invalidDateTransactions = preview.transactions.filter(tx => !tx.dateValid && tx.mappedType !== 'baslangic_bakiyesi');
    const invalidAmountTransactions = preview.transactions.filter(tx => tx.dateValid && !tx.amountValid && tx.mappedType !== 'baslangic_bakiyesi');

    const duplicateMap = await runDuplicateCheck(preview.transactions);

    const totalSkipped = invalidDateTransactions.length + invalidAmountTransactions.length + duplicateMap.size;

    setProgress({
      phase: 'done', current: 100, total: 100, message: translationsRef.current.done,
      percentage: 100, itemsPerSecond: 0,
      phaseDetails: {
        categories: categoriesWouldCreate, accounts: accountsWouldCreate,
        clients: clientsWouldCreate, personel: personelWouldCreate,
        transactions: validTransactions.length - duplicateMap.size,
      },
    });

    const skippedList: SkippedTransaction[] = [
      ...invalidDateTransactions.map(tx => ({ transaction: tx, reason: renderSkipReason(tx.dateReason, 'invalidDate'), rowNumber: tx.rowNumber || 0 })),
      ...invalidAmountTransactions.map(tx => ({ transaction: tx, reason: renderSkipReason(tx.amountReason, 'invalidAmount'), rowNumber: tx.rowNumber || 0 })),
    ];

    const simulationResult: ImportResult = {
      ...EMPTY_IMPORT_RESULT,
      success: true,
      categoriesCreated: categoriesWouldCreate,
      accountsCreated: accountsWouldCreate,
      clientsCreated: clientsWouldCreate,
      personelCreated: personelWouldCreate,
      transactionsCreated: validTransactions.length - duplicateMap.size,
      skipped: totalSkipped,
      skippedTransactions: skippedList,
      startingBalancesApplied: startingBalanceTransactions.length,
      totalRowsProcessed: validTransactions.length + startingBalanceTransactions.length + totalSkipped,
    };

    setResult(simulationResult);
    return simulationResult;
  }, [isletme, getExistingCategories, getExistingAccounts, getExistingClients, getExistingPersonel, runDuplicateCheck]);

  /**
   * Ana import fonksiyonu
   */
  const runImport = useCallback(async (
    preview: ImportPreview,
    accountMappings: Record<string, AccountMapping>,
    options: ImportOptions = {}
  ): Promise<ImportResult> => {
    if (options.translations) translationsRef.current = options.translations;

    if (!isletme) {
      const errorResult = { ...EMPTY_IMPORT_RESULT, errors: [i18n.t('common:errors.businessNotFound')] };
      setResult(errorResult);
      return errorResult;
    }
    if (!isOwner) {
      const errorResult = { ...EMPTY_IMPORT_RESULT, errors: [i18n.t('common:errors.permissionDenied')] };
      setResult(errorResult);
      return errorResult;
    }
    if (options.dryRun) return simulateImport(preview, accountMappings);

    try {
      setProgress({
        ...EMPTY_PROGRESS,
        phase: 'categories',
        total: 100,
        message: translationsRef.current.starting || translationsRef.current.categories,
      });

      // 0. Başlangıç bakiyelerini topla
      const startingBalances = {
        hesaplar: new Map<string, number>(),
        cariler: new Map<string, number>(),
        personel: new Map<string, number>(),
      };

      preview.transactions.forEach(tx => {
        if (tx.mappedType === 'baslangic_bakiyesi') {
          const balanceValue = tx.signedAmount;
          if (tx.account) startingBalances.hesaplar.set(tx.account.toLowerCase(), balanceValue);
          if (tx.tedarikci) startingBalances.cariler.set(tx.tedarikci.toLowerCase(), balanceValue);
          if (tx.musteri) startingBalances.cariler.set(tx.musteri.toLowerCase(), balanceValue);
          if (tx.personel) startingBalances.personel.set(tx.personel.toLowerCase(), balanceValue);
        }
      });

      // 1. Mevcut verileri al
      const [existingCategories, existingAccounts, existingClients, existingPersonel] = await Promise.all([
        getExistingCategories(), getExistingAccounts(), getExistingClients(), getExistingPersonel(),
      ]);

      // 2-5. Entity'leri import et
      const categoryResult = await importCategories(preview.uniqueCategories, existingCategories, preview.transactions, setProgress, translationsRef, options.categoryMappings);
      const accountResult = await importAccounts(accountMappings, existingAccounts, setProgress, translationsRef, startingBalances.hesaplar);
      const clientResult = await importClients(accountMappings, existingClients, setProgress, translationsRef, startingBalances.cariler);
      const personelResult = await importPersonel(accountMappings, existingPersonel, setProgress, translationsRef, startingBalances.personel);

      // 5.5. Mevcut entity'lere başlangıç bakiyesi uygula
      const balanceSkippedTransactions: SkippedTransaction[] = [];
      let startingBalancesUpdatedCount = 0;

      for (const tx of preview.transactions) {
        if (tx.mappedType !== 'baslangic_bakiyesi') continue;
        const rowNumber = tx.rowNumber || 0;
        const balanceValue = tx.signedAmount;

        // Hesaplar
        if (tx.account) {
          const key = tx.account.toLowerCase();
          const existingId = existingAccounts.get(key);
          const isNewlyCreated = existingId ? accountResult.createdIds.includes(existingId) : false;
          if (existingId && !isNewlyCreated) {
            const openingResult = await applyImportOpeningBalance({
              isletmeId: isletme.id,
              entityType: 'hesap',
              entityId: existingId,
              amount: balanceValue,
              replaceExisting: false,
            });
            if (openingResult.applied) {
              startingBalancesUpdatedCount++;
            } else {
              balanceSkippedTransactions.push({ transaction: tx, reason: i18n.t('settings:dataImport.skipReasons.accountBalanceAlreadySet', { balance: openingResult.existing_initial_balance }), rowNumber });
            }
          }
        }

        // Cariler
        const cariName = tx.tedarikci || tx.musteri;
        if (cariName) {
          const key = cariName.toLowerCase();
          const existingId = existingClients.get(key);
          const isNewlyCreated = existingId ? clientResult.createdIds.includes(existingId) : false;
          if (existingId && !isNewlyCreated) {
            const openingResult = await applyImportOpeningBalance({
              isletmeId: isletme.id,
              entityType: 'cari',
              entityId: existingId,
              amount: balanceValue,
              replaceExisting: false,
            });
            if (openingResult.applied) {
              startingBalancesUpdatedCount++;
            } else {
              balanceSkippedTransactions.push({ transaction: tx, reason: i18n.t('settings:dataImport.skipReasons.clientBalanceAlreadySet', { balance: openingResult.existing_initial_balance }), rowNumber });
            }
          }
        }

        // Personel
        if (tx.personel) {
          const key = tx.personel.toLowerCase();
          const existingId = existingPersonel.get(key);
          const isNewlyCreated = existingId ? personelResult.createdIds.includes(existingId) : false;
          if (existingId && !isNewlyCreated) {
            const openingResult = await applyImportOpeningBalance({
              isletmeId: isletme.id,
              entityType: 'personel',
              entityId: existingId,
              amount: balanceValue,
              replaceExisting: false,
            });
            if (openingResult.applied) {
              startingBalancesUpdatedCount++;
            } else {
              balanceSkippedTransactions.push({ transaction: tx, reason: i18n.t('settings:dataImport.skipReasons.staffBalanceAlreadySet', { balance: openingResult.existing_initial_balance }), rowNumber });
            }
          }
        }
      }

      // 6. İşlemleri import et
      const idMaps: EntityIdMap = {
        categories: categoryResult.map,
        accounts: accountResult.map,
        clients: clientResult.map,
        personel: personelResult.map,
      };

      const txResult = await importTransactions(preview.transactions, idMaps, options.skipDuplicates || false, duplicates);

      // 7. Cache invalidate & refetch
      setProgress(p => ({
        ...p, phase: 'done', current: 100, total: 100, message: translationsRef.current.done, percentage: 100,
        phaseDetails: {
          categories: categoryResult.createdIds.length, accounts: accountResult.createdIds.length,
          clients: clientResult.createdIds.length, personel: personelResult.createdIds.length,
          transactions: txResult.created,
        },
      }));

      invalidateRelatedQueries(queryClient, 'islem');
      invalidateRelatedQueries(queryClient, 'hesap');
      invalidateRelatedQueries(queryClient, 'cari');
      invalidateRelatedQueries(queryClient, 'personel');
      invalidateRelatedQueries(queryClient, 'kategori');

      try {
        await Promise.all([
          queryClient.refetchQueries({ queryKey: queryKeys.hesaplar.all() }),
          queryClient.refetchQueries({ queryKey: queryKeys.cariler.all() }),
          queryClient.refetchQueries({ queryKey: queryKeys.personel.all() }),
        ]);
        queryClient.refetchQueries({ queryKey: queryKeys.islemler.all() });
      } catch { /* ignore refetch errors */ }

      const startingBalanceCount = preview.transactions.filter(tx => tx.mappedType === 'baslangic_bakiyesi').length;
      const totalSkippedWithBalances = txResult.skipped + balanceSkippedTransactions.length;

      const finalResult: ImportResult = {
        success: true,
        categoriesCreated: categoryResult.createdIds.length,
        accountsCreated: accountResult.createdIds.length,
        clientsCreated: clientResult.createdIds.length,
        personelCreated: personelResult.createdIds.length,
        transactionsCreated: txResult.created,
        transactionIds: txResult.transactionIds,
        createdCategoryIds: categoryResult.createdIds,
        reactivatedCategoryIds: categoryResult.reactivatedIds,
        createdAccountIds: accountResult.createdIds,
        createdClientIds: clientResult.createdIds,
        createdPersonelIds: personelResult.createdIds,
        errors: txResult.errors,
        skipped: totalSkippedWithBalances,
        skippedTransactions: [...txResult.skippedTransactions, ...balanceSkippedTransactions],
        startingBalancesApplied: startingBalanceCount,
        startingBalancesUpdated: startingBalancesUpdatedCount,
        totalRowsProcessed: txResult.created + startingBalanceCount + totalSkippedWithBalances,
      };

      setResult(finalResult);
      return finalResult;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Bilinmeyen hata';
      setProgress(p => ({ ...p, phase: 'error', current: 0, total: 0, message: errorMessage, percentage: 0, itemsPerSecond: 0 }));
      const errorResult = { ...EMPTY_IMPORT_RESULT, errors: [errorMessage] };
      setResult(errorResult);
      return errorResult;
    }
  }, [
    isletme, isOwner, queryClient, duplicates,
    getExistingCategories, getExistingAccounts, getExistingClients, getExistingPersonel,
    importCategories, importAccounts, importClients, importPersonel,
    importTransactions, simulateImport,
  ]);

  const reset = useCallback(() => {
    setProgress(EMPTY_PROGRESS);
    setResult(null);
    resetDuplicates();
  }, [resetDuplicates]);

  return { progress, result, duplicates, runImport, runDuplicateCheck, reset };
}
