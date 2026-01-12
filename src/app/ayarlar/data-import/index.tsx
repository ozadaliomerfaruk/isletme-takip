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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
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
} from 'lucide-react-native';
import { Text, Card, Button } from '@/components/ui';
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
} from '@/lib/excelImport';
import { useDataImport, SkippedTransaction, DuplicateInfo } from '@/hooks/useDataImport';
import { useImportHistory } from '@/hooks/useImportHistory';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateRelatedQueries } from '@/lib/queryKeys';

type Step = 'select' | 'preview' | 'mapping' | 'importing' | 'result';
type ModalType = 'transactions' | 'accounts' | 'clients' | 'categories' | 'categoryTypes' | 'skipped' | null;

// Hesap alt tipleri
const HESAP_TYPES = [
  { value: 'banka', label: 'Banka' },
  { value: 'nakit', label: 'Nakit / Kasa' },
  { value: 'kredi_karti', label: 'Kredi Kartı' },
  { value: 'diger', label: 'Diğer' },
] as const;

// Cari alt tipleri
const CARI_TYPES = [
  { value: 'musteri', label: 'Müşteri' },
  { value: 'tedarikci', label: 'Tedarikçi' },
] as const;

// Entity tipleri (Cari/Personel seçimi için)
const ENTITY_TYPES = [
  { value: 'cari', label: 'Cari' },
  { value: 'personel', label: 'Personel' },
] as const;

export default function VeriIceAktarPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get('window').height;
  const { t } = useTranslation('settings');
  const queryClient = useQueryClient();
  const { progress, result, duplicates, runImport, runDuplicateCheck, reset } = useDataImport();
  const { lastImport, isUndoing, checkFileHash, saveImportHistory, undoLastImport } = useImportHistory();

  const [step, setStep] = useState<Step>('select');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [accountMappings, setAccountMappings] = useState<Record<string, AccountMapping>>({});
  const [categoryMappings, setCategoryMappings] = useState<Record<string, 'gelir' | 'gider'>>({});
  const [fileName, setFileName] = useState<string>('');
  const [fileHash, setFileHash] = useState<string>('');
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [isDryRun, setIsDryRun] = useState(false);

  // Modal state
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Şablon Excel dosyası oluştur ve indir
  const handleDownloadTemplate = async () => {
    try {
      setDownloadingTemplate(true);

      // Şablon verisi - Yeni format: PERSONEL, TEDARİKÇİ, MÜŞTERİ ayrı kolonlar
      const templateData = [
        ['TARIH', 'İŞLEM TIPI', 'AÇIKLAMA', 'KATEGORİ', 'HESAP', 'PERSONEL', 'TEDARİKÇİ', 'MÜŞTERİ', 'KARŞI HESAP', 'MİKTAR', 'BİRİM'],
        ['2024-01-15 10:30', 'GELİR', 'Satış geliri', 'SATIŞ', 'Banka Hesabı', '', 'CİRO', '', '', '5000', 'TRY'],
        ['2024-01-15 14:00', 'GİDER', 'Ofis malzemesi', 'OFİS GİDERLERİ', 'Nakit', 'Ahmet Yılmaz', '', '', '', '-250', 'TRY'],
        ['2024-01-16 09:00', 'ÖDEME', 'Tedarikçi ödemesi', '', 'Banka Hesabı', '', 'ABC Tedarik', '', '', '-10000', 'TRY'],
        ['2024-01-16 11:30', 'TAHSİLAT', 'Müşteri tahsilatı', '', 'Banka Hesabı', '', '', 'XYZ Müşteri', '', '15000', 'TRY'],
        ['2024-01-17 08:00', 'TRANSFER', 'Hesaplar arası', '', 'Banka Hesabı', '', '', '', 'Nakit', '-2000', 'TRY'],
        ['2024-01-17 16:00', 'PERSONEL GİDERİ', 'Maaş ödemesi', 'MAAŞ', 'Banka Hesabı', 'Mehmet Demir', '', '', '', '-8500', 'TRY'],
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

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'İşlemler');

      // Base64'e çevir
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

      // Dosyayı kaydet
      const fileUri = FileSystem.cacheDirectory + 'import_sablonu.xlsx';
      await FileSystem.writeAsStringAsync(fileUri, wbout, {
        encoding: 'base64',
      });

      // Paylaş (indir)
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Excel Şablonunu İndir',
        });
      } else {
        Alert.alert('Hata', 'Bu cihazda dosya paylaşımı desteklenmiyor.');
      }
    } catch (error) {
      if (__DEV__) console.error('Template download error:', error);
      Alert.alert('Hata', 'Şablon indirilemedi. Lütfen tekrar deneyin.');
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
        const importDate = new Date(existingImport.importedAt).toLocaleDateString('tr-TR');
        Alert.alert(
          t('dataImport.duplicateFile.title'),
          t('dataImport.duplicateFile.message', {
            fileName: existingImport.fileName,
            date: importDate,
          }),
          [
            { text: 'İptal', style: 'cancel' },
            { text: 'Devam', onPress: () => proceedWithParsing(buffer, file.name) },
          ]
        );
        return;
      }

      // Normal akışla devam
      proceedWithParsing(buffer, file.name);
    } catch (error) {
      if (__DEV__) console.error('File select error:', error);
      Alert.alert('Hata', 'Dosya okunamadı. Lütfen geçerli bir Excel dosyası seçin.');
    }
  };

  // Dosya parse işlemi
  const proceedWithParsing = (buffer: ArrayBuffer, name: string) => {
    try {
      // Parse et
      const parsed = parseExcelFile(buffer);
      setPreview(parsed);

      // Otomatik hesap/cari/personel sınıflandırması
      const mappings = autoClassifyAccounts(parsed);
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
          'Uyarı',
          `Dosya okundu ama ${parsed.errors.length} hata var. Devam etmek istiyor musunuz?`,
          [
            { text: 'İptal', style: 'cancel' },
            { text: 'Devam', onPress: () => setStep('preview') },
          ]
        );
      } else {
        setStep('preview');
      }
    } catch (error) {
      if (__DEV__) console.error('Parse error:', error);
      Alert.alert('Hata', 'Dosya parse edilemedi.');
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
  const setHesapSubType = (name: string, hesapType: 'nakit' | 'banka' | 'kredi_karti' | 'diger') => {
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
          { text: 'İptal', style: 'cancel' },
          {
            text: t('dataImport.duplicateTransactions.skipOption'),
            onPress: () => proceedWithImport(dryRun, true),
          },
          {
            text: 'Yine de Devam',
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

    setStep('importing');
    const importResult = await runImport(preview, accountMappings, {
      dryRun,
      skipDuplicates,
      categoryMappings, // Kategori tiplerini geçir
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
    }

    setStep('result');
  };

  // Son importu geri al
  const handleUndoLastImport = () => {
    if (!lastImport) return;

    // Silinecek entity'leri say
    const totalItems =
      lastImport.transactionIds.length +
      (lastImport.createdCategoryIds?.length || 0) +
      (lastImport.createdAccountIds?.length || 0) +
      (lastImport.createdClientIds?.length || 0) +
      (lastImport.createdPersonelIds?.length || 0);

    const details = [];
    if (lastImport.transactionIds.length > 0) {
      details.push(`${lastImport.transactionIds.length} işlem`);
    }
    if (lastImport.createdAccountIds?.length) {
      details.push(`${lastImport.createdAccountIds.length} hesap`);
    }
    if (lastImport.createdClientIds?.length) {
      details.push(`${lastImport.createdClientIds.length} cari`);
    }
    if (lastImport.createdPersonelIds?.length) {
      details.push(`${lastImport.createdPersonelIds.length} personel`);
    }
    if (lastImport.createdCategoryIds?.length) {
      details.push(`${lastImport.createdCategoryIds.length} kategori`);
    }

    Alert.alert(
      'Son İmportu Geri Al',
      `"${lastImport.fileName}" dosyasından eklenen tüm veriler silinecek:\n\n${details.join('\n')}\n\nBu işlem geri alınamaz. Devam etmek istiyor musunuz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Tümünü Sil',
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
                deletedDetails.push(`${deletedEntities.transactions} işlem`);
              }
              if (deletedEntities.accounts > 0) {
                deletedDetails.push(`${deletedEntities.accounts} hesap`);
              }
              if (deletedEntities.clients > 0) {
                deletedDetails.push(`${deletedEntities.clients} cari`);
              }
              if (deletedEntities.personel > 0) {
                deletedDetails.push(`${deletedEntities.personel} personel`);
              }
              if (deletedEntities.categories > 0) {
                deletedDetails.push(`${deletedEntities.categories} kategori`);
              }

              Alert.alert(
                'Başarılı',
                `Import tamamen geri alındı:\n\n${deletedDetails.join('\n')}`
              );
            } else {
              Alert.alert('Hata', result.error || 'Geri alma başarısız');
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
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

      const filePath = `${FileSystem.cacheDirectory}atlanan_islemler.xlsx`;
      await FileSystem.writeAsStringAsync(filePath, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Atlanan İşlemleri Kaydet',
        });
      } else {
        Alert.alert('Hata', 'Dosya paylaşımı bu cihazda desteklenmiyor');
      }
    } catch (error) {
      if (__DEV__) console.error('Export error:', error);
      Alert.alert('Hata', 'Dosya oluşturulurken bir hata oluştu');
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
      t.account.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.type.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [preview, searchQuery]);

  // Modal render
  const renderModal = () => {
    if (!activeModal) return null;

    const getModalTitle = () => {
      switch (activeModal) {
        case 'transactions': return `İşlemler (${preview?.totalRows || 0})`;
        case 'accounts': return `Hesaplar (${countByType('hesap')})`;
        case 'clients': return `Cari/Personel (${countCariAndPersonel})`;
        case 'categories': return `Kategoriler (${preview?.uniqueCategories.length || 0})`;
        case 'skipped': return `Atlanan İşlemler (${result?.skipped || 0})`;
        default: return '';
      }
    };

    const getSearchPlaceholder = () => {
      switch (activeModal) {
        case 'transactions': return 'İşlem ara...';
        case 'accounts': return 'Hesap ara...';
        case 'clients': return 'Cari veya personel ara...';
        case 'categories': return 'Kategori ara...';
        case 'skipped': return 'Atlanan işlem ara...';
        default: return 'Ara...';
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
                            İşlem bulunamadı
                          </Text>
                        </View>
                      )}
                      {preview && preview.totalRows > 100 && filteredTransactions.length > 0 && (
                        <Text variant="caption" color="muted" style={styles.footerText}>
                          İlk 100 işlem gösteriliyor ({preview.totalRows} toplam)
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
                          onSubTypeChange={(subType) => setHesapSubType(item.name, subType as any)}
                        />
                      ))}
                      {filteredAccounts.length === 0 && (
                        <View style={styles.emptyState}>
                          <Building2 size={48} color={colors.textMuted} />
                          <Text variant="body" color="secondary" style={styles.emptyText}>
                            Hesap bulunamadı
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
                          onSubTypeChange={(subType) => setCariSubType(item.name, subType as any)}
                        />
                      ))}
                      {filteredClientsAndPersonel.length === 0 && (
                        <View style={styles.emptyState}>
                          <Users size={48} color={colors.textMuted} />
                          <Text variant="body" color="secondary" style={styles.emptyText}>
                            Cari veya personel bulunamadı
                          </Text>
                        </View>
                      )}
                    </>
                  )}

                  {activeModal === 'categories' && (
                    <>
                      <View style={styles.categoryHint}>
                        <Text variant="caption" color="secondary">
                          Dokunarak kategori tipini değiştirebilirsiniz (Gelir ↔ Gider)
                        </Text>
                      </View>
                      {filteredCategories.map((item) => (
                        <CategoryItem
                          key={item}
                          name={item}
                          categoryType={categoryMappings[item] || 'gider'}
                          onToggleType={() => toggleCategoryType(item)}
                        />
                      ))}
                      {filteredCategories.length === 0 && (
                        <View style={styles.emptyState}>
                          <Tag size={48} color={colors.textMuted} />
                          <Text variant="body" color="secondary" style={styles.emptyText}>
                            Kategori bulunamadı
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
                          item.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.transaction.account.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.transaction.description?.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((item, index) => (
                          <SkippedTransactionItem key={index} item={item} />
                        ))}
                      {result.skippedTransactions.filter(item =>
                        !searchQuery ||
                        item.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        item.transaction.account.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        item.transaction.description?.toLowerCase().includes(searchQuery.toLowerCase())
                      ).length === 0 && (
                        <View style={styles.emptyState}>
                          <AlertTriangle size={48} color={colors.textMuted} />
                          <Text variant="body" color="secondary" style={styles.emptyText}>
                            Atlanan işlem bulunamadı
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

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Step 1: Dosya Seçimi */}
        {step === 'select' && (
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <FileSpreadsheet size={64} color={colors.primary} />
            </View>

            <Text variant="h2" style={styles.title}>
              Veri İçe Aktar
            </Text>

            <Text variant="body" color="secondary" style={styles.description}>
              Başka bir uygulamadan veya Excel dosyasından verilerinizi kolayca aktarın.
              İşlemler, hesaplar, cariler ve kategoriler otomatik olarak oluşturulacak.
            </Text>

            {/* Adım 1: Şablon İndir */}
            <Card style={styles.stepCard}>
              <View style={styles.stepHeader}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>1</Text>
                </View>
                <View style={styles.stepInfo}>
                  <Text variant="label">Şablon İndir (Opsiyonel)</Text>
                  <Text variant="caption" color="secondary">
                    Excel formatını görmek veya manuel veri girmek için şablonu indirin
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
                Örnek Şablon İndir
              </Button>
            </Card>

            {/* Adım 2: Dosya Seç */}
            <Card style={styles.stepCard}>
              <View style={styles.stepHeader}>
                <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.stepNumberText, { color: colors.surface }]}>2</Text>
                </View>
                <View style={styles.stepInfo}>
                  <Text variant="label">Excel Dosyası Seç</Text>
                  <Text variant="caption" color="secondary">
                    Doldurduğunuz Excel dosyasını veya başka uygulamadan aldığınız dosyayı seçin
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
                Dosya Seç
              </Button>
            </Card>

            {/* İşlem Tipleri Bilgisi */}
            <Card style={styles.infoCard}>
              <Text variant="label" style={styles.infoTitle}>
                Desteklenen İşlem Tipleri
              </Text>
              <View style={styles.typesList}>
                <Text variant="caption" color="secondary">• GELİR - Gelir işlemleri</Text>
                <Text variant="caption" color="secondary">• GİDER - Gider işlemleri</Text>
                <Text variant="caption" color="secondary">• ÖDEME - Cari ödemeleri</Text>
                <Text variant="caption" color="secondary">• TAHSİLAT - Cari tahsilatları</Text>
                <Text variant="caption" color="secondary">• TRANSFER - Hesaplar arası transfer</Text>
                <Text variant="caption" color="secondary">• PERSONEL GİDERİ - Personel ödemeleri</Text>
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
                    <Text variant="label">Son İmportu Geri Al</Text>
                    <Text variant="caption" color="secondary">
                      {lastImport.fileName} - {lastImport.transactionIds.length} işlem
                    </Text>
                    <Text variant="caption" color="muted">
                      {new Date(lastImport.importedAt).toLocaleDateString('tr-TR', {
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
                  <Text style={{ color: colors.warning }}>Geri Al</Text>
                </Button>
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
              Dosya Analiz Edildi
            </Text>

            <Text variant="body" color="secondary" style={styles.description}>
              {fileName}
            </Text>

            <Text variant="caption" color="muted" style={styles.tapHint}>
              Detayları görmek için kartlara dokunun
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
                    {preview.totalRows.toLocaleString('tr-TR')}
                  </Text>
                  <Text variant="caption" color="secondary">İşlem</Text>
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
                  <Text variant="caption" color="secondary">Hesap</Text>
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
                  <Text variant="caption" color="secondary">Cari/Personel</Text>
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
                  <Text variant="caption" color="secondary">Kategori</Text>
                  <ChevronRight size={14} color={colors.textMuted} style={styles.cardChevron} />
                </Card>
              </TouchableOpacity>
            </View>

            {/* Tarih Aralığı */}
            <Card style={styles.dateRangeCard}>
              <Text variant="label">Tarih Aralığı</Text>
              <Text variant="body" color="secondary">
                {preview.dateRange.min} → {preview.dateRange.max}
              </Text>
            </Card>

            {/* İşlem Tipleri */}
            <Card style={styles.typesCard}>
              <Text variant="label" style={styles.typesTitle}>İşlem Tipleri</Text>
              {Object.entries(preview.transactionTypes).map(([type, count]) => (
                <View key={type} style={styles.typeRow}>
                  <Text variant="body">{type}</Text>
                  <Text variant="body" color="secondary">{count}</Text>
                </View>
              ))}
            </Card>

            {/* Hatalar */}
            {preview.errors.length > 0 && (
              <Card style={styles.errorCard}>
                <View style={styles.errorHeader}>
                  <AlertTriangle size={20} color={colors.warning} />
                  <Text variant="label" style={styles.errorTitle}>
                    {preview.errors.length} Uyarı
                  </Text>
                </View>
                {preview.errors.slice(0, 5).map((err, i) => (
                  <Text key={i} variant="caption" color="secondary">
                    • {err}
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
                İptal
              </Button>
              <Button
                variant="primary"
                onPress={() => handleStartImport(false)}
                style={styles.halfButton}
              >
                Import Başlat
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
              Import Ediliyor...
            </Text>

            <Text variant="body" color="secondary" style={styles.description}>
              {progress.message}
            </Text>

            {/* Progress Bar */}
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                    },
                  ]}
                />
              </View>
              <Text variant="caption" color="secondary" style={styles.progressText}>
                {progress.current.toLocaleString('tr-TR')} / {progress.total.toLocaleString('tr-TR')}
              </Text>
            </View>

            <Card style={styles.phaseCard}>
              <PhaseItem label="Kategoriler" active={progress.phase === 'categories'} done={['accounts', 'clients', 'personel', 'transactions', 'done'].includes(progress.phase)} />
              <PhaseItem label="Hesaplar" active={progress.phase === 'accounts'} done={['clients', 'personel', 'transactions', 'done'].includes(progress.phase)} />
              <PhaseItem label="Cariler" active={progress.phase === 'clients'} done={['personel', 'transactions', 'done'].includes(progress.phase)} />
              <PhaseItem label="Personeller" active={progress.phase === 'personel'} done={['transactions', 'done'].includes(progress.phase)} />
              <PhaseItem label="İşlemler" active={progress.phase === 'transactions'} done={progress.phase === 'done'} />
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
                  ? 'Import Tamamlandı!'
                  : 'Import Başarısız'}
            </Text>

            {isDryRun && (
              <Text variant="body" color="secondary" style={styles.description}>
                {t('dataImport.dryRun.description')}
              </Text>
            )}

            {result.success && (
              <View style={styles.resultGrid}>
                <ResultItem label="Kategori" value={result.categoriesCreated} isDryRun={isDryRun} />
                <ResultItem label="Hesap" value={result.accountsCreated} isDryRun={isDryRun} />
                <ResultItem label="Cari" value={result.clientsCreated} isDryRun={isDryRun} />
                <ResultItem label="Personel" value={result.personelCreated} isDryRun={isDryRun} />
                <ResultItem label="İşlem" value={result.transactionsCreated} isDryRun={isDryRun} />
              </View>
            )}

            {result.skipped > 0 && result.skippedTransactions.length > 0 && (
              <Card style={styles.skippedCard}>
                <View style={styles.skippedHeader}>
                  <AlertTriangle size={20} color={colors.warning} />
                  <Text variant="label" style={{ color: colors.warning }}>
                    {result.skipped} İşlem Atlandı
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

                {/* Aksiyon butonları */}
                <View style={styles.skippedActions}>
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() => setActiveModal('skipped')}
                    style={{ flex: 1, marginRight: spacing.sm }}
                  >
                    Detayları Gör
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<Download size={16} color={colors.primary} />}
                    onPress={handleExportSkipped}
                    style={{ flex: 1 }}
                  >
                    Excel İndir
                  </Button>
                </View>
              </Card>
            )}

            {result.errors.length > 0 && (
              <Card style={styles.errorCard}>
                <Text variant="label" style={styles.errorTitle}>Hatalar</Text>
                {result.errors.slice(0, 5).map((err, i) => (
                  <Text key={i} variant="caption" color="error">
                    • {err}
                  </Text>
                ))}
                {result.errors.length > 5 && (
                  <Text variant="caption" color="secondary">
                    ... ve {result.errors.length - 5} hata daha
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
                  Gerçek Import Başlat
                </Button>
                <Button variant="outline" onPress={handleReset} style={styles.retryButton}>
                  İptal
                </Button>
              </>
            ) : (
              <>
                <Button variant="primary" onPress={() => router.back()} style={styles.doneButton}>
                  Tamam
                </Button>
                {!result.success && (
                  <Button variant="outline" onPress={handleReset} style={styles.retryButton}>
                    Tekrar Dene
                  </Button>
                )}
              </>
            )}
          </View>
        )}
        </ScrollView>

        {/* Modals */}
        {renderModal()}
    </SafeAreaView>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

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

function ResultItem({ label, value, isDryRun = false }: { label: string; value: number; isDryRun?: boolean }) {
  return (
    <Card style={styles.resultCard}>
      <Text variant="h3" style={[styles.resultValue, isDryRun && { color: colors.info }]}>
        {value.toLocaleString('tr-TR')}
      </Text>
      <Text variant="caption" color="secondary">{label}</Text>
    </Card>
  );
}

// İşlem satırı
function TransactionItem({ transaction }: { transaction: ParsedTransaction }) {
  // ISO formatından tarih ve saati al: "2024-01-15T10:30:00" -> "2024-01-15 10:30"
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
          {transaction.type} • {transaction.account}
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
        {transaction.isExpense ? '-' : '+'}{transaction.amount.toLocaleString('tr-TR')}
      </Text>
    </View>
  );
}

// Atlanan işlem satırı
function SkippedTransactionItem({ item }: { item: SkippedTransaction }) {
  const { transaction, reason, rowNumber } = item;

  // ISO formatından tarih ve saati al
  const [datePart, timePart] = transaction.date.split('T');
  const time = timePart ? timePart.slice(0, 5) : '';
  const formattedDateTime = time ? `${datePart} ${time}` : datePart;

  return (
    <View style={styles.skippedItem}>
      {/* Satır numarası ve tarih */}
      <View style={styles.skippedItemHeader}>
        <View style={styles.rowNumberBadge}>
          <Text variant="caption" style={{ color: colors.warning, fontWeight: '600' }}>
            Satır {rowNumber}
          </Text>
        </View>
        <Text variant="caption" color="muted">{formattedDateTime}</Text>
      </View>

      {/* Açıklama ve işlem bilgisi */}
      <Text variant="body" numberOfLines={1} style={{ marginBottom: 4 }}>
        {transaction.description || '-'}
      </Text>
      <Text variant="caption" color="secondary">
        {transaction.type} • {transaction.account}
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
        {transaction.isExpense ? '-' : '+'}{transaction.amount.toLocaleString('tr-TR')}
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
}: {
  name: string;
  mapping: AccountMapping;
  onToggleType: () => void;
  onSubTypeChange: (subType: string) => void;
}) {
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
              <Text variant="caption" style={{ color: colors.info, fontWeight: '600' }}>HESAP</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity onPress={onToggleType} style={styles.toggleButton}>
          <ArrowLeftRight size={14} color={colors.primary} />
          <Text variant="caption" style={{ color: colors.primary, fontWeight: '600' }}>Cari yap</Text>
        </TouchableOpacity>
      </View>

      {/* Alt tip seçimi */}
      <View style={styles.subTypeRow}>
        {HESAP_TYPES.map((type) => (
          <TouchableOpacity
            key={type.value}
            style={[
              styles.subTypeChip,
              mapping.hesapType === type.value && styles.subTypeChipActive,
            ]}
            onPress={() => onSubTypeChange(type.value)}
          >
            <Text
              variant="caption"
              style={{
                color: mapping.hesapType === type.value ? colors.info : colors.textSecondary,
                fontWeight: mapping.hesapType === type.value ? '600' : '400',
              }}
            >
              {type.label}
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
  const isPersonel = mapping.type === 'personel';
  const iconColor = isPersonel ? colors.success : colors.warning;
  const iconBgColor = isPersonel ? colors.successLight : colors.warningLight;
  const Icon = isPersonel ? UserRound : Users;
  const typeLabel = isPersonel ? 'PERSONEL' : 'CARİ';

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
          <Text variant="caption" style={{ color: colors.primary, fontWeight: '600' }}>Hesap yap</Text>
        </TouchableOpacity>
      </View>

      {/* Entity tipi seçimi (Cari vs Personel) */}
      <View style={styles.subTypeRow}>
        {ENTITY_TYPES.map((type) => (
          <TouchableOpacity
            key={type.value}
            style={[
              styles.subTypeChip,
              mapping.type === type.value && (type.value === 'personel' ? styles.subTypeChipActiveSuccess : styles.subTypeChipActiveWarning),
            ]}
            onPress={() => onToggleEntityType(type.value as 'cari' | 'personel')}
          >
            <Text
              variant="caption"
              style={{
                color: mapping.type === type.value ? (type.value === 'personel' ? colors.success : colors.warning) : colors.textSecondary,
                fontWeight: mapping.type === type.value ? '600' : '400',
              }}
            >
              {type.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Cari alt tip seçimi (sadece cari tipinde göster) */}
      {!isPersonel && (
        <View style={[styles.subTypeRow, { marginTop: spacing.xs }]}>
          {CARI_TYPES.map((type) => (
            <TouchableOpacity
              key={type.value}
              style={[
                styles.subTypeChipSmall,
                mapping.cariType === type.value && styles.subTypeChipActiveWarning,
              ]}
              onPress={() => onSubTypeChange(type.value)}
            >
              <Text
                variant="caption"
                style={{
                  color: mapping.cariType === type.value ? colors.warning : colors.textSecondary,
                  fontWeight: mapping.cariType === type.value ? '600' : '400',
                  fontSize: 11,
                }}
              >
                {type.label}
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
}: {
  name: string;
  categoryType: 'gelir' | 'gider';
  onToggleType: () => void;
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
            {isGelir ? 'Gelir Kategorisi' : 'Gider Kategorisi'}
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
          {isGelir ? 'GELİR' : 'GİDER'}
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
  progressBar: {
    height: 8,
    backgroundColor: colors.surfaceLight,
    borderRadius: 4,
    overflow: 'hidden',
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
  phaseCard: {
    gap: spacing.md,
  },
  phaseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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
