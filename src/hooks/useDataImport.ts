/**
 * Data Import Hook
 * Excel'den parse edilen verileri Supabase'e batch olarak insert eder.
 *
 * Orchestration katmanı: Entity import, transaction import, bakiye güncelleme
 * ve duplicate kontrolünü koordine eder.
 */

import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateRelatedQueries } from '@/lib/queryKeys';
import {
  ImportPreview,
  AccountMapping,
  ParsedTransaction,
  chunkArray,
} from '@/lib/excelImport';
import { IslemInsert, IslemType } from '@/types/database';

import i18n from '@/i18n';
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
import { safeIncrementBalance, calculateBalanceChanges } from './useImportBalance';
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

export function useDataImport() {
  const { isletme } = useAuthContext();
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
    accountMappings: Record<string, AccountMapping>,
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
            skippedTransactions.push({ transaction: tx, reason: tx.dateError || 'Geçersiz tarih', rowNumber });
            continue;
          }
          if (!tx.amountValid) {
            skipped++;
            skippedTransactions.push({ transaction: tx, reason: tx.amountError || 'Geçersiz tutar', rowNumber });
            continue;
          }
          if (!tx.entityValid) {
            skipped++;
            skippedTransactions.push({ transaction: tx, reason: tx.entityError || i18n.t('settings:dataImport.skipReasons.missingEntity'), rowNumber });
            continue;
          }

          // Duplicate check
          if (skipDuplicates && duplicatesMap.has(globalIndex - 1)) {
            const dupInfo = duplicatesMap.get(globalIndex - 1)!;
            skipped++;
            skippedTransactions.push({
              transaction: tx,
              reason: i18n.t('settings:dataImport.skipReasons.duplicate', { date: new Date(dupInfo.existingDate).toLocaleDateString(i18n.language === 'tr' ? 'tr-TR' : 'en-US'), amount: dupInfo.existingAmount.toLocaleString(i18n.language === 'tr' ? 'tr-TR' : 'en-US') }),
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

          // ID lookups
          const hedefHesapId = tx.karsiHesap ? idMaps.accounts.get(tx.karsiHesap.toLowerCase()) || null : null;
          let cariId: string | null = null;
          if (tx.tedarikci) cariId = idMaps.clients.get(tx.tedarikci.toLowerCase()) || null;
          else if (tx.musteri) cariId = idMaps.clients.get(tx.musteri.toLowerCase()) || null;
          const personelId = tx.personel ? idMaps.personel.get(tx.personel.toLowerCase()) || null : null;
          const kategoriId = tx.category ? idMaps.categories.get(tx.category.toLowerCase()) || null : null;

          const islemType: IslemType = tx.mappedType as IslemType;
          const finalAmount = Math.round(tx.amount * 100) / 100;

          if (finalAmount <= 0) {
            skipped++;
            skippedTransactions.push({ transaction: tx, reason: `Tutar sıfır veya negatif: ${tx.amount}`, rowNumber });
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
            sourceCurrency = tx.currency;
            targetCurrency = bracketCurrency;
            if (finalAmount > 0 && bracketAmount > 0) {
              if (sourceCurrency === 'TRY') {
                exchangeRate = Math.round((finalAmount / bracketAmount) * 10000) / 10000;
              } else {
                exchangeRate = Math.round((bracketAmount / finalAmount) * 10000) / 10000;
              }
            }
          }

          islemler.push({
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
          skippedTransactions.push({ transaction: tx, reason: `Beklenmeyen hata: ${err}`, rowNumber });
        }
      }

      // Batch insert
      if (islemler.length > 0) {
        const { data: insertedData, error } = await supabase
          .from('islemler')
          .insert(islemler)
          .select('id');

        if (error) {
          errors.push(`Batch insert hatası: ${error.message}`);
          islemIndices.forEach((idx) => {
            const tx = transactions[idx];
            skippedTransactions.push({ transaction: tx, reason: `Veritabanı hatası: ${error.message}`, rowNumber: idx + 2 });
          });
          skipped += islemler.length;
        } else {
          const actualCreated = insertedData?.length ?? 0;
          created += actualCreated;
          if (insertedData) {
            insertedData.forEach(row => { if (row.id) transactionIds.push(row.id); });
          }

          const notInserted = islemler.length - actualCreated;
          if (notInserted > 0) {
            errors.push(`${notInserted} işlem sessizce başarısız oldu (RLS/constraint?)`);
            skipped += notInserted;
          }

          // Bakiye güncelleme (aggregate yaklaşım)
          if (actualCreated > 0) {
            setProgress(p => ({
              ...p,
              phase: 'balances',
              message: `${translationsRef.current.balances} (${chunkIndex + 1}/${totalChunks})`,
            }));

            const aggregatedChanges = new Map<string, number>();
            const balanceUpdateItems = islemler.slice(0, Math.min(actualCreated, islemler.length));
            for (const islem of balanceUpdateItems) {
              const changes = calculateBalanceChanges(islem);
              for (const [key, delta] of changes) {
                aggregatedChanges.set(key, (aggregatedChanges.get(key) || 0) + delta);
              }
            }

            const entries = Array.from(aggregatedChanges.entries());
            const successfulUpdates: Array<{ key: string; amount: number }> = [];
            let balanceUpdateFailCount = 0;
            const balanceErrors: string[] = [];

            const AGGREGATE_BATCH_SIZE = 20;
            for (let i = 0; i < entries.length; i += AGGREGATE_BATCH_SIZE) {
              const batch = entries.slice(i, i + AGGREGATE_BATCH_SIZE);
              const results = await Promise.all(
                batch.map(([key, amount]) => {
                  const roundedAmount = Math.round(amount * 100) / 100;
                  const [tableName, rowId] = key.split('/');
                  return safeIncrementBalance(tableName, rowId, roundedAmount)
                    .then(() => ({ success: true as const, key, amount: roundedAmount }))
                    .catch((err) => ({ success: false as const, key, amount: roundedAmount, error: err instanceof Error ? err.message : String(err) }));
                })
              );

              for (const r of results) {
                if (r.success) {
                  successfulUpdates.push({ key: r.key, amount: r.amount });
                } else {
                  balanceUpdateFailCount++;
                  balanceErrors.push(`${r.key}: ${r.error}`);
                }
              }
            }

            // Rollback on balance failure
            if (balanceUpdateFailCount > 0) {
              for (const { key, amount } of successfulUpdates) {
                try {
                  const [tableName, rowId] = key.split('/');
                  await safeIncrementBalance(tableName, rowId, -amount);
                } catch (reverseErr) {
                  errors.push(`Bakiye rollback başarısız (${key}): ${reverseErr instanceof Error ? reverseErr.message : String(reverseErr)}`);
                }
              }

              const chunkTxIds = insertedData?.map(row => row.id).filter(Boolean) || [];
              if (chunkTxIds.length > 0) {
                const { error: deleteError } = await supabase.from('islemler').delete().in('id', chunkTxIds);
                if (deleteError) {
                  errors.push(`Rollback hatası - işlemler silinemedi: ${deleteError.message}`);
                } else {
                  created -= chunkTxIds.length;
                  skipped += chunkTxIds.length;
                  chunkTxIds.forEach(fId => {
                    const idx = transactionIds.indexOf(fId);
                    if (idx !== -1) transactionIds.splice(idx, 1);
                  });
                  errors.push(`${chunkTxIds.length} işlem bakiye hatası nedeniyle geri alındı`);
                }
              }
              balanceErrors.forEach(e => errors.push(`Bakiye hatası: ${e}`));
            }
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
      ...invalidDateTransactions.map(tx => ({ transaction: tx, reason: tx.dateError || 'Geçersiz tarih', rowNumber: tx.rowNumber || 0 })),
      ...invalidAmountTransactions.map(tx => ({ transaction: tx, reason: tx.amountError || 'Geçersiz tutar', rowNumber: tx.rowNumber || 0 })),
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
    if (options.dryRun) return simulateImport(preview, accountMappings);

    if (!isletme) {
      const errorResult = { ...EMPTY_IMPORT_RESULT, errors: [i18n.t('common:errors.businessNotFound')] };
      setResult(errorResult);
      return errorResult;
    }

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
            const { data: hesapData } = await supabase.from('hesaplar').select('id, balance, initial_balance').eq('id', existingId).single();
            if (hesapData) {
              if (hesapData.initial_balance && hesapData.initial_balance !== 0) {
                balanceSkippedTransactions.push({ transaction: tx, reason: i18n.t('settings:dataImport.skipReasons.accountBalanceAlreadySet', { balance: hesapData.initial_balance }), rowNumber });
              } else {
                await supabase.from('hesaplar').update({ balance: (hesapData.balance || 0) + balanceValue, initial_balance: balanceValue }).eq('id', existingId).eq('isletme_id', isletme!.id);
                startingBalancesUpdatedCount++;
              }
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
            const [{ data: cariData }, { data: cariTransactions }] = await Promise.all([
              supabase.from('cariler').select('id, balance').eq('id', existingId).single(),
              supabase.from('islemler').select('type, amount').eq('cari_id', existingId),
            ]);
            if (cariData) {
              let cariTxEffect = 0;
              cariTransactions?.forEach(t => {
                const amt = Number(t.amount) || 0;
                if (t.type === 'cari_alis') cariTxEffect -= amt;
                else if (t.type === 'cari_odeme') cariTxEffect += amt;
                else if (t.type === 'cari_satis') cariTxEffect += amt;
                else if (t.type === 'cari_tahsilat') cariTxEffect -= amt;
                else if (t.type === 'cari_alis_iade') cariTxEffect += amt;
                else if (t.type === 'cari_satis_iade') cariTxEffect -= amt;
              });
              const cariInitialBalance = (cariData.balance || 0) - cariTxEffect;
              if (cariInitialBalance !== 0) {
                balanceSkippedTransactions.push({ transaction: tx, reason: i18n.t('settings:dataImport.skipReasons.clientBalanceAlreadySet', { balance: cariInitialBalance }), rowNumber });
              } else {
                await supabase.from('cariler').update({ balance: balanceValue + cariTxEffect }).eq('id', existingId).eq('isletme_id', isletme!.id);
                startingBalancesUpdatedCount++;
              }
            }
          }
        }

        // Personel
        if (tx.personel) {
          const key = tx.personel.toLowerCase();
          const existingId = existingPersonel.get(key);
          const isNewlyCreated = existingId ? personelResult.createdIds.includes(existingId) : false;
          if (existingId && !isNewlyCreated) {
            const [{ data: personelData }, { data: personelTransactions }] = await Promise.all([
              supabase.from('personel').select('id, balance').eq('id', existingId).single(),
              supabase.from('islemler').select('type, amount').eq('personel_id', existingId),
            ]);
            if (personelData) {
              let personelTxEffect = 0;
              personelTransactions?.forEach(t => {
                const amt = Number(t.amount) || 0;
                if (t.type === 'personel_gider') personelTxEffect -= amt;
                else if (t.type === 'personel_odeme') personelTxEffect += amt;
                else if (t.type === 'personel_tahsilat') personelTxEffect -= amt;
                else if (t.type === 'personel_satis') personelTxEffect += amt;
              });
              const personelInitialBalance = (personelData.balance || 0) - personelTxEffect;
              if (personelInitialBalance !== 0) {
                balanceSkippedTransactions.push({ transaction: tx, reason: i18n.t('settings:dataImport.skipReasons.staffBalanceAlreadySet', { balance: personelInitialBalance }), rowNumber });
              } else {
                await supabase.from('personel').update({ balance: balanceValue + personelTxEffect }).eq('id', existingId).eq('isletme_id', isletme!.id);
                startingBalancesUpdatedCount++;
              }
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

      const txResult = await importTransactions(preview.transactions, accountMappings, idMaps, options.skipDuplicates || false, duplicates);

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
          queryClient.refetchQueries({ queryKey: ['hesaplar'] }),
          queryClient.refetchQueries({ queryKey: ['cariler'] }),
          queryClient.refetchQueries({ queryKey: ['personel'] }),
        ]);
        queryClient.refetchQueries({ queryKey: ['islemler'] });
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
    isletme, queryClient, duplicates,
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
