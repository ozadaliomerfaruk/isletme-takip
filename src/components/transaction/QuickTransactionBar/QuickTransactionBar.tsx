import { useRef, useCallback, useMemo, useEffect, useState } from 'react';
import {
  View,
  Modal,
  Animated,
  TextInput,
  TouchableWithoutFeedback,
  Platform,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useRouter, useFocusEffect, type Href } from 'expo-router';

import { TAB_BAR_HEIGHT } from '@/constants/spacing';
import { roundCurrency } from '@/lib/currency';

import { getTransactionTypeColor } from '../TransactionTypeTabs';
import { ExchangeRateBar } from '../ExchangeRateBar';
import { PhotoViewerModal } from '../PhotoViewerModal';
import { styles } from './styles';
import type {
  QuickTransactionBarProps,
  TransactionType,
  TransactionTabMode,
} from './types';
import {
  DateTimePickerModal,
  HesapPickerSheet,
  CariPickerSheet,
  PersonelPickerSheet,
  OdemeHedefTypePicker,
  TahsilatHedefTypePicker,
  KrediKartiPickerSheet,
  UrunPickerModal,
} from './components';
import {
  HeaderSection,
  EntityDisplaySection,
  TransferSection,
  OdemeSection,
  TahsilatSection,
  AmountInputSection,
} from './sections';
import {
  useQuickTransactionAnimation,
  useQuickTransactionModals,
  useQuickTransactionForm,
  useQuickTransactionEntities,
  useTransactionSubmit,
  useLastUsedSelections,
} from './hooks';
import { getCategoryType as resolveCategoryFamily } from './utils/categoryTypeMapper';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useKategoriler } from '@/hooks/useKategoriler';
import { usePickImage, useTakePhoto } from '@/hooks/useIslemPhoto';
import { useCreateCari } from '@/hooks/useCariler';
import { useCreateUrun } from '@/hooks/useUrunler';
import { useSettings } from '@/hooks/useSettings';
import type { Currency, Urun } from '@/types/database';

export function QuickTransactionBar({
  visible,
  onDismiss,
  defaultType = 'gelir',
  defaultHesapId,
  defaultCariId,
  defaultCariType,
  defaultPersonelId,
  defaultAmount,
  defaultDate,
  defaultDescription,
  onSuccess,
  isViewer,
  suppressLastUsed,
  mode = 'create',
  transactionId,
  isScheduledTransaction = false,
  copySourceId,
  tabModeOverride,
}: QuickTransactionBarProps) {
  const { t } = useTranslation(['transactions', 'common', 'clients', 'staff', 'accounts']);
  const { formatDateMedium, locale } = useDateFormat();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Refs
  const amountInputRef = useRef<TextInput>(null);

  // Modals hook
  const modals = useQuickTransactionModals();

  // A1: son-kullanılan hesap/kategori belleği (aktif isletme.id ile namespace'li)
  const lastUsed = useLastUsedSelections();

  // Form hook - needs modals.resetModalStates and hesaplar
  // We need to get hesaplar first for form initialization
  const tempEntities = useQuickTransactionEntities({
    isCariMode: !!defaultCariId,
    defaultCariType,
    type: defaultType,
    tahsilatHedefType: null,
    hesapId: undefined,
    sourceHesapId: null,
    hedefHesapId: null,
    cariId: null,
    personelId: null,
    hesapPickerTarget: modals.hesapPickerTarget,
    hesapSearchQuery: modals.hesapSearchQuery,
    cariSearchQuery: modals.cariSearchQuery,
    personelSearchQuery: modals.personelSearchQuery,
    urunSearchQuery: modals.urunSearchQuery,
  });

  // Form hook
  const form = useQuickTransactionForm({
    visible,
    defaultType,
    defaultHesapId,
    defaultCariId,
    defaultCariType,
    defaultPersonelId,
    defaultAmount,
    defaultDate,
    defaultDescription,
    hesaplar: tempEntities.hesaplar,
    resetModalStates: modals.resetModalStates,
    // Edit mode props
    mode,
    transactionId,
    isScheduledTransaction,
    copySourceId,
    // A1: son-kullanılan hesap ön-doldurma getter'ı (doğrulama form hook'unda)
    getLastUsedHesapId: lastUsed.getHesapId,
  });

  // Tab mode
  const tabMode: TransactionTabMode = tabModeOverride
    ? tabModeOverride
    : form.isPersonelMode
      ? 'personel'
      : form.isCariMode
        ? defaultCariType === 'tedarikci'
          ? (isViewer ? 'tedarikci_viewer' : 'tedarikci')
          : (isViewer ? 'musteri_viewer' : 'musteri')
        : 'normal';

  // Leave usage type flag
  const isLeaveUsageType = form.type === 'personel_izin_kullanimi_tab';

  // Auto-calculate day count from date range for leave usage.
  // Gün başına (yerel 00:00) normalize edilir: saat farkı / DST kenarı gün sayısını bozmasın
  // (ham getTime() farklı saatlerde ±1 gün hatalı sayıyordu). Round, DST gün-uzunluğu
  // sapmasını da tolere eder. Ters aralık burada 1'e kelepçelenir ama kayıt anında
  // "geçersiz aralık" ile engellenir (useTransactionSubmit).
  useEffect(() => {
    if (isLeaveUsageType && form.dateEnd) {
      const s = form.safeDate;
      const e = form.dateEnd;
      const startDay = new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime();
      const endDay = new Date(e.getFullYear(), e.getMonth(), e.getDate()).getTime();
      const diffDays = Math.max(1, Math.round((endDay - startDay) / (1000 * 60 * 60 * 24)) + 1);
      form.setAmount(diffDays.toString());
    }
  }, [isLeaveUsageType, form.safeDate, form.dateEnd]);

  // Initialize dateEnd to today when switching to leave usage type.
  // EDIT modda BUGÜN'e OTOMATİK set ETME: date_end'i NULL olan legacy izin-kullanımı kaydı
  // düzenlenince dateEnd=bugün olur, yukarıdaki recompute effect'i tetikler ve saklı amount'ı
  // (ör. 2 gün) başlangıç→bugün gün sayısına ŞİŞİRİR (sessiz veri bozulması). Edit modda
  // dateEnd yalnız kayıttan (yükleme effect'i) veya kullanıcının manuel seçiminden gelmeli.
  useEffect(() => {
    if (isLeaveUsageType && !form.dateEnd && !form.isEditMode) {
      form.setDateEnd(new Date());
    } else if (!isLeaveUsageType && form.dateEnd) {
      form.setDateEnd(null);
    }
  }, [isLeaveUsageType, form.isEditMode]);

  // Entities hook - with actual form values
  const entities = useQuickTransactionEntities({
    isCariMode: form.isCariMode,
    defaultCariType,
    type: form.type,
    tahsilatHedefType: form.tahsilatHedefType,
    hesapId: form.hesapId,
    sourceHesapId: form.sourceHesapId,
    hedefHesapId: form.hedefHesapId,
    cariId: form.cariId,
    personelId: form.personelId,
    hesapPickerTarget: modals.hesapPickerTarget,
    hesapSearchQuery: modals.hesapSearchQuery,
    cariSearchQuery: modals.cariSearchQuery,
    personelSearchQuery: modals.personelSearchQuery,
    urunSearchQuery: modals.urunSearchQuery,
  });

  // Animation hook
  const animation = useQuickTransactionAnimation({
    visible,
    amountInputRef,
  });

  // Photo hooks
  const pickImage = usePickImage();
  const takePhoto = useTakePhoto();

  // Photo handlers
  const handlePickImage = useCallback(async () => {
    const uri = await pickImage.mutateAsync();
    if (uri) {
      form.setPhotoUri(uri);
    }
  }, [pickImage, form]);

  const handleTakePhoto = useCallback(async () => {
    const uri = await takePhoto.mutateAsync();
    if (uri) {
      form.setPhotoUri(uri);
    }
  }, [takePhoto, form]);

  const handleRemovePhoto = useCallback(() => {
    form.setPhotoUri(null);
  }, [form]);

  // Photo viewer state
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);

  const handleViewPhoto = useCallback(() => {
    if (form.photoUri) {
      setShowPhotoViewer(true);
    }
  }, [form.photoUri]);

  // Handle dismiss with animation
  const handleDismiss = useCallback(() => {
    animation.animateClose(() => {
      onDismiss();
    });
  }, [animation, onDismiss]);

  // Tam ekran bir sayfaya (ör. /urunler/ekle) gidip geri dönünce, navigatedAway ile GİZLENEN
  // bar'ı geri getir. `visible`'a hiç dokunulmadığı için form/urunItems korunmuştur → kullanıcı
  // eklediği ürünlerle işlem çubuğuna döner (Ürün butonunda adet görünür). İç ürün seçici
  // onAddFullProduct'ta kapatıldığı için burada otomatik açılmaz; kullanıcı Ürün'e dokunup devam eder.
  useFocusEffect(
    useCallback(() => {
      modals.setNavigatedAway(false);
    }, [modals.setNavigatedAway])
  );

  // Handle backdrop press - two-step dismiss
  const handleBackdropPress = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (animation.isKeyboardVisible) {
      Keyboard.dismiss();
    } else {
      handleDismiss();
    }
  }, [handleDismiss, animation.isKeyboardVisible]);

  // Submit hook
  const submit = useTransactionSubmit({
    isCariMode: form.isCariMode,
    isPersonelMode: form.isPersonelMode,
    isEditMode: form.isEditMode,
    suppressLastUsed,
    // Edit mode props
    mode,
    transactionId,
    isScheduledTransaction,
    // Form state
    type: form.type,
    amount: form.amount,
    description: form.description,
    safeDate: form.safeDate,
    safeDateEnd: form.safeDateEnd,
    kategoriId: form.kategoriId,
    isScheduled: form.isScheduled,
    odemeHedefType: form.odemeHedefType,
    categorySkipped: modals.categorySkipped,
    photoUri: form.photoUri,
    hesapId: form.hesapId,
    hedefHesapId: form.hedefHesapId,
    sourceHesapId: form.sourceHesapId,
    cariId: form.cariId,
    personelId: form.personelId,
    hesaplar: entities.hesaplar,
    cariler: entities.carilerForType,
    personelList: entities.personelList,
    urunItems: form.urunItems,
    setIsSaving: form.setIsSaving,
    setHesapPickerTarget: modals.setHesapPickerTarget,
    setShowHesapPicker: modals.setShowHesapPicker,
    setShowCariPicker: modals.setShowCariPicker,
    setShowPersonelPicker: modals.setShowPersonelPicker,
    setShowOdemeHedefTypePicker: modals.setShowOdemeHedefTypePicker,
    setShowTahsilatHedefTypePicker: modals.setShowTahsilatHedefTypePicker,
    setShowKrediKartiPicker: modals.setShowKrediKartiPicker,
    setCategoryPickerOpen: modals.setCategoryPickerOpen,
    setPendingModal: modals.setPendingModal,
    setShowExchangeRateBar: modals.setShowExchangeRateBar,
    setPendingExchangeData: form.setPendingExchangeData,
    pendingExchangeData: form.pendingExchangeData,
    onSuccess,
    handleDismiss,
  });

  // ── A1: son-kullanılan hesap/kategori ön-doldurma ──────────────────────────
  // Bar her açılışında belleği diskten tazele (aynı oturumda yapılan kayıtlar yansısın;
  // kayıt useTransactionSubmit içinde fire-and-forget diske yazılır).
  useEffect(() => {
    if (visible) lastUsed.reload();
  }, [visible, lastUsed.reload]);

  // Mevcut işlem tipinin kategori ailesi (gelir/gider) — doğrulama + prefill anahtarı.
  const currentCategoryFamily = resolveCategoryFamily(form.type);
  // Doğrulama listesi: CategoryPicker ile AYNI sorgu anahtarı → cache isabeti (ek ağ yok).
  const { data: kategorilerForFamily } = useKategoriler(currentCategoryFamily);

  // selectedCategoryType override'ını mevcut aileyle senkron tut → tip değişince bayat
  // override CategoryPicker'ı yanlış ailede göstermesin (mis-tag guard; latent bug fix).
  useEffect(() => {
    if (modals.selectedCategoryType && modals.selectedCategoryType !== currentCategoryFamily) {
      modals.setSelectedCategoryType(currentCategoryFamily ?? null);
    }
  }, [currentCategoryFamily, modals.selectedCategoryType, modals.setSelectedCategoryType]);

  // Kategori OTOMATİK ön-doldurma BİLİNÇLİ OLARAK kaldırıldı (Dilim 1, #4).
  // Neden: son-kullanılan kategoriyi sessizce doldurmak, kullanıcının fark etmeden yanlış
  // kategoriyle kaydetmesine yol açıyordu (mis-tag riski; cihaz geri bildirimi). Kategori
  // görünmez bir varsayılan değil, bilinçli bir seçim olmalı → save-gate kullanıcıya seçtirir.
  // "Son 3 kategori" ÖNERİSİ aşağıdaki görünür chip satırı olarak KALIR (dokununca seçilir).
  // Hesap ön-doldurma da KALIR (form hook'unda; seçim kutusunda görünür, yanlışsa bariz).

  // A1: "son kullanılan" kategori chip'leri için çözümlenmiş liste (canlı listeye karşı
  // doğrulanmış → silinmiş id'ler otomatik düşer; en fazla 3).
  const recentKategoriIds = lastUsed.getRecentKategoriIds(currentCategoryFamily);
  const recentCategories = useMemo(() => {
    // #4b: chip satırı artık cari/personel modda da görünür (persist o modlara genişletildi;
    // kaynak mutabakat kuyruğu suppressLastUsed ile hariç tutuldu). Aile eşlemesi chip ile
    // persist'te aynı fonksiyondur (getCategoryType) → chip'ler cari işlemlerinden dolar.
    // Viewer (salt-görüntüleme linkli cari) modunda gizli: kategori bağlamı belirsiz.
    if (isViewer) return [];
    if (!kategorilerForFamily || recentKategoriIds.length === 0) return [];
    return recentKategoriIds
      .map((id) => kategorilerForFamily.find((k) => k.id === id))
      .filter((k): k is NonNullable<typeof k> => !!k)
      .slice(0, 3)
      .map((k) => ({ id: k.id, name: k.name, color: k.color }));
  }, [isViewer, kategorilerForFamily, recentKategoriIds]);

  // Handle hesap selection from picker
  const handleHesapSelect = useCallback(
    (hesapId: string) => {
      if (modals.hesapPickerTarget === 'source') {
        form.setSourceHesapId(hesapId);
      } else {
        form.setHedefHesapId(hesapId);
      }
      modals.setShowHesapPicker(false);
      modals.setHesapSearchQuery('');
    },
    [modals, form]
  );

  // Handle cari selection from picker
  const handleCariSelect = useCallback(
    (selectedCariId: string) => {
      form.setCariId(selectedCariId);
      modals.setShowCariPicker(false);
      modals.setCariSearchQuery('');
    },
    [form, modals]
  );

  // Picker'ın müşteri/tedarikçi bağlamı: cari modunda defaultCariType belirler,
  // normal modda tahsilat hedefi (tedarikçi tahsilatı -> tedarikçi), aksi halde
  // müşteri; ödeme -> tedarikçi. Bu, picker başlığı/ikonu + inline cari oluşturma
  // tipinin (müşteri/tedarikçi) doğru olmasını sağlar.
  const cariPickerMode: 'customer' | 'supplier' = form.isCariMode
    ? defaultCariType === 'tedarikci'
      ? 'supplier'
      : 'customer'
    : form.type === 'tahsilat'
      ? form.tahsilatHedefType === 'tedarikci'
        ? 'supplier'
        : 'customer'
      : 'supplier';

  // Inline cari oluşturma (v1.5): picker'da aranan isim yoksa "+ ekle" ile
  // formdan çıkmadan cari yaratılır ve otomatik seçilir.
  const createCari = useCreateCari();
  const handleCariCreateNew = useCallback(
    (name: string) => {
      createCari.mutate(
        { name, type: cariPickerMode === 'customer' ? 'musteri' : 'tedarikci' },
        { onSuccess: (yeniCari) => handleCariSelect(yeniCari.id) }
      );
    },
    [createCari, cariPickerMode, handleCariSelect]
  );

  // Inline ürün oluşturma: picker'da aranan ürün yoksa "+ yeni ekle" ile oluştur + otomatik seç.
  const createUrun = useCreateUrun();
  const { currency: userCurrency } = useSettings();
  const handleUrunCreateNew = useCallback(
    async (name: string): Promise<Urun | undefined> => {
      try {
        return await createUrun.mutateAsync({
          ad: name.trim(),
          birim: 'adet',
          kdv_orani: 0,
          alis_fiyati: 0,
          satis_fiyati: 0,
          currency: userCurrency as Currency,
        });
      } catch {
        return undefined;
      }
    },
    [createUrun, userCurrency]
  );

  // Handle personel selection from picker
  const handlePersonelSelect = useCallback(
    (selectedPersonelId: string) => {
      form.setPersonelId(selectedPersonelId);
      modals.setShowPersonelPicker(false);
      modals.setPersonelSearchQuery('');
    },
    [form, modals]
  );

  // Handle odeme type selection
  const handleOdemeTypeSelect = useCallback(
    (selectedType: typeof form.odemeHedefType, nextModal: 'cari' | 'personel' | 'hesap') => {
      form.setOdemeHedefType(selectedType);
      form.setCariId(null);
      form.setPersonelId(null);
      if (selectedType === 'kredi_karti') {
        form.setHedefHesapId(null);
      }
      modals.setShowOdemeHedefTypePicker(false);

      setTimeout(() => {
        if (nextModal === 'cari') {
          if (!form.kategoriId && !modals.categorySkipped) {
            modals.setPendingModal('category');
          }
          modals.setShowCariPicker(true);
        } else if (nextModal === 'personel') {
          if (!form.kategoriId && !modals.categorySkipped) {
            modals.setPendingModal('category');
          }
          modals.setShowPersonelPicker(true);
        } else if (nextModal === 'hesap') {
          if (form.sourceHesapId) {
            // Source account already set (user came from a specific account) — skip to credit card picker
            modals.setShowKrediKartiPicker(true);
          } else {
            modals.setPendingModal('kredi_karti');
            modals.setHesapPickerTarget('source');
            modals.setShowHesapPicker(true);
          }
        }
      }, 250);
    },
    [form, modals]
  );

  // Handle tahsilat type selection
  const handleTahsilatTypeSelect = useCallback(
    (selectedType: typeof form.tahsilatHedefType, nextModal: 'cari' | 'personel') => {
      form.setTahsilatHedefType(selectedType);
      form.setCariId(null);
      form.setPersonelId(null);
      modals.setShowTahsilatHedefTypePicker(false);

      setTimeout(() => {
        if (!form.kategoriId && !modals.categorySkipped) {
          modals.setPendingModal('category');
        }
        if (nextModal === 'cari') {
          modals.setShowCariPicker(true);
        } else {
          modals.setShowPersonelPicker(true);
        }
      }, 250);
    },
    [form, modals]
  );

  // Handle kredi karti selection
  const handleKrediKartiSelect = useCallback(
    (hesapId: string) => {
      form.setHedefHesapId(hesapId);
      modals.setShowKrediKartiPicker(false);
    },
    [form, modals]
  );

  // Handle pending modal
  const handlePendingModalHandled = useCallback(
    (modal: 'category' | 'kredi_karti' | 'cari' | 'personel' | null) => {
      if (modal === 'category' || modal === 'kredi_karti') {
        // When products are selected, skip category picker (products provide their own categorization)
        const effectiveKategoriId = form.urunItems.length > 0 ? 'skip' : form.kategoriId;
        modals.handlePendingModalHandled(modal, effectiveKategoriId);
      }
    },
    [modals, form.kategoriId, form.urunItems.length]
  );

  if (!visible) return null;

  const buttonColor = getTransactionTypeColor(form.type);
  const buttonLabels: Record<TransactionType, string> = {
    gelir: t('transactions:tabs.gelir'),
    gider: t('transactions:tabs.gider'),
    transfer: t('transactions:tabs.transfer'),
    odeme: t('transactions:tabs.odeme'),
    tahsilat: t('transactions:tabs.tahsilat'),
    alis: t('transactions:tabs.alis'),
    satis: t('transactions:tabs.satis'),
    alis_iade: t('clients:actions.return'),
    satis_iade: t('clients:actions.return'),
    personel_odeme_tab: t('transactions:tabs.odeme'),
    personel_gider_tab: t('transactions:tabs.gider'),
    personel_tahsilat_tab: t('transactions:tabs.tahsilat'),
    personel_satis_tab: t('transactions:tabs.personel_satis'),
    personel_izin_hakki_tab: t('transactions:tabs.personel_izin_hakki'),
    personel_izin_kullanimi_tab: t('transactions:tabs.personel_izin_kullanimi'),
    kredi_karti_gider: t('transactions:tabs.kredi_karti_gider'),
    kredi_karti_odeme: t('transactions:tabs.kredi_karti_odeme'),
    kredi_karti_ekstre: t('transactions:tabs.kredi_karti_ekstre'),
  };
  // In edit mode, show "Update" instead of transaction type
  const buttonLabel = form.isEditMode
    ? t('common:buttons.update')
    : buttonLabels[form.type];

  // Category picker type mapping
  const getCategoryType = (): 'gelir' | 'gider' | undefined => {
    if (form.type === 'gelir' || form.type === 'tahsilat' || form.type === 'satis') return 'gelir';
    if (form.type === 'gider' || form.type === 'odeme' || form.type === 'transfer' || form.type === 'alis')
      return 'gider';
    if (form.type === 'satis_iade') return 'gelir';
    if (form.type === 'alis_iade') return 'gider';
    if (form.type === 'personel_tahsilat_tab' || form.type === 'personel_satis_tab') return 'gelir';
    if (form.type === 'personel_odeme_tab' || form.type === 'personel_gider_tab') return 'gider';
    return undefined;
  };
  const categoryType = modals.selectedCategoryType || getCategoryType();

  // Urun button visibility - show for alis/satis/iade, gelir/gider, and kredi_karti_gider types if user has products
  const urunTransactionTypes: TransactionType[] = ['alis', 'satis', 'alis_iade', 'satis_iade', 'gelir', 'gider', 'kredi_karti_gider'];
  const showUrunButton = entities.hasUrunler && urunTransactionTypes.includes(form.type);

  // Position card above keyboard and tab bar
  const cardBottom = animation.keyboardHeight > 0
    ? animation.keyboardHeight
    : insets.bottom + TAB_BAR_HEIGHT + 10;

  return (
    <Modal visible={visible && !modals.navigatedAway} transparent animationType="none" statusBarTranslucent>
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      {/* Card */}
      <Animated.View
        style={[
          styles.card,
          {
            bottom: cardBottom,
            opacity: animation.opacity,
            transform: [{ translateY: animation.translateY }],
          },
        ]}
      >
        {/* Header: Date + Bell + Close */}
        <HeaderSection
          date={form.safeDate}
          isScheduled={form.isScheduled}
          formatDateMedium={formatDateMedium}
          onDatePress={() => modals.setShowDatePicker(true)}
          onScheduledToggle={() => form.setIsScheduled(!form.isScheduled)}
          onClose={handleDismiss}
          onResetToNow={() => form.setDate(new Date())}
          isLeaveUsageType={isLeaveUsageType}
          dateEnd={form.dateEnd}
          onDateEndPress={() => modals.setShowDateEndPicker(true)}
        />

        {/* Entity Display: Hesap/Cari/Personel bilgisi */}
        <EntityDisplaySection
          type={form.type}
          isCariMode={form.isCariMode}
          isPersonelMode={form.isPersonelMode}
          defaultCariType={defaultCariType}
          selectedHesap={entities.selectedHesap}
          selectedSourceHesap={entities.selectedSourceHesap}
          selectedCari={entities.selectedCari}
          selectedPersonel={entities.selectedPersonel}
          onOpenHesapPicker={() => {
            modals.setHesapPickerTarget('source');
            modals.setShowHesapPicker(true);
          }}
        />

        {/* Transfer: Kaynak ve Hedef Hesap */}
        {form.type === 'transfer' && (
          <TransferSection
            selectedHesap={entities.selectedHesap}
            selectedHedefHesap={entities.selectedHedefHesap}
            onOpenHedefHesapPicker={() => {
              modals.setHesapPickerTarget('hedef');
              modals.setShowHesapPicker(true);
            }}
          />
        )}

        {/* Ödeme: Kaynak Hesap + Ödeme Türü Seçici (sadece normal modda) */}
        {form.type === 'odeme' && !form.isCariMode && (
          <OdemeSection
            selectedHesap={entities.selectedHesap}
            selectedSourceHesap={entities.selectedSourceHesap}
            selectedCari={entities.selectedCari}
            selectedPersonel={entities.selectedPersonel}
            selectedKrediKarti={entities.selectedKrediKarti}
            odemeHedefType={form.odemeHedefType}
            onOpenOdemeTypePicker={() => modals.setShowOdemeHedefTypePicker(true)}
            onOpenCariPicker={() => modals.setShowCariPicker(true)}
            onOpenPersonelPicker={() => modals.setShowPersonelPicker(true)}
            onOpenSourceHesapPicker={() => {
              modals.setHesapPickerTarget('source');
              modals.setShowHesapPicker(true);
            }}
            onOpenKrediKartiPicker={() => modals.setShowKrediKartiPicker(true)}
          />
        )}

        {/* Tahsilat: Tahsilat Türü + Hedef Hesap Seçici (sadece normal modda) */}
        {form.type === 'tahsilat' && !form.isCariMode && (
          <TahsilatSection
            selectedHesap={entities.selectedHesap}
            selectedHedefHesap={entities.selectedHedefHesap}
            selectedCari={entities.selectedCari}
            selectedPersonel={entities.selectedPersonel}
            tahsilatHedefType={form.tahsilatHedefType}
            onOpenTahsilatTypePicker={() => modals.setShowTahsilatHedefTypePicker(true)}
            onOpenCariPicker={() => modals.setShowCariPicker(true)}
            onOpenPersonelPicker={() => modals.setShowPersonelPicker(true)}
            onOpenHedefHesapPicker={() => {
              modals.setHesapPickerTarget('hedef');
              modals.setShowHesapPicker(true);
            }}
          />
        )}

        {/* Amount Input Section: Category, Description, Amount, Save, Tabs */}
        <AmountInputSection
          amount={form.amount}
          onAmountChange={form.handleAmountChange}
          amountInputRef={amountInputRef}
          description={form.description}
          onDescriptionChange={form.setDescription}
          kategoriId={form.kategoriId}
          onKategoriChange={(newKategoriId) => {
            form.setKategoriId(newKategoriId);
            if (newKategoriId) {
              modals.setSelectedCategoryType(categoryType ?? null);
            } else {
              modals.setSelectedCategoryType(null);
            }
          }}
          categoryType={categoryType ?? null}
          recentCategories={recentCategories}
          categoryPickerOpen={modals.categoryPickerOpen && form.urunItems.length === 0}
          onCategoryPickerOpenChange={(open) => {
            // Prevent opening category picker when products are selected
            if (open && form.urunItems.length > 0) {
              return;
            }
            modals.setCategoryPickerOpen(open);
            if (!open && !form.kategoriId) {
              modals.setCategorySkipped(true);
            }
          }}
          onNavigateAway={onDismiss}
          hasPhoto={!!form.photoUri}
          onPickImage={handlePickImage}
          onTakePhoto={handleTakePhoto}
          onRemovePhoto={handleRemovePhoto}
          onViewPhoto={handleViewPhoto}
          photoLoading={pickImage.isPending || takePhoto.isPending}
          isScheduled={form.isScheduled}
          isSaving={form.isSaving || form.isLoadingTransaction}
          buttonColor={buttonColor}
          buttonLabel={buttonLabel}
          onSave={submit.handleSave}
          type={form.type}
          onTypeChange={form.setType}
          tabMode={tabMode}
          showUrunButton={showUrunButton}
          urunItemCount={form.urunItems.length}
          onUrunButtonPress={() => modals.setShowUrunPicker(true)}
        />
      </Animated.View>

      {/* DateTime Picker Modal */}
      <DateTimePickerModal
        visible={modals.showDatePicker}
        onDismiss={() => modals.setShowDatePicker(false)}
        value={form.safeDate}
        onChange={form.setDate}
        locale={locale}
      />

      {/* DateTime End Picker Modal (for leave usage date range) */}
      {isLeaveUsageType && (
        <DateTimePickerModal
          visible={modals.showDateEndPicker}
          onDismiss={() => modals.setShowDateEndPicker(false)}
          value={form.safeDateEnd || form.safeDate}
          onChange={(newDate) => {
            // Ensure end date is not before start date
            if (newDate < form.safeDate) {
              form.setDateEnd(form.safeDate);
            } else {
              form.setDateEnd(newDate);
            }
          }}
          locale={locale}
        />
      )}

      {/* Hesap Picker Modal - Bottom Sheet */}
      <HesapPickerSheet
        visible={modals.showHesapPicker}
        onDismiss={modals.handleHesapPickerDismiss}
        onSelect={handleHesapSelect}
        hesaplar={entities.hesaplar || []}
        selectedId={modals.hesapPickerTarget === 'source' ? form.sourceHesapId : form.hedefHesapId}
        target={modals.hesapPickerTarget}
        excludeId={modals.hesapPickerTarget === 'hedef' ? form.hesapId : undefined}
        pendingModal={modals.pendingModal}
        onPendingModalHandled={handlePendingModalHandled}
      />

      {/* Cari Picker Modal - Bottom Sheet */}
      <CariPickerSheet
        visible={modals.showCariPicker}
        onDismiss={modals.handleCariPickerDismiss}
        onSelect={handleCariSelect}
        cariler={entities.carilerForType || []}
        selectedId={form.cariId}
        mode={cariPickerMode}
        onCreateNew={handleCariCreateNew}
        creating={createCari.isPending}
        pendingModal={modals.pendingModal}
        onPendingModalHandled={handlePendingModalHandled}
      />

      {/* Ödeme Hedef Tipi Picker Modal - Bottom Sheet */}
      <OdemeHedefTypePicker
        visible={modals.showOdemeHedefTypePicker}
        onDismiss={() => modals.setShowOdemeHedefTypePicker(false)}
        onSelect={handleOdemeTypeSelect}
        selectedType={form.odemeHedefType}
      />

      {/* Tahsilat Hedef Tipi Picker Modal - Bottom Sheet */}
      <TahsilatHedefTypePicker
        visible={modals.showTahsilatHedefTypePicker}
        onDismiss={() => modals.setShowTahsilatHedefTypePicker(false)}
        onSelect={handleTahsilatTypeSelect}
        selectedType={form.tahsilatHedefType}
      />

      {/* Kredi Kartı Picker Modal - Bottom Sheet */}
      <KrediKartiPickerSheet
        visible={modals.showKrediKartiPicker}
        onDismiss={() => modals.setShowKrediKartiPicker(false)}
        onSelect={handleKrediKartiSelect}
        krediKartiHesaplari={entities.krediKartiHesaplari}
        selectedId={form.hedefHesapId}
      />

      {/* Personel Picker Modal - Bottom Sheet */}
      <PersonelPickerSheet
        visible={modals.showPersonelPicker}
        onDismiss={modals.handlePersonelPickerDismiss}
        onSelect={handlePersonelSelect}
        personelList={entities.personelList || []}
        selectedId={form.personelId}
        pendingModal={modals.pendingModal}
        onPendingModalHandled={handlePendingModalHandled}
      />

      {/* Exchange Rate Bar */}
      {form.pendingExchangeData && (
        <ExchangeRateBar
          visible={modals.showExchangeRateBar}
          onDismiss={() => {
            modals.setShowExchangeRateBar(false);
            form.setPendingExchangeData(null);
          }}
          sourceAmount={form.pendingExchangeData.sourceAmount}
          sourceCurrency={form.pendingExchangeData.sourceCurrency}
          targetCurrency={form.pendingExchangeData.targetCurrency}
          onConfirm={submit.handleExchangeRateConfirm}
        />
      )}

      {/* Urun Picker Modal */}
      <UrunPickerModal
        visible={modals.showUrunPicker}
        onDismiss={() => {
          modals.setShowUrunPicker(false);
          modals.setUrunSearchQuery('');
        }}
        urunler={entities.urunler || []}
        urunItems={form.urunItems}
        onUrunItemsChange={form.setUrunItems}
        searchQuery={modals.urunSearchQuery}
        onSearchQueryChange={modals.setUrunSearchQuery}
        onTotalChange={(total) => {
          // Ürün toplamını işlem tutarına yaz.
          // KRİTİK: ürün toplamı 3+ ondalık olabilir (ör. %1 KDV: 12*40.40+%1 = 489.648
          // → genel toplam ...828). 2 ondalığa YUVARLANMAZSA, parseCurrency TR locale'de
          // noktadan sonraki 3 haneyi binlik ayracı sanıp noktayı siliyor ve tutarı
          // ~1000x şişiriyor (2692.828 → 2692828). roundCurrency 2 ondalık garanti eder.
          if (total > 0) {
            form.setAmount(roundCurrency(total).toString());
          }
        }}
        currency={userCurrency}
        islemYonu={form.type === 'satis' || form.type === 'satis_iade' ? 'satis' : 'alis'}
        onCreateNew={handleUrunCreateNew}
        creating={createUrun.isPending}
        onAddFullProduct={() => {
          // Eklenen ürünleri KAYBETMEDEN tam ekran ürün ekleme sayfasına git.
          // ÖNCEDEN (v1): handleDismiss() → parent visible=false → form reset = VERİ KAYBI.
          // v2 HATASI: sadece navigatedAway ile dış Modal gizlenip iç ürün seçici (showUrunPicker
          //   hâlâ true) "visible iken unmount" oluyordu → öksüz, dokunuş-yutan native modal
          //   kalıyordu → yeni sayfa AÇILIYOR ama DONUYORDU.
          // v3 (bu): önce iç ürün seçiciyi DÜZGÜN kapat (visible=false → temiz dismiss), SONRAKİ
          //   adımda (aynı frame'de değil) dış bar'ı navigatedAway ile gizle + navigasyon yap.
          //   `visible`'a hiç dokunulmadığı için form/urunItems yine KORUNUR (veri kaybı yok);
          //   dönüşte useFocusEffect bar'ı geri açar (ürünler Ürün butonunda adet olarak görünür).
          modals.setShowUrunPicker(false);
          modals.setUrunSearchQuery('');
          setTimeout(() => {
            modals.setNavigatedAway(true);
            router.push('/urunler/ekle' as Href);
          }, 240);
        }}
      />

      {/* Photo Viewer Modal */}
      <PhotoViewerModal
        visible={showPhotoViewer}
        photoPath={form.photoUri}
        onClose={() => setShowPhotoViewer(false)}
      />
    </Modal>
  );
}
