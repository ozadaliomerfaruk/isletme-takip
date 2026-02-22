import { useState, useCallback } from 'react';
import type { PendingModal, HesapPickerTarget, OdemeHedefType, TahsilatHedefType } from '../types';

interface UseQuickTransactionModalsReturn {
  // Modal visibility states
  showDatePicker: boolean;
  setShowDatePicker: (show: boolean) => void;
  showHesapPicker: boolean;
  setShowHesapPicker: (show: boolean) => void;
  showCariPicker: boolean;
  setShowCariPicker: (show: boolean) => void;
  showPersonelPicker: boolean;
  setShowPersonelPicker: (show: boolean) => void;
  showOdemeHedefTypePicker: boolean;
  setShowOdemeHedefTypePicker: (show: boolean) => void;
  showTahsilatHedefTypePicker: boolean;
  setShowTahsilatHedefTypePicker: (show: boolean) => void;
  showKrediKartiPicker: boolean;
  setShowKrediKartiPicker: (show: boolean) => void;
  showExchangeRateBar: boolean;
  setShowExchangeRateBar: (show: boolean) => void;
  showUrunPicker: boolean;
  setShowUrunPicker: (show: boolean) => void;
  showDateEndPicker: boolean;
  setShowDateEndPicker: (show: boolean) => void;

  // Search queries
  hesapSearchQuery: string;
  setHesapSearchQuery: (query: string) => void;
  cariSearchQuery: string;
  setCariSearchQuery: (query: string) => void;
  personelSearchQuery: string;
  setPersonelSearchQuery: (query: string) => void;
  urunSearchQuery: string;
  setUrunSearchQuery: (query: string) => void;

  // Category picker state
  categoryPickerOpen: boolean;
  setCategoryPickerOpen: (open: boolean) => void;
  categorySkipped: boolean;
  setCategorySkipped: (skipped: boolean) => void;
  selectedCategoryType: 'gelir' | 'gider' | null;
  setSelectedCategoryType: (type: 'gelir' | 'gider' | null) => void;

  // Pending modal
  pendingModal: PendingModal;
  setPendingModal: (modal: PendingModal) => void;

  // Hesap picker target
  hesapPickerTarget: HesapPickerTarget;
  setHesapPickerTarget: (target: HesapPickerTarget) => void;

  // Reset all modal states
  resetModalStates: () => void;

  // Handler callbacks
  handlePendingModalHandled: (modal: 'category' | 'kredi_karti', kategoriId: string | null) => void;
  handleHesapPickerDismiss: () => void;
  handleCariPickerDismiss: () => void;
  handlePersonelPickerDismiss: () => void;
}

export function useQuickTransactionModals(): UseQuickTransactionModalsReturn {
  // Modal visibility states
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showHesapPicker, setShowHesapPicker] = useState(false);
  const [showCariPicker, setShowCariPicker] = useState(false);
  const [showPersonelPicker, setShowPersonelPicker] = useState(false);
  const [showOdemeHedefTypePicker, setShowOdemeHedefTypePicker] = useState(false);
  const [showTahsilatHedefTypePicker, setShowTahsilatHedefTypePicker] = useState(false);
  const [showKrediKartiPicker, setShowKrediKartiPicker] = useState(false);
  const [showExchangeRateBar, setShowExchangeRateBar] = useState(false);
  const [showUrunPicker, setShowUrunPicker] = useState(false);
  const [showDateEndPicker, setShowDateEndPicker] = useState(false);

  // Search queries
  const [hesapSearchQuery, setHesapSearchQuery] = useState('');
  const [cariSearchQuery, setCariSearchQuery] = useState('');
  const [personelSearchQuery, setPersonelSearchQuery] = useState('');
  const [urunSearchQuery, setUrunSearchQuery] = useState('');

  // Category picker state
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [categorySkipped, setCategorySkipped] = useState(false);
  const [selectedCategoryType, setSelectedCategoryType] = useState<'gelir' | 'gider' | null>(null);

  // Pending modal for sequential modal opening
  const [pendingModal, setPendingModal] = useState<PendingModal>(null);

  // Hesap picker target
  const [hesapPickerTarget, setHesapPickerTarget] = useState<HesapPickerTarget>('hedef');

  // Reset all modal states
  const resetModalStates = useCallback(() => {
    setShowDatePicker(false);
    setShowHesapPicker(false);
    setShowCariPicker(false);
    setShowPersonelPicker(false);
    setShowOdemeHedefTypePicker(false);
    setShowTahsilatHedefTypePicker(false);
    setShowKrediKartiPicker(false);
    setShowExchangeRateBar(false);
    setShowUrunPicker(false);
    setShowDateEndPicker(false);
    setHesapSearchQuery('');
    setCariSearchQuery('');
    setPersonelSearchQuery('');
    setUrunSearchQuery('');
    setCategoryPickerOpen(false);
    setCategorySkipped(false);
    setSelectedCategoryType(null);
    setPendingModal(null);
    setHesapPickerTarget('hedef');
  }, []);

  // Handle pending modal
  const handlePendingModalHandled = useCallback(
    (modal: 'category' | 'kredi_karti', kategoriId: string | null) => {
      if (modal === 'category' && !kategoriId && !categorySkipped) {
        setCategoryPickerOpen(true);
      } else if (modal === 'kredi_karti') {
        setShowKrediKartiPicker(true);
      }
      setPendingModal(null);
    },
    [categorySkipped]
  );

  // Handle hesap picker dismiss
  const handleHesapPickerDismiss = useCallback(() => {
    setShowHesapPicker(false);
    setHesapSearchQuery('');
    setPendingModal(null);
  }, []);

  // Handle cari picker dismiss
  const handleCariPickerDismiss = useCallback(() => {
    setShowCariPicker(false);
    setCariSearchQuery('');
    setPendingModal(null);
  }, []);

  // Handle personel picker dismiss
  const handlePersonelPickerDismiss = useCallback(() => {
    setShowPersonelPicker(false);
    setPersonelSearchQuery('');
    setPendingModal(null);
  }, []);

  return {
    // Modal visibility states
    showDatePicker,
    setShowDatePicker,
    showHesapPicker,
    setShowHesapPicker,
    showCariPicker,
    setShowCariPicker,
    showPersonelPicker,
    setShowPersonelPicker,
    showOdemeHedefTypePicker,
    setShowOdemeHedefTypePicker,
    showTahsilatHedefTypePicker,
    setShowTahsilatHedefTypePicker,
    showKrediKartiPicker,
    setShowKrediKartiPicker,
    showExchangeRateBar,
    setShowExchangeRateBar,
    showUrunPicker,
    setShowUrunPicker,
    showDateEndPicker,
    setShowDateEndPicker,

    // Search queries
    hesapSearchQuery,
    setHesapSearchQuery,
    cariSearchQuery,
    setCariSearchQuery,
    personelSearchQuery,
    setPersonelSearchQuery,
    urunSearchQuery,
    setUrunSearchQuery,

    // Category picker state
    categoryPickerOpen,
    setCategoryPickerOpen,
    categorySkipped,
    setCategorySkipped,
    selectedCategoryType,
    setSelectedCategoryType,

    // Pending modal
    pendingModal,
    setPendingModal,

    // Hesap picker target
    hesapPickerTarget,
    setHesapPickerTarget,

    // Reset
    resetModalStates,

    // Handlers
    handlePendingModalHandled,
    handleHesapPickerDismiss,
    handleCariPickerDismiss,
    handlePersonelPickerDismiss,
  };
}
