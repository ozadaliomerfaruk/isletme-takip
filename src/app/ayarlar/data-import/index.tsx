import { useState, useCallback, useMemo } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Crypto from 'expo-crypto';
import * as XLSX from 'xlsx';
import { Text } from '@/components/ui';
import {
  parseExcelFile,
  autoClassifyAccounts,
  ImportPreview,
  AccountMapping,
  exportSkippedTransactionsToExcel,
  calculateFileHash,
  validateImportData,
  ValidationResult,
} from '@/lib/excelImport';
import { useDataImport, ProgressTranslations } from '@/hooks/useDataImport';
import { useImportHistory } from '@/hooks/useImportHistory';
import {
  useCreatePendingIslemler,
  usePendingIslemler,
  useDismissPendingIslem,
  useDeleteAllPendingIslemler,
} from '@/hooks/usePendingIslemler';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys, invalidateRelatedQueries } from '@/lib/queryKeys';
import { PendingTransactionForm } from '@/components/import';
import type { PendingIslemRawData, PendingIslem } from '@/types/database';
import { useDateFormat } from '@/hooks/useDateFormat';
import { getLocalizedCurrencies } from '@/constants/currencies';

import type { Step, ModalType, TabType } from '@/components/dataImport/types';
import { styles } from '@/components/dataImport/styles';
import { DataImportModal } from '@/components/dataImport/DataImportModal';
import { SkippedTab } from '@/components/dataImport/SkippedTab';
import { Step1Select, Step2Preview, StepImporting, StepResult } from '@/components/dataImport/steps';

export default function VeriIceAktarPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get('window').height;
  const { t, i18n } = useTranslation('settings');
  const queryClient = useQueryClient();
  const { formatDateMedium, formatDateShort } = useDateFormat();
  const { progress, result, runImport, runDuplicateCheck, reset } = useDataImport();
  const { history, lastImport, isUndoing, checkFileHash, saveImportHistory, undoLastImport } = useImportHistory();
  const createPendingIslemler = useCreatePendingIslemler();
  const { data: pendingIslemler, isLoading: loadingPending, refetch: refetchPending } = usePendingIslemler();
  const dismissPending = useDismissPendingIslem();
  const deleteAllPending = useDeleteAllPendingIslemler();

  const [activeTab, setActiveTab] = useState<TabType>('import');
  const [refreshing, setRefreshing] = useState(false);
  const [step, setStep] = useState<Step>('select');
  const [selectedPendingItem, setSelectedPendingItem] = useState<PendingIslem | null>(null);
  const [showPendingForm, setShowPendingForm] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [accountMappings, setAccountMappings] = useState<Record<string, AccountMapping>>({});
  const [categoryMappings, setCategoryMappings] = useState<Record<string, 'gelir' | 'gider'>>({});
  const [fileName, setFileName] = useState<string>('');
  const [fileHash, setFileHash] = useState<string>('');
  const [_fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [isDryRun, setIsDryRun] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const pendingCount = pendingIslemler?.length || 0;

  const translateError = useCallback((error: string): string => {
    const errorMap: Record<string, string> = {
      'HEADER_NOT_FOUND': t('dataImport.errors.headerNotFound'),
    };
    return errorMap[error] || error;
  }, [t]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchPending();
    setRefreshing(false);
  }, [refetchPending]);

  // Template download
  const handleDownloadTemplate = async () => {
    try {
      setDownloadingTemplate(true);
      const h = t('dataImport.template.headers', { returnObjects: true }) as Record<string, string>;
      const s = t('dataImport.template.sampleData', { returnObjects: true }) as Record<string, string>;
      const importWarning = t('dataImport.template.importWarning');
      const isEnglish = i18n.language.startsWith('en');
      const defaultCurrency = isEnglish ? 'USD' : 'TRY';
      const secondaryCurrency = isEnglish ? 'EUR' : 'USD';
      const secondaryAccount = isEnglish ? (s.eurAccount || 'EUR Account') : s.usdAccount;

      const templateData = [
        [importWarning, '', '', '', '', '', '', '', '', '', ''],
        [h.date, h.type, h.description, h.category, h.account, h.staff, h.supplier, h.customer, h.targetAccount, h.amount, h.currency],
        ['2024-01-15 10:30', s.income, s.cashSale, s.sales, s.cash, '', '', '', '', '1500', defaultCurrency],
        ['2024-01-15 14:00', s.expense, s.officeSupplies, s.officeExpenses, s.bankAccount, '', '', '', '', '250', defaultCurrency],
        ['2024-01-16 09:00', s.cariPurchase, s.goodsPurchase, s.purchase, '', '', s.sampleSupplier, '', '', '10000', defaultCurrency],
        ['2024-01-16 11:30', s.cariSale, s.goodsSale, s.sales, '', '', '', s.sampleCustomer, '', '15000', defaultCurrency],
        ['2024-01-17 08:00', s.payment, s.supplierPayment, '', s.bankAccount, '', s.sampleSupplier, '', '', '5000', defaultCurrency],
        ['2024-01-17 10:00', s.collection, s.customerCollection, '', s.bankAccount, '', '', s.sampleCustomer, '', '8000', defaultCurrency],
        ['2024-01-18 09:00', s.cariPurchaseReturn, s.purchaseReturn, s.returnCategory, '', '', s.sampleSupplier, '', '', '500', defaultCurrency],
        ['2024-01-18 11:00', s.cariSaleReturn, s.saleReturn, s.returnCategory, '', '', '', s.sampleCustomer, '', '1000', defaultCurrency],
        ['2024-01-19 08:00', s.transfer, s.betweenAccounts, '', s.cash, '', '', '', s.bankAccount, '2000', defaultCurrency],
        ['2024-01-19 10:00', s.transfer, s.currencyTransferTo, '', s.bankAccount, '', '', '', `${secondaryAccount} (${isEnglish ? '90 EUR' : '100 USD'})`, isEnglish ? '100' : '3200', defaultCurrency],
        ['2024-01-19 12:00', s.transfer, s.currencyTransferFrom, '', secondaryAccount, '', '', '', `${s.bankAccount} (${isEnglish ? '110 USD' : '3400 TRY'})`, isEnglish ? '100' : '100', secondaryCurrency],
        ['2024-01-20 16:00', s.staffExpense, s.salaryPayment, s.salary, s.bankAccount, s.sampleStaff1, '', '', '', '8500', defaultCurrency],
        ['2024-01-21 10:00', s.staffPayment, s.advancePayment, '', s.cash, s.sampleStaff2, '', '', '', '500', defaultCurrency],
        ['2024-01-21 14:00', s.staffCollection, s.advanceReturn, '', s.cash, s.sampleStaff2, '', '', '', '300', defaultCurrency],
        ['2024-01-01 00:00', s.openingBalance, s.accountOpeningBalance, '', s.bankAccount, '', '', '', '', '50000', defaultCurrency],
        ['2024-01-01 00:00', s.openingBalance, s.supplierOpeningBalance, '', '', '', s.sampleSupplier, '', '', '12000', defaultCurrency],
        ['2024-01-01 00:00', s.openingBalance, s.customerOpeningBalance, '', '', '', '', s.sampleCustomer, '', '8000', defaultCurrency],
        ['2024-01-01 00:00', s.openingBalance, s.staffOpeningBalance, '', '', s.sampleStaff1, '', '', '', '1500', defaultCurrency],
      ];

      const ws = XLSX.utils.aoa_to_sheet(templateData);
      ws['!cols'] = [
        { wch: 18 }, { wch: 15 }, { wch: 25 }, { wch: 18 }, { wch: 18 },
        { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 8 },
      ];
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 10 } }];
      ws['!rows'] = [{ hpt: 45 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, t('dataImport.template.sheetName'));
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const fileUri = FileSystem.cacheDirectory + t('dataImport.template.fileName');
      await FileSystem.writeAsStringAsync(fileUri, wbout, { encoding: 'base64' });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: t('dataImport.template.dialogTitle'),
        });
      } else {
        Alert.alert(t('common:status.error'), t('dataImport.errors.sharingNotSupported'));
      }
    } catch (error) {
      if (__DEV__) console.error('Template download error:', error);
      Alert.alert(t('common:status.error'), t('dataImport.errors.templateDownloadFailed'));
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const proceedWithParsing = (buffer: ArrayBuffer, _name: string) => {
    try {
      const parsed = parseExcelFile(buffer);
      setPreview(parsed);
      const validationResult = validateImportData(parsed);
      setValidation(validationResult);
      const mappings = autoClassifyAccounts(parsed, i18n.language);
      setAccountMappings(mappings);

      const categoryTypes: Record<string, 'gelir' | 'gider'> = {};
      parsed.uniqueCategories.forEach(categoryName => {
        const txsWithCategory = parsed.transactions.filter(
          tx => tx.category?.toLowerCase() === categoryName.toLowerCase()
        );
        const hasGelir = txsWithCategory.some(
          tx => tx.mappedType === 'gelir' || tx.mappedType === 'cari_satis'
        );
        categoryTypes[categoryName] = hasGelir ? 'gelir' : 'gider';
      });
      setCategoryMappings(categoryTypes);

      if (parsed.errors.length > 0) {
        Alert.alert(
          t('dataImport.warnings.title'),
          t('dataImport.warnings.parseErrors', { count: parsed.errors.length }),
          [
            { text: t('common:buttons.cancel'), style: 'cancel' },
            { text: t('common:buttons.continue'), onPress: () => setStep('preview') },
          ]
        );
      } else {
        setStep('preview');
      }
    } catch (error) {
      if (__DEV__) console.error('Parse error:', error);
      Alert.alert(t('common:status.error'), t('dataImport.errors.parseFailed'));
    }
  };

  const handleSelectFile = async () => {
    try {
      const docResult = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyToCacheDirectory: true,
      });
      if (docResult.canceled) return;
      const file = docResult.assets[0];
      setFileName(file.name);
      const fileContent = await FileSystem.readAsStringAsync(file.uri, { encoding: 'base64' });
      const binaryString = atob(fileContent);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const buffer = bytes.buffer;
      setFileBuffer(buffer);
      const hash = await calculateFileHash(buffer);
      setFileHash(hash);
      const existingImport = await checkFileHash(hash);
      if (existingImport) {
        const locale = i18n.language === 'tr' ? 'tr-TR' : 'en-US';
        const importDate = new Date(existingImport.importedAt).toLocaleDateString(locale);
        Alert.alert(
          t('dataImport.duplicateFile.title'),
          t('dataImport.duplicateFile.message', { fileName: existingImport.fileName, date: importDate }),
          [
            { text: t('common:buttons.cancel'), style: 'cancel' },
            { text: t('common:buttons.continue'), onPress: () => proceedWithParsing(buffer, file.name) },
          ]
        );
        return;
      }
      proceedWithParsing(buffer, file.name);
    } catch (error) {
      if (__DEV__) console.error('File select error:', error);
      Alert.alert(t('common:status.error'), t('dataImport.errors.fileReadFailed'));
    }
  };

  // Mapping handlers
  const toggleToHesap = (name: string) => {
    setAccountMappings(prev => ({
      ...prev,
      [name]: { ...prev[name], type: 'hesap', hesapType: 'banka', cariType: undefined },
    }));
  };
  const toggleEntityType = (name: string, newType: 'cari' | 'personel') => {
    setAccountMappings(prev => ({
      ...prev,
      [name]: { ...prev[name], type: newType, cariType: newType === 'cari' ? 'tedarikci' : undefined, hesapType: undefined },
    }));
  };
  const toggleFromHesap = (name: string) => {
    setAccountMappings(prev => ({
      ...prev,
      [name]: { ...prev[name], type: 'cari', cariType: 'tedarikci', hesapType: undefined },
    }));
  };
  const setHesapSubType = (name: string, hesapType: string) => {
    setAccountMappings(prev => ({
      ...prev,
      [name]: { ...prev[name], hesapType: hesapType as 'nakit' | 'banka' | 'kredi_karti' | 'birikim' },
    }));
  };
  const setCariSubType = (name: string, cariType: string) => {
    setAccountMappings(prev => ({
      ...prev,
      [name]: { ...prev[name], cariType: cariType as 'musteri' | 'tedarikci' },
    }));
  };
  const cycleAccountCurrency = (name: string) => {
    const currencies = getLocalizedCurrencies(i18n.language);
    setAccountMappings(prev => {
      const currentCurrency = prev[name]?.currency || 'TRY';
      const currentIndex = currencies.findIndex(c => c.code === currentCurrency);
      const nextIndex = (currentIndex + 1) % currencies.length;
      return { ...prev, [name]: { ...prev[name], currency: currencies[nextIndex].code } };
    });
  };
  const toggleCategoryType = (name: string) => {
    setCategoryMappings(prev => ({ ...prev, [name]: prev[name] === 'gelir' ? 'gider' : 'gelir' }));
  };

  // Import execution
  const handleStartImport = async (dryRun: boolean = false) => {
    if (!preview) return;
    setIsDryRun(dryRun);
    const duplicateMap = await runDuplicateCheck(preview.transactions);
    const duplicateCount = duplicateMap.size;
    if (duplicateCount > 0 && !dryRun) {
      Alert.alert(
        t('dataImport.duplicateTransactions.title'),
        t('dataImport.duplicateTransactions.message', { count: duplicateCount }),
        [
          { text: t('common:buttons.cancel'), style: 'cancel' },
          { text: t('dataImport.duplicateTransactions.skipOption'), onPress: () => proceedWithImport(dryRun, true) },
          { text: t('dataImport.buttons.continueAnyway'), onPress: () => proceedWithImport(dryRun, false) },
        ]
      );
      return;
    }
    await proceedWithImport(dryRun, false);
  };

  const proceedWithImport = async (dryRun: boolean, skipDuplicates: boolean) => {
    if (!preview) return;
    const progressTranslations: ProgressTranslations = {
      categories: t('dataImport.progress.categories'),
      accounts: t('dataImport.progress.accounts'),
      clients: t('dataImport.progress.clients'),
      personel: t('dataImport.progress.personel'),
      transactions: t('dataImport.progress.transactions'),
      balances: t('dataImport.progress.balances'),
      done: t('dataImport.progress.done'),
      simulation: t('dataImport.progress.simulation'),
      starting: t('dataImport.progress.starting'),
      etaRemaining: t('dataImport.progress.etaRemaining'),
    };
    setStep('importing');
    const importResult = await runImport(preview, accountMappings, {
      dryRun, skipDuplicates, categoryMappings, translations: progressTranslations,
    });
    if (importResult.success && !dryRun && fileHash) {
      await saveImportHistory(importResult, fileName, fileHash, {
        transactionIds: importResult.transactionIds,
        categoryIds: importResult.createdCategoryIds,
        reactivatedCategoryIds: importResult.reactivatedCategoryIds,
        accountIds: importResult.createdAccountIds,
        clientIds: importResult.createdClientIds,
        personelIds: importResult.createdPersonelIds,
      });
      if (importResult.skippedTransactions.length > 0) {
        try {
          const importBatchId = Crypto.randomUUID();
          const pendingItems = importResult.skippedTransactions.map((skipped) => ({
            import_batch_id: importBatchId,
            row_number: skipped.rowNumber,
            skip_reason: skipped.reason,
            raw_data: {
              date: skipped.transaction.date, type: skipped.transaction.type,
              mappedType: skipped.transaction.mappedType, description: skipped.transaction.description,
              category: skipped.transaction.category, account: skipped.transaction.account,
              personel: skipped.transaction.personel, tedarikci: skipped.transaction.tedarikci,
              musteri: skipped.transaction.musteri, karsiHesap: skipped.transaction.karsiHesap,
              amount: skipped.transaction.amount, isExpense: skipped.transaction.isExpense,
              rowNumber: skipped.transaction.rowNumber,
            } as PendingIslemRawData,
          }));
          await createPendingIslemler.mutateAsync(pendingItems);
        } catch (error) {
          if (__DEV__) console.warn('Failed to save skipped transactions to pending:', error);
        }
      }
    }
    setStep('result');
    await refetchPending();
  };

  // Pending handlers
  const handleFixPendingItem = useCallback((item: PendingIslem) => {
    setSelectedPendingItem(item);
    setShowPendingForm(true);
  }, []);

  const handleSkipPendingItem = useCallback(async (item: PendingIslem) => {
    Alert.alert(t('dataImport.pendingForm.skipTitle'), t('dataImport.pendingForm.skipMessage'), [
      { text: t('common:buttons.cancel'), style: 'cancel' },
      {
        text: t('common:buttons.skip'), style: 'destructive',
        onPress: async () => {
          try { await dismissPending.mutateAsync(item.id); await refetchPending(); }
          catch (error) { console.error('Error dismissing pending transaction:', error); }
        },
      },
    ]);
  }, [dismissPending, refetchPending, t]);

  const handleDeleteAllPending = useCallback(() => {
    if (!pendingIslemler || pendingIslemler.length === 0) return;
    Alert.alert(t('dataImport.skippedTransactions.deleteAllTitle'), t('dataImport.skippedTransactions.deleteAllMessage'), [
      { text: t('common:buttons.cancel'), style: 'cancel' },
      {
        text: t('dataImport.skippedTransactions.deleteAllButton'), style: 'destructive',
        onPress: async () => {
          try { await deleteAllPending.mutateAsync(); await refetchPending(); }
          catch (error) { console.error('Error deleting all pending transactions:', error); }
        },
      },
    ]);
  }, [pendingIslemler, deleteAllPending, refetchPending, t]);

  const handlePendingFormSuccess = useCallback(async () => {
    setShowPendingForm(false);
    setSelectedPendingItem(null);
    await refetchPending();
  }, [refetchPending]);

  // Undo last import
  const handleUndoLastImport = () => {
    if (!lastImport) return;
    const details = [];
    if (lastImport.transactionIds.length > 0) details.push(`${lastImport.transactionIds.length} ${t('dataImport.results.transaction')}`);
    if (lastImport.createdAccountIds?.length) details.push(`${lastImport.createdAccountIds.length} ${t('dataImport.results.account')}`);
    if (lastImport.createdClientIds?.length) details.push(`${lastImport.createdClientIds.length} ${t('dataImport.results.client')}`);
    if (lastImport.createdPersonelIds?.length) details.push(`${lastImport.createdPersonelIds.length} ${t('dataImport.results.staff')}`);
    if (lastImport.createdCategoryIds?.length) details.push(`${lastImport.createdCategoryIds.length} ${t('dataImport.results.category')}`);
    Alert.alert(t('dataImport.undo.confirmTitle'), t('dataImport.undo.confirmMessage', { fileName: lastImport.fileName, details: details.join('\n') }), [
      { text: t('common:buttons.cancel'), style: 'cancel' },
      {
        text: t('dataImport.undo.deleteAll'), style: 'destructive',
        onPress: async () => {
          const undoResult = await undoLastImport();
          if (undoResult.success) {
            invalidateRelatedQueries(queryClient, 'islem');
            invalidateRelatedQueries(queryClient, 'hesap');
            invalidateRelatedQueries(queryClient, 'cari');
            invalidateRelatedQueries(queryClient, 'kategori');
            invalidateRelatedQueries(queryClient, 'personel');
            await Promise.all([
              queryClient.refetchQueries({ queryKey: queryKeys.islemler.all() }),
              queryClient.refetchQueries({ queryKey: queryKeys.hesaplar.all() }),
              queryClient.refetchQueries({ queryKey: queryKeys.cariler.all() }),
              queryClient.refetchQueries({ queryKey: queryKeys.personel.all() }),
              queryClient.refetchQueries({ queryKey: queryKeys.kategoriler.all() }),
              queryClient.refetchQueries({ queryKey: queryKeys.dashboard.all() }),
            ]).catch(() => {});
            const { deletedEntities } = undoResult;
            const deletedDetails = [];
            if (deletedEntities.transactions > 0) deletedDetails.push(`${deletedEntities.transactions} ${t('dataImport.results.transaction')}`);
            if (deletedEntities.accounts > 0) deletedDetails.push(`${deletedEntities.accounts} ${t('dataImport.results.account')}`);
            if (deletedEntities.clients > 0) deletedDetails.push(`${deletedEntities.clients} ${t('dataImport.results.client')}`);
            if (deletedEntities.personel > 0) deletedDetails.push(`${deletedEntities.personel} ${t('dataImport.results.staff')}`);
            if (deletedEntities.categories > 0) deletedDetails.push(`${deletedEntities.categories} ${t('dataImport.results.category')}`);
            Alert.alert(t('dataImport.success.title'), t('dataImport.success.undoComplete', { details: deletedDetails.join('\n') }));
          } else {
            Alert.alert(t('common:status.error'), undoResult.error || t('dataImport.errors.undoFailed'));
          }
        },
      },
    ]);
  };

  const handleReset = () => {
    reset(); setStep('select'); setPreview(null); setValidation(null);
    setAccountMappings({}); setFileName(''); setFileHash('');
    setFileBuffer(null); setIsDryRun(false);
  };

  const handleExportSkipped = async () => {
    if (!result?.skippedTransactions.length) return;
    try {
      const buffer = exportSkippedTransactionsToExcel(result.skippedTransactions);
      const uint8Array = new Uint8Array(buffer);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
        binary += String.fromCharCode.apply(null, Array.from(chunk));
      }
      const base64 = btoa(binary);
      const filePath = `${FileSystem.cacheDirectory}atlanan_islemler.xlsx`;
      await FileSystem.writeAsStringAsync(filePath, base64, { encoding: FileSystem.EncodingType.Base64 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: t('dataImport.skipped.exportDialogTitle'),
        });
      } else {
        Alert.alert(t('common:status.error'), t('dataImport.errors.sharingNotAvailable'));
      }
    } catch (error) {
      if (__DEV__) console.error('Export error:', error);
      Alert.alert(t('common:status.error'), t('dataImport.errors.fileCreationFailed'));
    }
  };

  // Memoized selectors
  const countByType = useCallback((type: 'hesap' | 'cari' | 'personel') => {
    return Object.values(accountMappings).filter(m => m.type === type).length;
  }, [accountMappings]);

  const countCariAndPersonel = useMemo(() => {
    return Object.values(accountMappings).filter(m => m.type === 'cari' || m.type === 'personel').length;
  }, [accountMappings]);

  const filteredAccounts = useMemo(() => {
    const accounts = Object.entries(accountMappings)
      .filter(([_, m]) => m.type === 'hesap')
      .map(([key, mapping]) => ({ ...mapping, name: mapping.name || key }));
    if (!searchQuery) return accounts;
    return accounts.filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [accountMappings, searchQuery]);

  const filteredClientsAndPersonel = useMemo(() => {
    const items = Object.entries(accountMappings)
      .filter(([_, m]) => m.type === 'cari' || m.type === 'personel')
      .map(([key, mapping]) => ({ ...mapping, name: mapping.name || key }));
    if (!searchQuery) return items;
    return items.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [accountMappings, searchQuery]);

  const filteredCategories = useMemo(() => {
    if (!preview) return [];
    if (!searchQuery) return preview.uniqueCategories;
    return preview.uniqueCategories.filter(c => c.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [preview, searchQuery]);

  const filteredTransactions = useMemo(() => {
    if (!preview) return [];
    const txs = preview.transactions.slice(0, 100);
    if (!searchQuery) return txs;
    return txs.filter(tx =>
      tx.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.account?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.type?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [preview, searchQuery]);

  const closeModal = () => { setActiveModal(null); setSearchQuery(''); };

  // Render
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'import' && styles.tabActive]}
          onPress={() => setActiveTab('import')}
        >
          <Text variant="label" style={[styles.tabText, activeTab === 'import' && styles.tabTextActive]}>
            {t('dataImport.skippedTransactions.tabImport')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'skipped' && styles.tabActive]}
          onPress={() => setActiveTab('skipped')}
        >
          <Text variant="label" style={[styles.tabText, activeTab === 'skipped' && styles.tabTextActive]}>
            {t('dataImport.skippedTransactions.tabSkipped')}
          </Text>
          {pendingCount > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{pendingCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {activeTab === 'skipped' ? (
        <SkippedTab
          refreshing={refreshing}
          onRefresh={handleRefresh}
          pendingIslemler={pendingIslemler}
          loadingPending={loadingPending}
          pendingCount={pendingCount}
          onFixItem={handleFixPendingItem}
          onSkipItem={handleSkipPendingItem}
          onDeleteAll={handleDeleteAllPending}
          formatDateMedium={formatDateMedium}
          t={t}
        />
      ) : (
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {step === 'select' && (
            <Step1Select
              onDownloadTemplate={handleDownloadTemplate}
              downloadingTemplate={downloadingTemplate}
              onSelectFile={handleSelectFile}
              lastImport={lastImport}
              isUndoing={isUndoing}
              onUndoLastImport={handleUndoLastImport}
              history={history}
              formatDateShort={formatDateShort}
              language={i18n.language}
              t={t}
            />
          )}

          {step === 'preview' && preview && (
            <Step2Preview
              preview={preview}
              fileName={fileName}
              validation={validation}
              countByType={countByType}
              countCariAndPersonel={countCariAndPersonel}
              onSetActiveModal={setActiveModal}
              onStartImport={handleStartImport}
              onReset={handleReset}
              translateError={translateError}
              t={t}
            />
          )}

          {step === 'importing' && (
            <StepImporting progress={progress} t={t} />
          )}

          {step === 'result' && result && (
            <StepResult
              result={result}
              isDryRun={isDryRun}
              preview={preview}
              onStartImport={handleStartImport}
              onReset={handleReset}
              onBack={() => router.back()}
              onSetActiveModal={setActiveModal}
              onSetActiveTab={setActiveTab}
              onExportSkipped={handleExportSkipped}
              translateError={translateError}
              t={t}
            />
          )}
        </ScrollView>
      )}

      <DataImportModal
        activeModal={activeModal}
        windowHeight={windowHeight}
        bottomInset={insets.bottom}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onClose={closeModal}
        preview={preview}
        filteredTransactions={filteredTransactions}
        filteredAccounts={filteredAccounts}
        filteredClientsAndPersonel={filteredClientsAndPersonel}
        filteredCategories={filteredCategories}
        categoryMappings={categoryMappings}
        result={result}
        countByType={countByType}
        countCariAndPersonel={countCariAndPersonel}
        onToggleFromHesap={toggleFromHesap}
        onToggleToHesap={toggleToHesap}
        onToggleEntityType={toggleEntityType}
        onSetHesapSubType={setHesapSubType}
        onSetCariSubType={setCariSubType}
        onCycleAccountCurrency={cycleAccountCurrency}
        onToggleCategoryType={toggleCategoryType}
        t={t}
      />

      <PendingTransactionForm
        visible={showPendingForm}
        onDismiss={() => { setShowPendingForm(false); setSelectedPendingItem(null); }}
        pendingIslem={selectedPendingItem}
        onSuccess={handlePendingFormSuccess}
      />
    </SafeAreaView>
  );
}
