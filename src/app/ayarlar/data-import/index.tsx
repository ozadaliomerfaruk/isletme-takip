import { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Crypto from 'expo-crypto';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Building2,
  Users,
  UserRound,
  Tag,
  Receipt,
  AlertTriangle,
  X,
  Search,
  ArrowLeftRight,
  ArrowUpRight,
  ArrowDownLeft,
  Undo2,
  Info,
  Trash2,
  FileCheck,
} from 'lucide-react-native';
import { Text, Card, Button, EmptyState } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import {
  parseExcelFile,
  autoClassifyAccounts,
  ImportPreview,
  AccountMapping,
  ParsedTransaction,
  exportSkippedTransactionsToExcel,
  groupSkippedByReason,
  calculateFileHash,
  validateImportData,
  ValidationResult,
} from '@/lib/excelImport';
import { useDataImport, SkippedTransaction, ProgressTranslations } from '@/hooks/useDataImport';
import { useImportHistory } from '@/hooks/useImportHistory';
import {
  useCreatePendingIslemler,
  usePendingIslemler,
  useDismissPendingIslem,
  useDeleteAllPendingIslemler,
} from '@/hooks/usePendingIslemler';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateRelatedQueries } from '@/lib/queryKeys';
import { PendingTransactionForm } from '@/components/import';
import { SkippedTransactionCard } from '@/components/import/SkippedTransactionCard';
import type { PendingIslemRawData, PendingIslem } from '@/types/database';
import { useDateFormat } from '@/hooks/useDateFormat';
import { getLocalizedCurrencies } from '@/constants/currencies';

type Step = 'select' | 'preview' | 'mapping' | 'importing' | 'result';
type ModalType = 'transactions' | 'accounts' | 'clients' | 'categories' | 'categoryTypes' | 'skipped' | null;
type TabType = 'import' | 'skipped';

// Hesap alt tipleri - labels are translated via t()
const HESAP_TYPE_VALUES = ['banka', 'nakit', 'kredi_karti', 'birikim'] as const;

// Cari alt tipleri - labels are translated via t()
const CARI_TYPE_VALUES = ['musteri', 'tedarikci'] as const;

// Entity tipleri (Cari/Personel seçimi için) - labels are translated via t()
const ENTITY_TYPE_VALUES = ['cari', 'personel'] as const;

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

  // Tab state
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [isDryRun, setIsDryRun] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [showSilentlySkipped, setShowSilentlySkipped] = useState(false);

  // Modal state
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Count of pending items
  const pendingCount = pendingIslemler?.length || 0;

  // Error code to translated message mapping
  const translateError = useCallback((error: string): string => {
    const errorMap: Record<string, string> = {
      'HEADER_NOT_FOUND': t('dataImport.errors.headerNotFound'),
    };
    return errorMap[error] || error;
  }, [t]);

  // Refresh handler for skipped tab
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchPending();
    setRefreshing(false);
  }, [refetchPending]);

  // Şablon Excel dosyası oluştur ve indir
  const handleDownloadTemplate = async () => {
    try {
      setDownloadingTemplate(true);

      // Şablon verisi - Lokalize edilmiş
      const h = t('dataImport.template.headers', { returnObjects: true }) as Record<string, string>;
      const s = t('dataImport.template.sampleData', { returnObjects: true }) as Record<string, string>;
      const importWarning = t('dataImport.template.importWarning');

      // Dile göre varsayılan para birimi
      const isEnglish = i18n.language.startsWith('en');
      const defaultCurrency = isEnglish ? 'USD' : 'TRY';
      const secondaryCurrency = isEnglish ? 'EUR' : 'USD';
      const secondaryAccount = isEnglish ? (s.eurAccount || 'EUR Account') : s.usdAccount;

      const templateData = [
        // Uyarı satırı (1. satır) - merge edilecek
        [importWarning, '', '', '', '', '', '', '', '', '', ''],
        // Header row (2. satır)
        [h.date, h.type, h.description, h.category, h.account, h.staff, h.supplier, h.customer, h.targetAccount, h.amount, h.currency],
        // 1. GELİR - Genel gelir (cari bağımsız)
        ['2024-01-15 10:30', s.income, s.cashSale, s.sales, s.cash, '', '', '', '', '1500', defaultCurrency],
        // 2. GİDER - Genel gider (cari bağımsız)
        ['2024-01-15 14:00', s.expense, s.officeSupplies, s.officeExpenses, s.bankAccount, '', '', '', '', '250', defaultCurrency],
        // 3. CARİ ALIŞ - Tedarikçiden alış
        ['2024-01-16 09:00', s.cariPurchase, s.goodsPurchase, s.purchase, '', '', s.sampleSupplier, '', '', '10000', defaultCurrency],
        // 4. CARİ SATIŞ - Müşteriye satış
        ['2024-01-16 11:30', s.cariSale, s.goodsSale, s.sales, '', '', '', s.sampleCustomer, '', '15000', defaultCurrency],
        // 5. ÖDEME - Tedarikçiye ödeme
        ['2024-01-17 08:00', s.payment, s.supplierPayment, '', s.bankAccount, '', s.sampleSupplier, '', '', '5000', defaultCurrency],
        // 6. TAHSİLAT - Müşteriden tahsilat
        ['2024-01-17 10:00', s.collection, s.customerCollection, '', s.bankAccount, '', '', s.sampleCustomer, '', '8000', defaultCurrency],
        // 7. CARİ ALIŞ İADE - Tedarikçiye iade (para geri alıyoruz)
        ['2024-01-18 09:00', s.cariPurchaseReturn, s.purchaseReturn, s.returnCategory, '', '', s.sampleSupplier, '', '', '500', defaultCurrency],
        // 8. CARİ SATIŞ İADE - Müşteriden iade aldık (para geri veriyoruz)
        ['2024-01-18 11:00', s.cariSaleReturn, s.saleReturn, s.returnCategory, '', '', '', s.sampleCustomer, '', '1000', defaultCurrency],
        // 9. TRANSFER - Hesaplar arası aktarım (aynı para birimi)
        ['2024-01-19 08:00', s.transfer, s.betweenAccounts, '', s.cash, '', '', '', s.bankAccount, '2000', defaultCurrency],
        // 10. TRANSFER - Dövize aktarım (EN: USD → EUR, TR: TRY → USD)
        ['2024-01-19 10:00', s.transfer, s.currencyTransferTo, '', s.bankAccount, '', '', '', `${secondaryAccount} (${isEnglish ? '90 EUR' : '100 USD'})`, isEnglish ? '100' : '3200', defaultCurrency],
        // 11. TRANSFER - Dövizden aktarım (EN: EUR → USD, TR: USD → TRY)
        ['2024-01-19 12:00', s.transfer, s.currencyTransferFrom, '', secondaryAccount, '', '', '', `${s.bankAccount} (${isEnglish ? '110 USD' : '3400 TRY'})`, isEnglish ? '100' : '100', secondaryCurrency],
        // 12. PERSONEL GİDERİ - Maaş
        ['2024-01-20 16:00', s.staffExpense, s.salaryPayment, s.salary, s.bankAccount, s.sampleStaff1, '', '', '', '8500', defaultCurrency],
        // 13. PERSONEL ÖDEMESİ - Avans ödemesi
        ['2024-01-21 10:00', s.staffPayment, s.advancePayment, '', s.cash, s.sampleStaff2, '', '', '', '500', defaultCurrency],
        // 14. PERSONEL TAHSİLATI - Avans iadesi
        ['2024-01-21 14:00', s.staffCollection, s.advanceReturn, '', s.cash, s.sampleStaff2, '', '', '', '300', defaultCurrency],
        // 15. BAŞLANGIÇ BAKİYESİ - Hesap açılış bakiyesi
        ['2024-01-01 00:00', s.openingBalance, s.accountOpeningBalance, '', s.bankAccount, '', '', '', '', '50000', defaultCurrency],
        // 16. BAŞLANGIÇ BAKİYESİ - Tedarikçi açılış bakiyesi (borcumuz)
        ['2024-01-01 00:00', s.openingBalance, s.supplierOpeningBalance, '', '', '', s.sampleSupplier, '', '', '12000', defaultCurrency],
        // 17. BAŞLANGIÇ BAKİYESİ - Müşteri açılış bakiyesi (alacağımız)
        ['2024-01-01 00:00', s.openingBalance, s.customerOpeningBalance, '', '', '', '', s.sampleCustomer, '', '8000', defaultCurrency],
        // 18. BAŞLANGIÇ BAKİYESİ - Personel açılış bakiyesi (avans borcu)
        ['2024-01-01 00:00', s.openingBalance, s.staffOpeningBalance, '', '', s.sampleStaff1, '', '', '', '1500', defaultCurrency],
      ];

      // Excel dosyası oluştur
      const ws = XLSX.utils.aoa_to_sheet(templateData);

      // Sütun genişliklerini ayarla
      ws['!cols'] = [
        { wch: 18 }, // TARIH
        { wch: 15 }, // İŞLEM TIPI
        { wch: 25 }, // AÇIKLAMA
        { wch: 18 }, // KATEGORİ
        { wch: 18 }, // HESAP
        { wch: 18 }, // PERSONEL
        { wch: 18 }, // TEDARİKÇİ
        { wch: 18 }, // MÜŞTERİ
        { wch: 18 }, // KARŞI HESAP
        { wch: 12 }, // MİKTAR
        { wch: 8 },  // BİRİM
      ];

      // 1. satır: Uyarı metni - tüm sütunları merge et
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 10 } }]; // A1:K1

      // Satır yükseklikleri (1. satır daha yüksek - uyarı için)
      ws['!rows'] = [{ hpt: 45 }]; // 1. satır yüksekliği

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, t('dataImport.template.sheetName'));

      // Base64'e çevir
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

      // Dosyayı kaydet
      const fileUri = FileSystem.cacheDirectory + t('dataImport.template.fileName');
      await FileSystem.writeAsStringAsync(fileUri, wbout, {
        encoding: 'base64',
      });

      // Paylaş (indir)
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

  // Dosya seçimi
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

      // Dosyayı oku
      const fileContent = await FileSystem.readAsStringAsync(file.uri, {
        encoding: 'base64',
      });

      // Base64'ü ArrayBuffer'a çevir
      const binaryString = atob(fileContent);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const buffer = bytes.buffer;
      setFileBuffer(buffer);

      // File hash hesapla
      const hash = await calculateFileHash(buffer);
      setFileHash(hash);

      // Daha önce import edilmiş mi kontrol et
      const existingImport = await checkFileHash(hash);
      if (existingImport) {
        const locale = i18n.language === 'tr' ? 'tr-TR' : 'en-US';
        const importDate = new Date(existingImport.importedAt).toLocaleDateString(locale);
        Alert.alert(
          t('dataImport.duplicateFile.title'),
          t('dataImport.duplicateFile.message', {
            fileName: existingImport.fileName,
            date: importDate,
          }),
          [
            { text: t('common:buttons.cancel'), style: 'cancel' },
            { text: t('common:buttons.continue'), onPress: () => proceedWithParsing(buffer, file.name) },
          ]
        );
        return;
      }

      // Normal akışla devam
      proceedWithParsing(buffer, file.name);
    } catch (error) {
      if (__DEV__) console.error('File select error:', error);
      Alert.alert(t('common:status.error'), t('dataImport.errors.fileReadFailed'));
    }
  };

  // Dosya parse işlemi
  const proceedWithParsing = (buffer: ArrayBuffer, _name: string) => {
    try {
      // Parse et
      const parsed = parseExcelFile(buffer);
      setPreview(parsed);

      // Veri kalitesi validasyonu
      const validationResult = validateImportData(parsed);
      setValidation(validationResult);

      // Otomatik hesap/cari/personel sınıflandırması (dile göre varsayılan currency)
      const mappings = autoClassifyAccounts(parsed, i18n.language);
      setAccountMappings(mappings);

      // Otomatik kategori tipi sınıflandırması (gelir/gider)
      const categoryTypes: Record<string, 'gelir' | 'gider'> = {};
      parsed.uniqueCategories.forEach(categoryName => {
        // Bu kategoriyi kullanan işlemlere bak
        const txsWithCategory = parsed.transactions.filter(
          tx => tx.category?.toLowerCase() === categoryName.toLowerCase()
        );

        // Gelir işlemleri varsa "gelir", yoksa "gider"
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

  // Hesap tipini değiştir (hesap -> cari/personel, cari/personel -> hesap)
  const toggleToHesap = (name: string) => {
    setAccountMappings(prev => ({
      ...prev,
      [name]: { ...prev[name], type: 'hesap', hesapType: 'banka', cariType: undefined },
    }));
  };

  // Cari/Personel tipini değiştir
  const toggleEntityType = (name: string, newType: 'cari' | 'personel') => {
    setAccountMappings(prev => ({
      ...prev,
      [name]: {
        ...prev[name],
        type: newType,
        cariType: newType === 'cari' ? 'tedarikci' : undefined,
        hesapType: undefined,
      },
    }));
  };

  // Hesaptan cari/personel'e geç
  const toggleFromHesap = (name: string) => {
    setAccountMappings(prev => ({
      ...prev,
      [name]: { ...prev[name], type: 'cari', cariType: 'tedarikci', hesapType: undefined },
    }));
  };

  // Hesap alt tipini değiştir
  const setHesapSubType = (name: string, hesapType: 'nakit' | 'banka' | 'kredi_karti' | 'birikim') => {
    setAccountMappings(prev => ({
      ...prev,
      [name]: { ...prev[name], hesapType },
    }));
  };

  // Cari alt tipini değiştir
  const setCariSubType = (name: string, cariType: 'musteri' | 'tedarikci') => {
    setAccountMappings(prev => ({
      ...prev,
      [name]: { ...prev[name], cariType },
    }));
  };

  // Hesap para birimini döngüsel değiştir (TRY → USD → EUR → GBP → TRY)
  const cycleAccountCurrency = (name: string) => {
    const currencies = getLocalizedCurrencies(i18n.language);
    setAccountMappings(prev => {
      const currentCurrency = prev[name]?.currency || 'TRY';
      const currentIndex = currencies.findIndex(c => c.code === currentCurrency);
      const nextIndex = (currentIndex + 1) % currencies.length;
      return {
        ...prev,
        [name]: { ...prev[name], currency: currencies[nextIndex].code },
      };
    });
  };

  // Kategori tipini değiştir (gelir <-> gider)
  const toggleCategoryType = (name: string) => {
    setCategoryMappings(prev => ({
      ...prev,
      [name]: prev[name] === 'gelir' ? 'gider' : 'gelir',
    }));
  };

  // Import başlat
  const handleStartImport = async (dryRun: boolean = false) => {
    if (!preview) return;

    setIsDryRun(dryRun);

    // Duplicate kontrolü çalıştır
    const duplicateMap = await runDuplicateCheck(preview.transactions);
    const duplicateCount = duplicateMap.size;

    if (duplicateCount > 0 && !dryRun) {
      Alert.alert(
        t('dataImport.duplicateTransactions.title'),
        t('dataImport.duplicateTransactions.message', { count: duplicateCount }),
        [
          { text: t('common:buttons.cancel'), style: 'cancel' },
          {
            text: t('dataImport.duplicateTransactions.skipOption'),
            onPress: () => proceedWithImport(dryRun, true),
          },
          {
            text: t('dataImport.buttons.continueAnyway'),
            onPress: () => proceedWithImport(dryRun, false),
          },
        ]
      );
      return;
    }

    await proceedWithImport(dryRun, false);
  };

  // Import işlemini gerçekleştir
  const proceedWithImport = async (dryRun: boolean, skipDuplicates: boolean) => {
    if (!preview) return;

    // Progress çevirilerini al
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
      dryRun,
      skipDuplicates,
      categoryMappings, // Kategori tiplerini geçir
      translations: progressTranslations,
    });

    // Başarılı import sonrası history'ye kaydet (dry run değilse)
    if (importResult.success && !dryRun && fileHash) {
      await saveImportHistory(importResult, fileName, fileHash, {
        transactionIds: importResult.transactionIds,
        categoryIds: importResult.createdCategoryIds,
        reactivatedCategoryIds: importResult.reactivatedCategoryIds,
        accountIds: importResult.createdAccountIds,
        clientIds: importResult.createdClientIds,
        personelIds: importResult.createdPersonelIds,
      });

      // Atlanan işlemleri pending_islemler tablosuna kaydet
      if (importResult.skippedTransactions.length > 0) {
        try {
          const importBatchId = Crypto.randomUUID();
          const pendingItems = importResult.skippedTransactions.map((skipped) => ({
            import_batch_id: importBatchId,
            row_number: skipped.rowNumber,
            skip_reason: skipped.reason,
            raw_data: {
              date: skipped.transaction.date,
              type: skipped.transaction.type,
              mappedType: skipped.transaction.mappedType,
              description: skipped.transaction.description,
              category: skipped.transaction.category,
              account: skipped.transaction.account,
              personel: skipped.transaction.personel,
              tedarikci: skipped.transaction.tedarikci,
              musteri: skipped.transaction.musteri,
              karsiHesap: skipped.transaction.karsiHesap,
              amount: skipped.transaction.amount,
              isExpense: skipped.transaction.isExpense,
              rowNumber: skipped.transaction.rowNumber,
            } as PendingIslemRawData,
          }));

          await createPendingIslemler.mutateAsync(pendingItems);
        } catch (error) {
          // Atlanan işlemleri kaydetme hatası - kritik değil, sadece log
          if (__DEV__) {
            console.warn('Failed to save skipped transactions to pending:', error);
          }
        }
      }
    }

    setStep('result');

    // Refetch pending items after saving
    await refetchPending();
  };

  // Handle fix button on skipped transaction - open form
  const handleFixPendingItem = useCallback((item: PendingIslem) => {
    setSelectedPendingItem(item);
    setShowPendingForm(true);
  }, []);

  // Handle skip/dismiss button on skipped transaction
  const handleSkipPendingItem = useCallback(async (item: PendingIslem) => {
    Alert.alert(
      t('dataImport.pendingForm.skipTitle'),
      t('dataImport.pendingForm.skipMessage'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.skip'),
          style: 'destructive',
          onPress: async () => {
            try {
              await dismissPending.mutateAsync(item.id);
              await refetchPending();
            } catch (error) {
              console.error('Error dismissing pending transaction:', error);
            }
          },
        },
      ]
    );
  }, [dismissPending, refetchPending, t]);

  // Handle delete all pending
  const handleDeleteAllPending = useCallback(() => {
    if (!pendingIslemler || pendingIslemler.length === 0) return;

    Alert.alert(
      t('dataImport.skippedTransactions.deleteAllTitle'),
      t('dataImport.skippedTransactions.deleteAllMessage'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('dataImport.skippedTransactions.deleteAllButton'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAllPending.mutateAsync();
              await refetchPending();
            } catch (error) {
              console.error('Error deleting all pending transactions:', error);
            }
          },
        },
      ]
    );
  }, [pendingIslemler, deleteAllPending, refetchPending, t]);

  // Handle success from pending form
  const handlePendingFormSuccess = useCallback(async () => {
    setShowPendingForm(false);
    setSelectedPendingItem(null);
    await refetchPending();
  }, [refetchPending]);

  // Son importu geri al
  const handleUndoLastImport = () => {
    if (!lastImport) return;

    const details = [];
    if (lastImport.transactionIds.length > 0) {
      details.push(`${lastImport.transactionIds.length} ${t('dataImport.results.transaction')}`);
    }
    if (lastImport.createdAccountIds?.length) {
      details.push(`${lastImport.createdAccountIds.length} ${t('dataImport.results.account')}`);
    }
    if (lastImport.createdClientIds?.length) {
      details.push(`${lastImport.createdClientIds.length} ${t('dataImport.results.client')}`);
    }
    if (lastImport.createdPersonelIds?.length) {
      details.push(`${lastImport.createdPersonelIds.length} ${t('dataImport.results.staff')}`);
    }
    if (lastImport.createdCategoryIds?.length) {
      details.push(`${lastImport.createdCategoryIds.length} ${t('dataImport.results.category')}`);
    }

    Alert.alert(
      t('dataImport.undo.confirmTitle'),
      t('dataImport.undo.confirmMessage', { fileName: lastImport.fileName, details: details.join('\n') }),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('dataImport.undo.deleteAll'),
          style: 'destructive',
          onPress: async () => {
            const result = await undoLastImport();
            if (result.success) {
              // Cache'i invalidate et - UI'ın güncel verileri göstermesi için
              invalidateRelatedQueries(queryClient, 'islem');
              invalidateRelatedQueries(queryClient, 'hesap');
              invalidateRelatedQueries(queryClient, 'cari');
              invalidateRelatedQueries(queryClient, 'kategori');
              invalidateRelatedQueries(queryClient, 'personel');

              // Kritik query'leri refetch et
              await Promise.all([
                queryClient.refetchQueries({ queryKey: ['islemler'] }),
                queryClient.refetchQueries({ queryKey: ['month-summary'] }),
                queryClient.refetchQueries({ queryKey: ['hesaplar'] }),
                queryClient.refetchQueries({ queryKey: ['cariler'] }),
                queryClient.refetchQueries({ queryKey: ['personel'] }),
                queryClient.refetchQueries({ queryKey: ['kategoriler'] }),
                queryClient.refetchQueries({ queryKey: ['dashboard'] }),
              ]).catch(() => {
                // Refetch hataları kritik değil, ignore et
              });

              const { deletedEntities } = result;
              const deletedDetails = [];
              if (deletedEntities.transactions > 0) {
                deletedDetails.push(`${deletedEntities.transactions} ${t('dataImport.results.transaction')}`);
              }
              if (deletedEntities.accounts > 0) {
                deletedDetails.push(`${deletedEntities.accounts} ${t('dataImport.results.account')}`);
              }
              if (deletedEntities.clients > 0) {
                deletedDetails.push(`${deletedEntities.clients} ${t('dataImport.results.client')}`);
              }
              if (deletedEntities.personel > 0) {
                deletedDetails.push(`${deletedEntities.personel} ${t('dataImport.results.staff')}`);
              }
              if (deletedEntities.categories > 0) {
                deletedDetails.push(`${deletedEntities.categories} ${t('dataImport.results.category')}`);
              }

              Alert.alert(
                t('dataImport.success.title'),
                t('dataImport.success.undoComplete', { details: deletedDetails.join('\n') })
              );
            } else {
              Alert.alert(t('common:status.error'), result.error || t('dataImport.errors.undoFailed'));
            }
          },
        },
      ]
    );
  };

  // Dry run (önizleme) başlat
  const handleDryRun = () => {
    handleStartImport(true);
  };

  // Sıfırla
  const handleReset = () => {
    reset();
    setStep('select');
    setPreview(null);
    setValidation(null);
    setAccountMappings({});
    setFileName('');
    setFileHash('');
    setFileBuffer(null);
    setIsDryRun(false);
  };

  // Modal kapat
  const closeModal = () => {
    setActiveModal(null);
    setSearchQuery('');
  };

  // Atlanan işlemleri Excel olarak dışa aktar
  const handleExportSkipped = async () => {
    if (!result?.skippedTransactions.length) return;

    try {
      const buffer = exportSkippedTransactionsToExcel(result.skippedTransactions);

      // Büyük buffer'ları base64'e çevirmek için chunk-based yaklaşım
      // (spread operator stack overflow'a neden olur)
      const uint8Array = new Uint8Array(buffer);
      let binary = '';
      const chunkSize = 8192; // 8KB chunks
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
        binary += String.fromCharCode.apply(null, Array.from(chunk));
      }
      const base64 = btoa(binary);

      const filePath = `${FileSystem.cacheDirectory}atlanan_islemler.xlsx`;
      await FileSystem.writeAsStringAsync(filePath, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

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

  // Hesapları say
  const countByType = useCallback((type: 'hesap' | 'cari' | 'personel') => {
    return Object.values(accountMappings).filter(m => m.type === type).length;
  }, [accountMappings]);

  // Cari + Personel toplamı
  const countCariAndPersonel = useMemo(() => {
    return Object.values(accountMappings).filter(m => m.type === 'cari' || m.type === 'personel').length;
  }, [accountMappings]);

  // Filtrelenmiş hesaplar
  const filteredAccounts = useMemo(() => {
    const accounts = Object.entries(accountMappings)
      .filter(([_, m]) => m.type === 'hesap')
      .map(([key, mapping]) => ({ ...mapping, name: mapping.name || key }));

    if (!searchQuery) return accounts;
    return accounts.filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [accountMappings, searchQuery]);

  // Filtrelenmiş cariler ve personeller (birlikte gösterilecek)
  const filteredClientsAndPersonel = useMemo(() => {
    const items = Object.entries(accountMappings)
      .filter(([_, m]) => m.type === 'cari' || m.type === 'personel')
      .map(([key, mapping]) => ({ ...mapping, name: mapping.name || key }));

    if (!searchQuery) return items;
    return items.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [accountMappings, searchQuery]);

  // Filtrelenmiş kategoriler
  const filteredCategories = useMemo(() => {
    if (!preview) return [];
    if (!searchQuery) return preview.uniqueCategories;
    return preview.uniqueCategories.filter(c =>
      c.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [preview, searchQuery]);

  // Filtrelenmiş işlemler
  const filteredTransactions = useMemo(() => {
    if (!preview) return [];
    const txs = preview.transactions.slice(0, 100); // İlk 100
    if (!searchQuery) return txs;
    return txs.filter(t =>
      t.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.account?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.type?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [preview, searchQuery]);

  // Modal render
  const renderModal = () => {
    if (!activeModal) return null;

    const getModalTitle = () => {
      switch (activeModal) {
        case 'transactions': return t('dataImport.modal.transactions', { count: preview?.totalRows || 0 });
        case 'accounts': return t('dataImport.modal.accounts', { count: countByType('hesap') });
        case 'clients': return t('dataImport.modal.clients', { count: countCariAndPersonel });
        case 'categories': return t('dataImport.modal.categories', { count: preview?.uniqueCategories.length || 0 });
        case 'skipped': return t('dataImport.modal.skipped', { count: result?.skipped || 0 });
        default: return '';
      }
    };

    const getSearchPlaceholder = () => {
      switch (activeModal) {
        case 'transactions': return t('dataImport.search.transactions');
        case 'accounts': return t('dataImport.search.accounts');
        case 'clients': return t('dataImport.search.clientsStaff');
        case 'categories': return t('dataImport.search.categories');
        case 'skipped': return t('dataImport.search.skipped');
        default: return t('dataImport.search.default');
      }
    };

    return (
      <Modal
        visible={true}
        transparent={true}
        animationType="slide"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={closeModal}
          />
          <View style={[styles.modalContent, { height: windowHeight * 0.7, paddingBottom: insets.bottom }]}>
                {/* Modal Header */}
                <View style={styles.modalHeader}>
                  <Text variant="h3">{getModalTitle()}</Text>
                  <TouchableOpacity
                    onPress={closeModal}
                    style={styles.closeButton}
                  >
                    <X size={24} color={colors.text} />
                  </TouchableOpacity>
                </View>

                {/* Search Bar */}
                <View style={styles.searchContainer}>
                  <Search size={20} color={colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder={getSearchPlaceholder()}
                    placeholderTextColor={colors.textMuted}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCorrect={false}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                      <X size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Content */}
                <ScrollView
                  style={styles.listContainer}
                  contentContainerStyle={styles.listContent}
                  showsVerticalScrollIndicator={true}
                  keyboardShouldPersistTaps="handled"
                  bounces={true}
                  nestedScrollEnabled={true}
                >
                  {activeModal === 'transactions' && (
                    <>
                      {filteredTransactions.map((item, index) => (
                        <TransactionItem key={index} transaction={item} />
                      ))}
                      {filteredTransactions.length === 0 && (
                        <View style={styles.emptyState}>
                          <Receipt size={48} color={colors.textMuted} />
                          <Text variant="body" color="secondary" style={styles.emptyText}>
                            {t('dataImport.empty.transactions')}
                          </Text>
                        </View>
                      )}
                      {preview && preview.totalRows > 100 && filteredTransactions.length > 0 && (
                        <Text variant="caption" color="muted" style={styles.footerText}>
                          {t('dataImport.preview.showingFirst100', { total: preview.totalRows })}
                        </Text>
                      )}
                    </>
                  )}

                  {activeModal === 'accounts' && (
                    <>
                      {filteredAccounts.map((item) => (
                        <AccountItem
                          key={item.name}
                          name={item.name}
                          mapping={item}
                          onToggleType={() => toggleFromHesap(item.name)}
                          onSubTypeChange={(subType) => setHesapSubType(item.name, subType as 'nakit' | 'banka' | 'kredi_karti' | 'birikim')}
                          onCurrencyChange={() => cycleAccountCurrency(item.name)}
                        />
                      ))}
                      {filteredAccounts.length === 0 && (
                        <View style={styles.emptyState}>
                          <Building2 size={48} color={colors.textMuted} />
                          <Text variant="body" color="secondary" style={styles.emptyText}>
                            {t('dataImport.empty.accounts')}
                          </Text>
                        </View>
                      )}
                    </>
                  )}

                  {activeModal === 'clients' && (
                    <>
                      {filteredClientsAndPersonel.map((item) => (
                        <ClientPersonelItem
                          key={item.name}
                          name={item.name}
                          mapping={item}
                          onToggleToHesap={() => toggleToHesap(item.name)}
                          onToggleEntityType={(type) => toggleEntityType(item.name, type)}
                          onSubTypeChange={(subType) => setCariSubType(item.name, subType as 'musteri' | 'tedarikci')}
                        />
                      ))}
                      {filteredClientsAndPersonel.length === 0 && (
                        <View style={styles.emptyState}>
                          <Users size={48} color={colors.textMuted} />
                          <Text variant="body" color="secondary" style={styles.emptyText}>
                            {t('dataImport.empty.clientsStaff')}
                          </Text>
                        </View>
                      )}
                    </>
                  )}

                  {activeModal === 'categories' && (
                    <>
                      <View style={styles.categoryHint}>
                        <Text variant="caption" color="secondary">
                          {t('dataImport.hints.categoryToggle')}
                        </Text>
                      </View>
                      {filteredCategories.map((item) => (
                        <CategoryItem
                          key={item}
                          name={item}
                          categoryType={categoryMappings[item] || 'gider'}
                          onToggleType={() => toggleCategoryType(item)}
                          t={t}
                        />
                      ))}
                      {filteredCategories.length === 0 && (
                        <View style={styles.emptyState}>
                          <Tag size={48} color={colors.textMuted} />
                          <Text variant="body" color="secondary" style={styles.emptyText}>
                            {t('dataImport.empty.categories')}
                          </Text>
                        </View>
                      )}
                    </>
                  )}

                  {activeModal === 'skipped' && result?.skippedTransactions && (
                    <>
                      {result.skippedTransactions
                        .filter(item =>
                          !searchQuery ||
                          item.reason?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.transaction.account?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.transaction.description?.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((item, index) => (
                          <SkippedTransactionItemSimple
                            key={index}
                            item={item}
                          />
                        ))}
                      {result.skippedTransactions.filter(item =>
                        !searchQuery ||
                        item.reason?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        item.transaction.account?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        item.transaction.description?.toLowerCase().includes(searchQuery.toLowerCase())
                      ).length === 0 && (
                        <View style={styles.emptyState}>
                          <AlertTriangle size={48} color={colors.textMuted} />
                          <Text variant="body" color="secondary" style={styles.emptyText}>
                            {t('dataImport.empty.skipped')}
                          </Text>
                        </View>
                      )}
                    </>
                  )}
                </ScrollView>
              </View>
        </View>
      </Modal>
    );
  };

  // Render tabs
  const renderTabs = () => (
    <View style={styles.tabContainer}>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'import' && styles.tabActive]}
        onPress={() => setActiveTab('import')}
      >
        <Text
          variant="label"
          style={[styles.tabText, activeTab === 'import' && styles.tabTextActive]}
        >
          {t('dataImport.skippedTransactions.tabImport')}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'skipped' && styles.tabActive]}
        onPress={() => setActiveTab('skipped')}
      >
        <Text
          variant="label"
          style={[styles.tabText, activeTab === 'skipped' && styles.tabTextActive]}
        >
          {t('dataImport.skippedTransactions.tabSkipped')}
        </Text>
        {pendingCount > 0 && (
          <View style={styles.tabBadge}>
            <Text style={styles.tabBadgeText}>{pendingCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );

  // Render skipped transactions tab content
  const renderSkippedTab = () => (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.skippedContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      {/* Description */}
      <View style={styles.descriptionContainer}>
        <Text variant="body" color="secondary">
          {t('dataImport.skippedTransactions.description')}
        </Text>
      </View>

      {/* Delete All Button */}
      {pendingIslemler && pendingIslemler.length > 0 && (
        <TouchableOpacity
          style={styles.deleteAllRow}
          onPress={handleDeleteAllPending}
        >
          <Trash2 size={18} color={colors.error} />
          <Text variant="body" style={{ color: colors.error }}>
            {t('dataImport.skippedTransactions.deleteAllButton')}
          </Text>
        </TouchableOpacity>
      )}

      {/* Content */}
      {loadingPending ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : pendingIslemler && pendingIslemler.length > 0 ? (
        pendingIslemler.map((item) => (
          <SkippedTransactionCard
            key={item.id}
            item={item}
            onFix={() => handleFixPendingItem(item)}
            onSkip={() => handleSkipPendingItem(item)}
            formatDateMedium={formatDateMedium}
          />
        ))
      ) : (
        <EmptyState
          icon={<FileCheck size={64} color={colors.textMuted} />}
          title={t('dataImport.skippedTransactions.empty')}
          description={t('dataImport.skippedTransactions.emptyDescription')}
        />
      )}
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Tabs */}
      {renderTabs()}

      {/* Tab Content */}
      {activeTab === 'skipped' ? (
        renderSkippedTab()
      ) : (
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Step 1: Dosya Seçimi */}
        {step === 'select' && (
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <FileSpreadsheet size={64} color={colors.primary} />
            </View>

            <Text variant="h2" style={styles.title}>
              {t('dataImport.pageTitle')}
            </Text>

            <Text variant="body" color="secondary" style={styles.description}>
              {t('dataImport.pageDescription')}
            </Text>

            {/* Adım 1: Şablon İndir */}
            <Card style={styles.stepCard}>
              <View style={styles.stepHeader}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>1</Text>
                </View>
                <View style={styles.stepInfo}>
                  <Text variant="label">{t('dataImport.steps.downloadTemplate')}</Text>
                  <Text variant="caption" color="secondary">
                    {t('dataImport.steps.downloadTemplateDesc')}
                  </Text>
                </View>
              </View>
              <Button
                variant="outline"
                size="sm"
                icon={<Download size={18} color={colors.primary} />}
                onPress={handleDownloadTemplate}
                loading={downloadingTemplate}
                style={styles.stepButton}
              >
                {t('dataImport.buttons.downloadTemplate')}
              </Button>
            </Card>

            {/* Adım 2: Dosya Seç */}
            <Card style={styles.stepCard}>
              <View style={styles.stepHeader}>
                <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.stepNumberText, { color: colors.surface }]}>2</Text>
                </View>
                <View style={styles.stepInfo}>
                  <Text variant="label">{t('dataImport.steps.selectFile')}</Text>
                  <Text variant="caption" color="secondary">
                    {t('dataImport.steps.selectFileDesc')}
                  </Text>
                </View>
              </View>
              <Button
                variant="primary"
                size="sm"
                icon={<Upload size={18} color={colors.surface} />}
                onPress={handleSelectFile}
                style={styles.stepButton}
              >
                {t('dataImport.buttons.selectFile')}
              </Button>
            </Card>

            {/* İşlem Tipleri Bilgisi */}
            <Card style={styles.infoCard}>
              <Text variant="label" style={styles.infoTitle}>
                {t('dataImport.info.supportedTypes')}
              </Text>
              <View style={styles.typesList}>
                <Text variant="caption" color="secondary">• {t('dataImport.typeDescriptions.gelir')}</Text>
                <Text variant="caption" color="secondary">• {t('dataImport.typeDescriptions.gider')}</Text>
                <Text variant="caption" color="secondary">• {t('dataImport.typeDescriptions.cariAlis')}</Text>
                <Text variant="caption" color="secondary">• {t('dataImport.typeDescriptions.cariSatis')}</Text>
                <Text variant="caption" color="secondary">• {t('dataImport.typeDescriptions.odeme')}</Text>
                <Text variant="caption" color="secondary">• {t('dataImport.typeDescriptions.tahsilat')}</Text>
                <Text variant="caption" color="secondary">• {t('dataImport.typeDescriptions.transfer')}</Text>
                <Text variant="caption" color="secondary">• {t('dataImport.typeDescriptions.personelGider')}</Text>
                <Text variant="caption" color="secondary">• {t('dataImport.typeDescriptions.personelOdeme')}</Text>
                <Text variant="caption" color="secondary">• {t('dataImport.typeDescriptions.personelTahsilat')}</Text>
                <Text variant="caption" color="secondary">• {t('dataImport.typeDescriptions.baslangicBakiyesi')}</Text>
              </View>
            </Card>

            {/* Son İmportu Geri Al */}
            {lastImport && lastImport.canUndo && (
              <Card style={[styles.stepCard, { borderColor: colors.warning, borderWidth: 1 }]}>
                <View style={styles.stepHeader}>
                  <View style={[styles.stepNumber, { backgroundColor: colors.warning }]}>
                    <Undo2 size={16} color={colors.surface} />
                  </View>
                  <View style={styles.stepInfo}>
                    <Text variant="label">{t('dataImport.undo.title')}</Text>
                    <Text variant="caption" color="secondary">
                      {lastImport.fileName} - {t('dataImport.undo.transactionCount', { count: lastImport.transactionIds.length })}
                    </Text>
                    <Text variant="caption" color="muted">
                      {new Date(lastImport.importedAt).toLocaleDateString(i18n.language === 'tr' ? 'tr-TR' : 'en-US', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                </View>
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Undo2 size={18} color={colors.warning} />}
                  onPress={handleUndoLastImport}
                  loading={isUndoing}
                  style={[styles.stepButton, { borderColor: colors.warning }]}
                >
                  <Text style={{ color: colors.warning }}>{t('dataImport.buttons.undoImport')}</Text>
                </Button>
              </Card>
            )}

            {/* Import Geçmişi */}
            {history.length > 0 && (
              <Card style={styles.infoCard}>
                <Text variant="label" style={styles.infoTitle}>
                  {t('dataImport.history.title')}
                </Text>
                <View style={styles.typesList}>
                  {history.map((item) => (
                    <View key={item.id} style={{ paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <Text variant="body" style={{ fontWeight: '600', fontSize: 14 }}>
                        {item.fileName}
                      </Text>
                      <Text variant="caption" color="secondary">
                        {formatDateShort(item.importedAt)} • {item.transactionsCreated} {t('dataImport.results.transaction')}
                        {item.accountsCreated > 0 ? ` • ${item.accountsCreated} ${t('dataImport.results.account')}` : ''}
                        {item.clientsCreated > 0 ? ` • ${item.clientsCreated} ${t('dataImport.results.client')}` : ''}
                        {item.categoriesCreated > 0 ? ` • ${item.categoriesCreated} ${t('dataImport.results.category')}` : ''}
                      </Text>
                      {item.transactionsSkipped > 0 && (
                        <Text variant="caption" color="muted">
                          {item.transactionsSkipped} {t('dataImport.results.skipped')}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              </Card>
            )}
          </View>
        )}

        {/* Step 2: Preview */}
        {step === 'preview' && preview && (
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <CheckCircle2 size={48} color={colors.success} />
            </View>

            <Text variant="h2" style={styles.title}>
              {t('dataImport.preview.fileAnalyzed')}
            </Text>

            <Text variant="body" color="secondary" style={styles.description}>
              {fileName}
            </Text>

            <Text variant="caption" color="muted" style={styles.tapHint}>
              {t('dataImport.preview.tapForDetails')}
            </Text>

            {/* Özet Kartları - Tıklanabilir */}
            <View style={styles.summaryGrid}>
              <TouchableOpacity
                style={styles.summaryCardTouchable}
                onPress={() => setActiveModal('transactions')}
                activeOpacity={0.7}
              >
                <Card style={styles.summaryCardInner}>
                  <Receipt size={24} color={colors.primary} />
                  <Text variant="h3" style={styles.summaryNumber}>
                    {preview.totalRows.toLocaleString(i18n.language === 'tr' ? 'tr-TR' : 'en-US')}
                  </Text>
                  <Text variant="caption" color="secondary">{t('dataImport.labels.transaction')}</Text>
                  <ChevronRight size={14} color={colors.textMuted} style={styles.cardChevron} />
                </Card>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.summaryCardTouchable}
                onPress={() => setActiveModal('accounts')}
                activeOpacity={0.7}
              >
                <Card style={styles.summaryCardInner}>
                  <Building2 size={24} color={colors.info} />
                  <Text variant="h3" style={styles.summaryNumber}>
                    {countByType('hesap')}
                  </Text>
                  <Text variant="caption" color="secondary">{t('dataImport.labels.account')}</Text>
                  <ChevronRight size={14} color={colors.textMuted} style={styles.cardChevron} />
                </Card>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.summaryCardTouchable}
                onPress={() => setActiveModal('clients')}
                activeOpacity={0.7}
              >
                <Card style={styles.summaryCardInner}>
                  <Users size={24} color={colors.warning} />
                  <Text variant="h3" style={styles.summaryNumber}>
                    {countCariAndPersonel}
                  </Text>
                  <Text variant="caption" color="secondary">{t('dataImport.labels.clientStaff')}</Text>
                  <ChevronRight size={14} color={colors.textMuted} style={styles.cardChevron} />
                </Card>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.summaryCardTouchable}
                onPress={() => setActiveModal('categories')}
                activeOpacity={0.7}
              >
                <Card style={styles.summaryCardInner}>
                  <Tag size={24} color={colors.success} />
                  <Text variant="h3" style={styles.summaryNumber}>
                    {preview.uniqueCategories.length}
                  </Text>
                  <Text variant="caption" color="secondary">{t('dataImport.labels.category')}</Text>
                  <ChevronRight size={14} color={colors.textMuted} style={styles.cardChevron} />
                </Card>
              </TouchableOpacity>
            </View>

            {/* Tarih Aralığı */}
            <Card style={styles.dateRangeCard}>
              <Text variant="label">{t('dataImport.preview.dateRange')}</Text>
              <Text variant="body" color="secondary">
                {preview.dateRange.min} → {preview.dateRange.max}
              </Text>
            </Card>

            {/* Atlanan Satır Bilgisi (varsa) */}
            {(preview.skippedEmptyRows > 0 || preview.skippedNoDateOrType > 0 || preview.skippedNoEntity > 0) && (
              <Card style={[styles.dateRangeCard, { backgroundColor: colors.warningLight }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Info size={16} color={colors.warning} style={{ marginRight: 6 }} />
                  <Text variant="label" color="warning">{t('dataImport.skippedRows.title')}</Text>
                </View>
                {preview.skippedEmptyRows > 0 && (
                  <Text variant="caption" color="secondary">
                    • {t('dataImport.skippedRows.emptyRows', { count: preview.skippedEmptyRows })}
                  </Text>
                )}
                {preview.skippedNoDateOrType > 0 && (
                  <Text variant="caption" color="secondary">
                    • {t('dataImport.skippedRows.noDateOrType', { count: preview.skippedNoDateOrType })}
                  </Text>
                )}
                {preview.skippedNoEntity > 0 && (
                  <Text variant="caption" color="secondary">
                    • {t('dataImport.skippedRows.noEntity', { count: preview.skippedNoEntity })}
                  </Text>
                )}
              </Card>
            )}

            {/* İşlem Tipleri */}
            <Card style={styles.typesCard}>
              <Text variant="label" style={styles.typesTitle}>{t('dataImport.labels.transactionTypes')}</Text>
              {Object.entries(preview.transactionTypes).map(([type, count]) => (
                <View key={type} style={styles.typeRow}>
                  <Text variant="body">{type}</Text>
                  <Text variant="body" color="secondary">{count}</Text>
                </View>
              ))}
            </Card>

            {/* Veri Kalitesi Özeti */}
            {validation && (
              <Card style={styles.validationCard}>
                <View style={styles.validationHeader}>
                  <Text variant="label">{t('dataImport.validation.title')}</Text>
                  <View style={[
                    styles.scoreBadge,
                    {
                      backgroundColor: validation.score >= 90 ? colors.success :
                        validation.score >= 70 ? colors.warning :
                        colors.error,
                    },
                  ]}>
                    <Text style={styles.scoreBadgeText}>{validation.score}%</Text>
                  </View>
                </View>

                {/* Progress bar showing quality */}
                <View style={styles.qualityBar}>
                  <View
                    style={[
                      styles.qualityBarFill,
                      {
                        width: `${validation.score}%`,
                        backgroundColor: validation.score >= 90 ? colors.success :
                          validation.score >= 70 ? colors.warning :
                          colors.error,
                      },
                    ]}
                  />
                </View>

                {/* Summary counts */}
                <View style={styles.validationSummary}>
                  <View style={styles.validationItem}>
                    <CheckCircle2 size={16} color={colors.success} />
                    <Text variant="caption" color="secondary">
                      {t('dataImport.validation.validTransactions', { count: validation.validCount })}
                    </Text>
                  </View>
                  {validation.warningCount > 0 && (
                    <View style={styles.validationItem}>
                      <Info size={16} color={colors.warning} />
                      <Text variant="caption" color="secondary">
                        {t('dataImport.validation.warningTransactions', { count: validation.warningCount })}
                      </Text>
                    </View>
                  )}
                  {validation.errorCount > 0 && (
                    <View style={styles.validationItem}>
                      <XCircle size={16} color={colors.error} />
                      <Text variant="caption" color="secondary">
                        {t('dataImport.validation.errorTransactions', { count: validation.errorCount })}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Categorized issues */}
                {validation.issues.length > 0 && (
                  <View style={styles.validationIssues}>
                    {validation.issues.slice(0, 3).map((issue, i) => (
                      <View key={i} style={styles.issueRow}>
                        <View style={styles.issueIcon}>
                          {issue.type === 'error' ? (
                            <XCircle size={14} color={colors.error} />
                          ) : issue.type === 'warning' ? (
                            <AlertTriangle size={14} color={colors.warning} />
                          ) : (
                            <Info size={14} color={colors.info} />
                          )}
                        </View>
                        <View style={styles.issueContent}>
                          <Text variant="caption" color={issue.type === 'error' ? 'error' : 'secondary'}>
                            {issue.message}
                          </Text>
                          {issue.suggestion && (
                            <Text variant="caption" color="muted" style={styles.issueSuggestion}>
                              {issue.suggestion}
                            </Text>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </Card>
            )}

            {/* Hatalar (eski stil - parse hataları) */}
            {preview.errors.length > 0 && (
              <Card style={styles.errorCard}>
                <View style={styles.errorHeader}>
                  <AlertTriangle size={20} color={colors.warning} />
                  <Text variant="label" style={styles.errorTitle}>
                    {t('dataImport.warnings.warningCount', { count: preview.errors.length })}
                  </Text>
                </View>
                {preview.errors.slice(0, 5).map((err, i) => (
                  <Text key={i} variant="caption" color="secondary">
                    • {translateError(err)}
                  </Text>
                ))}
              </Card>
            )}

            {/* Dry Run Butonu */}
            <Button
              variant="outline"
              onPress={handleDryRun}
              style={styles.dryRunButton}
            >
              {t('dataImport.dryRun.button')}
            </Button>

            <View style={styles.buttonRow}>
              <Button variant="outline" onPress={handleReset} style={styles.halfButton}>
                {t('common:buttons.cancel')}
              </Button>
              <Button
                variant="primary"
                onPress={() => handleStartImport(false)}
                style={styles.halfButton}
              >
                {t('dataImport.buttons.startImport')}
              </Button>
            </View>
          </View>
        )}

        {/* Step 3: Importing */}
        {step === 'importing' && (
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>

            <Text variant="h2" style={styles.title}>
              {t('dataImport.status.importing')}
            </Text>

            <Text variant="body" color="secondary" style={styles.description}>
              {progress.message}
            </Text>

            {/* Enhanced Progress Bar with Percentage */}
            <View style={styles.progressContainer}>
              <View style={styles.progressBarRow}>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${progress.percentage || (progress.total > 0 ? (progress.current / progress.total) * 100 : 0)}%`,
                      },
                    ]}
                  />
                </View>
                <Text variant="label" style={styles.progressPercentage}>
                  {progress.percentage || Math.round(progress.total > 0 ? (progress.current / progress.total) * 100 : 0)}%
                </Text>
              </View>
              <Text variant="caption" color="secondary" style={styles.progressText}>
                {progress.current.toLocaleString(i18n.language === 'tr' ? 'tr-TR' : 'en-US')} / {progress.total.toLocaleString(i18n.language === 'tr' ? 'tr-TR' : 'en-US')}
              </Text>

              {/* Speed and ETA */}
              {progress.phase === 'transactions' && progress.itemsPerSecond > 0 && (
                <View style={styles.progressStats}>
                  <Text variant="caption" color="muted">
                    {t('dataImport.progressStats.speed', { count: progress.itemsPerSecond })}
                  </Text>
                  {progress.estimatedTimeRemaining !== undefined && progress.estimatedTimeRemaining > 0 && (
                    <Text variant="caption" color="muted">
                      {t('dataImport.progressStats.remaining', { seconds: progress.estimatedTimeRemaining })}
                    </Text>
                  )}
                </View>
              )}
            </View>

            <Card style={styles.phaseCard}>
              <PhaseItemEnhanced
                label={t('dataImport.phases.categories')}
                active={progress.phase === 'categories'}
                done={['accounts', 'clients', 'personel', 'transactions', 'done'].includes(progress.phase)}
                count={progress.phaseDetails?.categories}
              />
              <PhaseItemEnhanced
                label={t('dataImport.phases.accounts')}
                active={progress.phase === 'accounts'}
                done={['clients', 'personel', 'transactions', 'done'].includes(progress.phase)}
                count={progress.phaseDetails?.accounts}
              />
              <PhaseItemEnhanced
                label={t('dataImport.phases.clients')}
                active={progress.phase === 'clients'}
                done={['personel', 'transactions', 'done'].includes(progress.phase)}
                count={progress.phaseDetails?.clients}
              />
              <PhaseItemEnhanced
                label={t('dataImport.phases.personel')}
                active={progress.phase === 'personel'}
                done={['transactions', 'done'].includes(progress.phase)}
                count={progress.phaseDetails?.personel}
              />
              <PhaseItemEnhanced
                label={t('dataImport.phases.transactions')}
                active={progress.phase === 'transactions'}
                done={progress.phase === 'done'}
                count={progress.phaseDetails?.transactions}
                showProgress={progress.phase === 'transactions'}
                current={progress.current}
                total={progress.total}
              />
            </Card>
          </View>
        )}

        {/* Step 4: Result */}
        {step === 'result' && result && (
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              {result.success ? (
                <CheckCircle2 size={64} color={isDryRun ? colors.info : colors.success} />
              ) : (
                <XCircle size={64} color={colors.error} />
              )}
            </View>

            <Text variant="h2" style={styles.title}>
              {isDryRun
                ? t('dataImport.dryRun.result')
                : result.success
                  ? t('dataImport.success.complete')
                  : t('dataImport.status.importFailed')}
            </Text>

            {isDryRun && (
              <Text variant="body" color="secondary" style={styles.description}>
                {t('dataImport.dryRun.description')}
              </Text>
            )}

            {result.success && (
              <View style={styles.resultGrid}>
                <ResultItem label={t('dataImport.results.category')} value={result.categoriesCreated} isDryRun={isDryRun} />
                <ResultItem label={t('dataImport.results.account')} value={result.accountsCreated} isDryRun={isDryRun} />
                <ResultItem label={t('dataImport.results.client')} value={result.clientsCreated} isDryRun={isDryRun} />
                <ResultItem label={t('dataImport.results.staff')} value={result.personelCreated} isDryRun={isDryRun} />
                <ResultItem label={t('dataImport.results.transaction')} value={result.transactionsCreated} isDryRun={isDryRun} />
              </View>
            )}

            {/* Row Summary - shows İşlem + Başlangıç Bakiyesi + Atlanan = Toplam */}
            {result.success && (result.startingBalancesApplied > 0 || result.totalRowsProcessed > 0) && (
              <Card style={styles.rowSummaryCard}>
                <View style={styles.rowSummaryRow}>
                  <Text variant="body" color="secondary">{t('dataImport.results.transaction')}</Text>
                  <Text variant="body" style={{ fontWeight: '600' }}>{result.transactionsCreated.toLocaleString()}</Text>
                </View>
                {result.startingBalancesApplied > 0 && (
                  <View style={styles.rowSummaryRow}>
                    <Text variant="body" color="secondary">{t('dataImport.results.startingBalance')}</Text>
                    <Text variant="body" style={{ fontWeight: '600', color: colors.info }}>{result.startingBalancesApplied.toLocaleString()}</Text>
                  </View>
                )}
                {result.startingBalancesUpdated > 0 && (
                  <View style={styles.rowSummaryRow}>
                    <Text variant="body" color="secondary">{t('dataImport.results.startingBalancesUpdated')}</Text>
                    <Text variant="body" style={{ fontWeight: '600', color: colors.success }}>{result.startingBalancesUpdated.toLocaleString()}</Text>
                  </View>
                )}
                {result.skipped > 0 && (
                  <View style={styles.rowSummaryRow}>
                    <Text variant="body" color="secondary">{t('dataImport.results.skipped')}</Text>
                    <Text variant="body" style={{ fontWeight: '600', color: colors.warning }}>{result.skipped.toLocaleString()}</Text>
                  </View>
                )}
                {preview?.silentlySkipped && preview.silentlySkipped.length > 0 && (
                  <TouchableOpacity
                    style={styles.rowSummaryRow}
                    onPress={() => setShowSilentlySkipped(!showSilentlySkipped)}
                  >
                    <Text variant="body" color="secondary">
                      {t('dataImport.silentlySkipped.title')} {showSilentlySkipped ? '▲' : '▼'}
                    </Text>
                    <Text variant="body" style={{ fontWeight: '600', color: colors.textMuted }}>
                      {preview.silentlySkipped.length.toLocaleString()}
                    </Text>
                  </TouchableOpacity>
                )}
                <View style={styles.rowSummaryDivider} />
                <View style={styles.rowSummaryRow}>
                  <Text variant="label">{t('dataImport.results.totalRows')}</Text>
                  <Text variant="label" style={{ fontWeight: '700' }}>{result.totalRowsProcessed.toLocaleString()}</Text>
                </View>
              </Card>
            )}

            {/* Silently Skipped Rows Details */}
            {preview?.silentlySkipped && preview.silentlySkipped.length > 0 && showSilentlySkipped && (
              <Card style={styles.silentlySkippedCard}>
                <View style={styles.silentlySkippedHeader}>
                  <AlertTriangle size={18} color={colors.textMuted} />
                  <Text variant="label" style={{ marginLeft: spacing.sm, color: colors.textMuted }}>
                    {t('dataImport.silentlySkipped.count', { count: preview.silentlySkipped.length })}
                  </Text>
                </View>
                <View style={styles.silentlySkippedList}>
                  {preview.silentlySkipped.slice(0, 20).map((item, idx) => (
                    <View key={idx} style={styles.silentlySkippedItem}>
                      <Text variant="caption" style={{ color: colors.textMuted, width: 70 }}>
                        {t('dataImport.silentlySkipped.row', { row: item.rowNumber })}
                      </Text>
                      <Text variant="caption" color="secondary" style={{ flex: 1 }}>
                        {item.reason === 'empty'
                          ? t('dataImport.silentlySkipped.empty')
                          : item.reason === 'no_date_or_type'
                            ? t('dataImport.silentlySkipped.noDateOrType')
                            : t('dataImport.silentlySkipped.noEntity')}
                      </Text>
                    </View>
                  ))}
                  {preview.silentlySkipped.length > 20 && (
                    <Text variant="caption" color="muted" style={{ textAlign: 'center', marginTop: spacing.sm }}>
                      +{preview.silentlySkipped.length - 20} more...
                    </Text>
                  )}
                </View>
              </Card>
            )}

            {/* Skipped Transactions Info Banner - No Fix/Skip buttons */}
            {result.skipped > 0 && result.skippedTransactions.length > 0 && (
              <Card style={styles.skippedCard}>
                <View style={styles.skippedHeader}>
                  <AlertTriangle size={20} color={colors.warning} />
                  <Text variant="label" style={{ color: colors.warning }}>
                    {t('dataImport.skipped.count', { count: result.skipped })}
                  </Text>
                </View>

                {/* Nedenlere göre gruplandırılmış özet */}
                <View style={styles.skippedReasons}>
                  {Object.entries(groupSkippedByReason(result.skippedTransactions)).map(([reason, count]) => (
                    <View key={reason} style={styles.skippedReasonItem}>
                      <Text variant="caption" color="secondary" style={{ flex: 1 }}>
                        • {reason}
                      </Text>
                      <Text variant="caption" style={{ color: colors.warning, fontWeight: '600' }}>
                        {count}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Info banner - direct to skipped tab */}
                <View style={styles.skippedInfoBanner}>
                  <Info size={16} color={colors.info} />
                  <Text variant="caption" style={{ color: colors.info, flex: 1, marginLeft: spacing.sm }}>
                    {t('dataImport.skippedTransactions.infoMessage')}
                  </Text>
                </View>

                {/* Actions - View details and Export only */}
                <View style={styles.skippedActions}>
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() => setActiveModal('skipped')}
                    style={{ flex: 1, marginRight: spacing.sm }}
                  >
                    {t('dataImport.buttons.viewDetails')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<Download size={16} color={colors.primary} />}
                    onPress={handleExportSkipped}
                    style={{ flex: 1 }}
                  >
                    {t('dataImport.buttons.downloadExcel')}
                  </Button>
                </View>

                {/* Go to Skipped Tab Button */}
                <Button
                  variant="primary"
                  size="sm"
                  onPress={() => setActiveTab('skipped')}
                  style={{ marginTop: spacing.md }}
                >
                  {t('dataImport.skippedTransactions.goToSkipped')}
                </Button>
              </Card>
            )}

            {result.errors.length > 0 && (
              <Card style={styles.errorCard}>
                <Text variant="label" style={styles.errorTitle}>{t('dataImport.errors.title')}</Text>
                {result.errors.slice(0, 5).map((err, i) => (
                  <Text key={i} variant="caption" color="error">
                    • {translateError(err)}
                  </Text>
                ))}
                {result.errors.length > 5 && (
                  <Text variant="caption" color="secondary">
                    {t('dataImport.errors.moreErrors', { count: result.errors.length - 5 })}
                  </Text>
                )}
              </Card>
            )}

            {isDryRun ? (
              <>
                <Button
                  variant="primary"
                  onPress={() => handleStartImport(false)}
                  style={styles.doneButton}
                >
                  {t('dataImport.buttons.startRealImport')}
                </Button>
                <Button variant="outline" onPress={handleReset} style={styles.retryButton}>
                  {t('common:buttons.cancel')}
                </Button>
              </>
            ) : (
              <>
                <Button variant="primary" onPress={() => router.back()} style={styles.doneButton}>
                  {t('common:buttons.ok')}
                </Button>
                {!result.success && (
                  <Button variant="outline" onPress={handleReset} style={styles.retryButton}>
                    {t('common:buttons.retry')}
                  </Button>
                )}
              </>
            )}
          </View>
        )}
        </ScrollView>
      )}

        {/* Modals */}
        {renderModal()}

        {/* Pending Transaction Form */}
        <PendingTransactionForm
          visible={showPendingForm}
          onDismiss={() => {
            setShowPendingForm(false);
            setSelectedPendingItem(null);
          }}
          pendingIslem={selectedPendingItem}
          onSuccess={handlePendingFormSuccess}
        />
    </SafeAreaView>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PhaseItem({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <View style={styles.phaseItem}>
      {done ? (
        <CheckCircle2 size={20} color={colors.success} />
      ) : active ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <View style={styles.phaseCircle} />
      )}
      <Text
        variant="body"
        style={{ color: done ? colors.success : active ? colors.primary : colors.textMuted }}
      >
        {label}
      </Text>
    </View>
  );
}

// Enhanced phase item with count and progress
function PhaseItemEnhanced({
  label,
  active,
  done,
  count,
  showProgress = false,
  current,
  total,
}: {
  label: string;
  active: boolean;
  done: boolean;
  count?: number;
  showProgress?: boolean;
  current?: number;
  total?: number;
}) {
  return (
    <View style={styles.phaseItem}>
      {done ? (
        <CheckCircle2 size={20} color={colors.success} />
      ) : active ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <View style={styles.phaseCircle} />
      )}
      <View style={styles.phaseItemContent}>
        <Text
          variant="body"
          style={{ color: done ? colors.success : active ? colors.primary : colors.textMuted }}
        >
          {label}
        </Text>
        {(done || active) && count !== undefined && count > 0 && (
          <Text variant="caption" color="muted" style={styles.phaseCount}>
            {showProgress && current !== undefined && total !== undefined
              ? `(${current.toLocaleString()} / ${total.toLocaleString()})`
              : `(${count.toLocaleString()})`}
          </Text>
        )}
      </View>
    </View>
  );
}

function ResultItem({ label, value, isDryRun = false }: { label: string; value: number; isDryRun?: boolean }) {
  return (
    <Card style={styles.resultCard}>
      <Text variant="h3" style={[styles.resultValue, isDryRun && { color: colors.info }]}>
        {value.toLocaleString(i18n.language === 'tr' ? 'tr-TR' : 'en-US')}
      </Text>
      <Text variant="caption" color="secondary">{label}</Text>
    </Card>
  );
}

// İşlem satırı
function TransactionItem({ transaction }: { transaction: ParsedTransaction }) {
  // Tarih formatından tarih ve saati al: "2024-01-15" veya "2024-01-15T10:30:00"
  const [datePart, timePart] = transaction.date.split('T');
  const time = timePart ? timePart.slice(0, 5) : ''; // HH:mm
  const formattedDateTime = time ? `${datePart} ${time}` : datePart;

  // İlgili kişi/hesap bilgisi
  const relatedEntity = transaction.personel
    || transaction.tedarikci
    || transaction.musteri
    || transaction.karsiHesap
    || '';

  return (
    <View style={styles.listItem}>
      <View style={styles.listItemLeft}>
        <Text variant="caption" color="muted">{formattedDateTime}</Text>
        <Text variant="body" numberOfLines={1}>{transaction.description || '-'}</Text>
        <Text variant="caption" color="secondary">
          {transaction.type || '-'} • {transaction.account || '-'}
          {relatedEntity ? ` → ${relatedEntity}` : ''}
        </Text>
        {transaction.category && (
          <View style={styles.categoryBadge}>
            <Tag size={10} color={colors.primary} />
            <Text variant="caption" color="primary" style={{ marginLeft: 4 }}>
              {transaction.category}
            </Text>
          </View>
        )}
      </View>
      <Text
        variant="body"
        style={{
          color: transaction.isExpense ? colors.expense : colors.income,
          fontWeight: '600',
        }}
      >
        {transaction.isExpense ? '-' : '+'}{transaction.amount.toLocaleString(i18n.language === 'tr' ? 'tr-TR' : 'en-US')}
      </Text>
    </View>
  );
}

// Simple skipped transaction item (no buttons - for result modal)
function SkippedTransactionItemSimple({ item }: { item: SkippedTransaction }) {
  const { t } = useTranslation('settings');
  const { transaction, reason, rowNumber } = item;

  // Tarih formatından tarih ve saati al
  const [datePart, timePart] = transaction.date.split('T');
  const time = timePart ? timePart.slice(0, 5) : '';
  const formattedDateTime = time ? `${datePart} ${time}` : datePart;

  return (
    <View style={styles.skippedItem}>
      {/* Satır numarası ve tarih */}
      <View style={styles.skippedItemHeader}>
        <View style={styles.rowNumberBadge}>
          <Text variant="caption" style={{ color: colors.warning, fontWeight: '600' }}>
            {t('dataImport.labels.row')} {rowNumber}
          </Text>
        </View>
        <Text variant="caption" color="muted">{formattedDateTime}</Text>
      </View>

      {/* Açıklama ve işlem bilgisi */}
      <Text variant="body" numberOfLines={1} style={{ marginBottom: 4 }}>
        {transaction.description || '-'}
      </Text>
      <Text variant="caption" color="secondary">
        {transaction.type || '-'} • {transaction.account || '-'}
        {transaction.personel ? ` • ${transaction.personel}` : ''}
        {transaction.tedarikci ? ` • ${transaction.tedarikci}` : ''}
        {transaction.musteri ? ` • ${transaction.musteri}` : ''}
        {transaction.karsiHesap ? ` → ${transaction.karsiHesap}` : ''}
      </Text>

      {/* Miktar */}
      <Text
        variant="body"
        style={{
          color: transaction.isExpense ? colors.expense : colors.income,
          fontWeight: '600',
          marginTop: 4,
        }}
      >
        {transaction.isExpense ? '-' : '+'}{transaction.amount.toLocaleString(i18n.language === 'tr' ? 'tr-TR' : 'en-US')}
      </Text>

      {/* Atlanma nedeni */}
      <View style={styles.skipReasonContainer}>
        <AlertTriangle size={14} color={colors.warning} />
        <Text variant="caption" style={{ color: colors.warning, flex: 1, marginLeft: 6 }}>
          {reason}
        </Text>
      </View>
    </View>
  );
}

// Hesap satırı
function AccountItem({
  name,
  mapping,
  onToggleType,
  onSubTypeChange,
  onCurrencyChange,
}: {
  name: string;
  mapping: AccountMapping;
  onToggleType: () => void;
  onSubTypeChange: (subType: string) => void;
  onCurrencyChange: () => void;
}) {
  const { t } = useTranslation('settings');
  return (
    <View style={styles.accountItem}>
      <View style={styles.accountHeader}>
        <View style={[styles.accountIconContainer, { backgroundColor: colors.infoLight }]}>
          <Building2 size={20} color={colors.info} />
        </View>
        <View style={styles.accountInfo}>
          <Text variant="body" numberOfLines={1}>{name}</Text>
          <View style={styles.accountBadgeRow}>
            <View style={[styles.typeBadge, { backgroundColor: colors.infoLight }]}>
              <Text variant="caption" style={{ color: colors.info, fontWeight: '600' }}>{t('dataImport.badges.account')}</Text>
            </View>
            {/* Currency badge - tıklanabilir */}
            {mapping.currency && (
              <TouchableOpacity
                onPress={onCurrencyChange}
                style={[styles.typeBadge, { backgroundColor: colors.primaryLight, marginLeft: 4 }]}
              >
                <Text variant="caption" style={{ color: colors.primary, fontWeight: '600' }}>{mapping.currency}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <TouchableOpacity onPress={onToggleType} style={styles.toggleButton}>
          <ArrowLeftRight size={14} color={colors.primary} />
          <Text variant="caption" style={{ color: colors.primary, fontWeight: '600' }}>{t('dataImport.buttons.convertToClient')}</Text>
        </TouchableOpacity>
      </View>

      {/* Alt tip seçimi */}
      <View style={styles.subTypeRow}>
        {HESAP_TYPE_VALUES.map((typeValue) => (
          <TouchableOpacity
            key={typeValue}
            style={[
              styles.subTypeChip,
              mapping.hesapType === typeValue && styles.subTypeChipActive,
            ]}
            onPress={() => onSubTypeChange(typeValue)}
          >
            <Text
              variant="caption"
              style={{
                color: mapping.hesapType === typeValue ? colors.info : colors.textSecondary,
                fontWeight: mapping.hesapType === typeValue ? '600' : '400',
              }}
            >
              {t(`dataImport.accountTypes.${typeValue}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// Cari/Personel satırı
function ClientPersonelItem({
  name,
  mapping,
  onToggleToHesap,
  onToggleEntityType,
  onSubTypeChange,
}: {
  name: string;
  mapping: AccountMapping;
  onToggleToHesap: () => void;
  onToggleEntityType: (type: 'cari' | 'personel') => void;
  onSubTypeChange: (subType: string) => void;
}) {
  const { t } = useTranslation('settings');
  const isPersonel = mapping.type === 'personel';
  const iconColor = isPersonel ? colors.success : colors.warning;
  const iconBgColor = isPersonel ? colors.successLight : colors.warningLight;
  const Icon = isPersonel ? UserRound : Users;
  const typeLabel = isPersonel ? t('dataImport.badges.staff') : t('dataImport.badges.client');

  return (
    <View style={styles.accountItem}>
      <View style={styles.accountHeader}>
        <View style={[styles.accountIconContainer, { backgroundColor: iconBgColor }]}>
          <Icon size={20} color={iconColor} />
        </View>
        <View style={styles.accountInfo}>
          <Text variant="body" numberOfLines={1}>{name}</Text>
          <View style={styles.accountBadgeRow}>
            <View style={[styles.typeBadge, { backgroundColor: iconBgColor }]}>
              <Text variant="caption" style={{ color: iconColor, fontWeight: '600' }}>{typeLabel}</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity onPress={onToggleToHesap} style={styles.toggleButton}>
          <ArrowLeftRight size={14} color={colors.primary} />
          <Text variant="caption" style={{ color: colors.primary, fontWeight: '600' }}>{t('dataImport.buttons.convertToAccount')}</Text>
        </TouchableOpacity>
      </View>

      {/* Entity tipi seçimi (Cari vs Personel) */}
      <View style={styles.subTypeRow}>
        {ENTITY_TYPE_VALUES.map((typeValue) => (
          <TouchableOpacity
            key={typeValue}
            style={[
              styles.subTypeChip,
              mapping.type === typeValue && (typeValue === 'personel' ? styles.subTypeChipActiveSuccess : styles.subTypeChipActiveWarning),
            ]}
            onPress={() => onToggleEntityType(typeValue as 'cari' | 'personel')}
          >
            <Text
              variant="caption"
              style={{
                color: mapping.type === typeValue ? (typeValue === 'personel' ? colors.success : colors.warning) : colors.textSecondary,
                fontWeight: mapping.type === typeValue ? '600' : '400',
              }}
            >
              {t(`dataImport.entityTypes.${typeValue}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Cari alt tip seçimi (sadece cari tipinde göster) */}
      {!isPersonel && (
        <View style={[styles.subTypeRow, { marginTop: spacing.xs }]}>
          {CARI_TYPE_VALUES.map((typeValue) => (
            <TouchableOpacity
              key={typeValue}
              style={[
                styles.subTypeChipSmall,
                mapping.cariType === typeValue && styles.subTypeChipActiveWarning,
              ]}
              onPress={() => onSubTypeChange(typeValue)}
            >
              <Text
                variant="caption"
                style={{
                  color: mapping.cariType === typeValue ? colors.warning : colors.textSecondary,
                  fontWeight: mapping.cariType === typeValue ? '600' : '400',
                  fontSize: 11,
                }}
              >
                {t(`dataImport.clientTypes.${typeValue}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// Kategori satırı - tip göster ve değiştirilebilir
function CategoryItem({
  name,
  categoryType,
  onToggleType,
  t,
}: {
  name: string;
  categoryType: 'gelir' | 'gider';
  onToggleType: () => void;
  t: (key: string) => string;
}) {
  const isGelir = categoryType === 'gelir';
  return (
    <View style={styles.categoryItem}>
      <View style={styles.categoryItemLeft}>
        <View style={[
          styles.categoryIconContainer,
          { backgroundColor: isGelir ? colors.successLight : colors.errorLight },
        ]}>
          {isGelir ? (
            <ArrowUpRight size={20} color={colors.success} />
          ) : (
            <ArrowDownLeft size={20} color={colors.error} />
          )}
        </View>
        <View style={styles.categoryItemInfo}>
          <Text variant="body" numberOfLines={1}>{name}</Text>
          <Text variant="caption" color="secondary">
            {isGelir ? t('dataImport.categoryTypes.income') : t('dataImport.categoryTypes.expense')}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={[
          styles.categoryTypeButton,
          { backgroundColor: isGelir ? colors.successLight : colors.errorLight },
        ]}
        onPress={onToggleType}
        activeOpacity={0.7}
      >
        <Text style={{
          fontSize: 12,
          fontWeight: '600',
          color: isGelir ? colors.success : colors.error,
        }}>
          {isGelir ? t('dataImport.badges.income') : t('dataImport.badges.expense')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
  },
  // Tab styles
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  tabText: {
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primary,
  },
  tabBadge: {
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
  },
  tabBadgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  // Skipped tab styles
  skippedContent: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  descriptionContainer: {
    marginBottom: spacing.md,
  },
  deleteAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3xl'],
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    marginTop: spacing.xl,
  },
  title: {
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  description: {
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  tapHint: {
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  infoCard: {
    marginBottom: spacing.lg,
  },
  infoTitle: {
    marginBottom: spacing.sm,
  },
  typesList: {
    gap: 2,
  },
  stepCard: {
    marginBottom: spacing.md,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  stepInfo: {
    flex: 1,
  },
  stepButton: {
    marginTop: spacing.xs,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  summaryCardTouchable: {
    flex: 1,
    minWidth: '45%',
  },
  summaryCardInner: {
    alignItems: 'center',
    padding: spacing.md,
    position: 'relative',
  },
  summaryNumber: {
    marginTop: spacing.sm,
  },
  cardChevron: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
  },
  dateRangeCard: {
    marginBottom: spacing.md,
  },
  typesCard: {
    marginBottom: spacing.md,
  },
  typesTitle: {
    marginBottom: spacing.sm,
  },
  typeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  validationCard: {
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  validationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  scoreBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  scoreBadgeText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '700',
  },
  qualityBar: {
    height: 6,
    backgroundColor: colors.surfaceLight,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  qualityBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  validationSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  validationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  validationIssues: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  issueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  issueIcon: {
    marginTop: 2,
  },
  issueContent: {
    flex: 1,
  },
  issueSuggestion: {
    marginTop: 2,
    fontStyle: 'italic',
  },
  errorCard: {
    backgroundColor: colors.errorLight,
    marginBottom: spacing.md,
  },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  errorTitle: {
    color: colors.warning,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  halfButton: {
    flex: 1,
  },
  progressContainer: {
    marginBottom: spacing.xl,
  },
  progressBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: colors.surfaceLight,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressPercentage: {
    minWidth: 45,
    textAlign: 'right',
    color: colors.primary,
    fontWeight: '600',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  progressText: {
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  progressStats: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginTop: spacing.xs,
  },
  phaseCard: {
    gap: spacing.md,
  },
  phaseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  phaseItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  phaseCount: {
    marginLeft: spacing.sm,
  },
  phaseCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
  },
  resultGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  resultCard: {
    flex: 1,
    minWidth: '45%',
    alignItems: 'center',
    padding: spacing.md,
  },
  resultValue: {
    color: colors.success,
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningLight,
    marginBottom: spacing.md,
  },
  // Row summary card styles (İşlem + Başlangıç Bakiyesi + Atlanan = Toplam)
  rowSummaryCard: {
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  rowSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  rowSummaryDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  // Silently skipped rows card styles
  silentlySkippedCard: {
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceLight,
  },
  silentlySkippedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  silentlySkippedList: {
    gap: spacing.xs,
  },
  silentlySkippedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  // Skipped transactions card styles
  skippedCard: {
    backgroundColor: colors.warningLight,
    marginBottom: spacing.md,
  },
  skippedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  skippedReasons: {
    marginBottom: spacing.md,
  },
  skippedReasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  skippedInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.infoLight,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  skippedActions: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.warning + '30',
  },
  // Skipped transaction item styles
  skippedItem: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.warningLight + '30',
  },
  skippedItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  rowNumberBadge: {
    backgroundColor: colors.warning + '20',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  skipReasonContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.warning + '15',
    borderRadius: borderRadius.md,
  },
  dryRunButton: {
    marginBottom: spacing.md,
    borderColor: colors.info,
  },
  doneButton: {
    marginTop: spacing.lg,
  },
  retryButton: {
    marginTop: spacing.md,
  },

  // Modal Styles (CategoryPicker standardına uygun)
  modalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    marginTop: 'auto',
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    padding: spacing.xs,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: spacing.xs,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3xl'],
  },
  emptyText: {
    marginTop: spacing.md,
    textAlign: 'center',
  },
  footerText: {
    textAlign: 'center',
    paddingVertical: spacing.md,
  },

  // List Item Styles (İşlemler için)
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceLighter,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  listItemLeft: {
    flex: 1,
    marginRight: spacing.md,
  },

  // Account/Client Item Styles
  accountItem: {
    backgroundColor: colors.surfaceLighter,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  accountIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountInfo: {
    flex: 1,
    gap: 2,
  },
  accountBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  accountName: {
    flex: 1,
  },
  typeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight + '30',
  },
  subTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  subTypeChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  subTypeChipActive: {
    backgroundColor: colors.infoLight,
    borderColor: colors.info,
  },
  subTypeChipActiveWarning: {
    backgroundColor: colors.warningLight,
    borderColor: colors.warning,
  },
  subTypeChipActiveSuccess: {
    backgroundColor: colors.successLight,
    borderColor: colors.success,
  },
  subTypeChipSmall: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Category Item Styles
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceLighter,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  categoryItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    backgroundColor: colors.successLight,
  },
  categoryItemInfo: {
    flex: 1,
  },
  categoryTypeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    marginLeft: spacing.sm,
  },
  categoryHint: {
    backgroundColor: colors.infoLight,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
});
