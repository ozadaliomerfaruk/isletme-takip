import { useState, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { ChevronDown, Wallet, X, Search, Check, Users, UserCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, Input, Button, Card, CategoryPicker, CurrencyInput, DateTimePicker } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCariler } from '@/hooks/useCariler';
import { usePersonelList } from '@/hooks/usePersonel';
import {
  useIleriTarihliIslem,
  useUpdateIleriTarihliIslem,
  useDeleteIleriTarihliIslem,
} from '@/hooks/useIleriTarihliIslemler';
import { formatCurrency, parseCurrency, isValidAmount } from '@/lib/currency';
import { IslemType } from '@/types/database';
import { isLeaveType } from '@/constants/islemTypes';
import { parseDateFromDB, formatDateForDB } from '@/lib/date';
import { toErrorMessage } from '@/lib/errors';
import { usePagePermission } from '@/hooks/usePagePermission';

export default function IleriTarihliIslemDuzenlePage() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation(['transactions', 'common', 'errors', 'clients', 'staff']);
  usePagePermission({ module: 'ileri_tarihli', action: 'update' });

  const { data: islem, isLoading: islemLoading } = useIleriTarihliIslem(id);
  const updateIslem = useUpdateIleriTarihliIslem();
  const deleteIslem = useDeleteIleriTarihliIslem();

  const { data: hesaplar } = useHesaplar();
  const { data: cariler } = useCariler();
  const { data: personelList } = usePersonelList();

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [hesapId, setHesapId] = useState<string | null>(null);
  const [hedefHesapId, setHedefHesapId] = useState<string | null>(null);
  const [kategoriId, setKategoriId] = useState<string | null>(null);
  const [cariId, setCariId] = useState<string | null>(null);
  const [personelId, setPersonelId] = useState<string | null>(null);
  const [scheduledDate, setScheduledDate] = useState('');

  const [showHesapPicker, setShowHesapPicker] = useState(false);
  const [hesapPickerTarget, setHesapPickerTarget] = useState<'source' | 'hedef'>('source');
  const [hesapSearchQuery, setHesapSearchQuery] = useState('');
  const [showCariPicker, setShowCariPicker] = useState(false);
  const [cariSearchQuery, setCariSearchQuery] = useState('');
  const [showPersonelPicker, setShowPersonelPicker] = useState(false);
  const [personelSearchQuery, setPersonelSearchQuery] = useState('');

  const windowHeight = Dimensions.get('window').height;

  const [errors, setErrors] = useState<{ amount?: string; hesap?: string }>({});

  const filteredHesaplar = useMemo(() => {
    const list = hesapPickerTarget === 'hedef' && hesapId
      ? hesaplar?.filter((h) => h.id !== hesapId) || []
      : hesaplar || [];
    if (!hesapSearchQuery.trim()) return list;
    const query = hesapSearchQuery.toLowerCase().trim();
    return list.filter((h) => h.name.toLowerCase().includes(query));
  }, [hesaplar, hesapId, hesapSearchQuery, hesapPickerTarget]);

  const filteredCariler = useMemo(() => {
    if (!cariler) return [];
    if (!cariSearchQuery.trim()) return cariler;
    const query = cariSearchQuery.toLowerCase().trim();
    return cariler.filter((c) => c.name.toLowerCase().includes(query));
  }, [cariler, cariSearchQuery]);

  const filteredPersonel = useMemo(() => {
    if (!personelList) return [];
    if (!personelSearchQuery.trim()) return personelList;
    const query = personelSearchQuery.toLowerCase().trim();
    return personelList.filter((p) =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(query)
    );
  }, [personelList, personelSearchQuery]);

  // İşlem yüklendiğinde form alanlarını doldur
  useEffect(() => {
    if (islem) {
      setAmount(String(islem.amount));
      setDescription(islem.description || '');
      setHesapId(islem.hesap_id);
      setHedefHesapId(islem.hedef_hesap_id);
      setKategoriId(islem.kategori_id);
      setCariId(islem.cari_id);
      setPersonelId(islem.personel_id);
      setScheduledDate(islem.scheduled_date);
    }
  }, [islem]);

  const islemType = islem?.type as IslemType | undefined;

  const selectedHesap = hesaplar?.find((h) => h.id === hesapId);
  const selectedHedefHesap = hesaplar?.find((h) => h.id === hedefHesapId);
  const selectedCari = cariler?.find((c) => c.id === cariId);
  const selectedPersonel = personelList?.find((p) => p.id === personelId);

  const isLeave = islemType ? isLeaveType(islemType) : false;
  const needsHesap = ['gelir', 'gider', 'transfer', 'cari_odeme', 'cari_tahsilat', 'personel_odeme', 'personel_tahsilat'].includes(islemType || '');
  const needsHedefHesap = islemType === 'transfer';
  const needsKategori = ['gelir', 'gider', 'cari_alis', 'cari_satis', 'cari_odeme', 'cari_tahsilat', 'personel_gider', 'personel_odeme', 'personel_tahsilat', 'personel_satis'].includes(islemType || '');
  const needsCari = ['cari_alis', 'cari_satis', 'cari_odeme', 'cari_tahsilat'].includes(islemType || '');
  const needsPersonel = ['personel_gider', 'personel_odeme', 'personel_tahsilat', 'personel_satis'].includes(islemType || '');

  const validate = () => {
    const newErrors: { amount?: string; hesap?: string } = {};

    if (!isValidAmount(amount)) {
      newErrors.amount = t('errors:validation.invalidAmount');
    }

    if (needsHesap && !hesapId) {
      newErrors.hesap = t('errors:account.selectAccount');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !id) return;

    try {
      await updateIslem.mutateAsync({
        id,
        updates: {
          amount: parseCurrency(amount),
          description: description.trim() || null,
          hesap_id: hesapId,
          hedef_hesap_id: hedefHesapId,
          kategori_id: kategoriId,
          cari_id: cariId,
          personel_id: personelId,
          scheduled_date: scheduledDate,
        },
      });

      Alert.alert(t('common:status.success'), t('transactions:messages.transactionUpdated'), [
        { text: t('common:buttons.ok'), onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert(t('common:status.error'), toErrorMessage(error) || t('errors:transaction.updateFailed'));
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t('transactions:scheduled.delete'),
      t('transactions:scheduled.deleteConfirm'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteIslem.mutateAsync(id!);
              Alert.alert(t('common:status.success'), t('transactions:messages.deleteSuccess'), [
                { text: t('common:buttons.ok'), onPress: () => router.back() },
              ]);
            } catch (error) {
              Alert.alert(t('common:status.error'), toErrorMessage(error) || t('transactions:messages.deleteFailed'));
            }
          },
        },
      ]
    );
  };

  if (islemLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text color="secondary" style={{ marginTop: spacing.md }}>{t('common:status.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!islem) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text color="error">{t('transactions:messages.transactionNotFound')}</Text>
          <Button variant="outline" onPress={() => router.back()} style={{ marginTop: spacing.lg }}>
            {t('common:buttons.back')}
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: t('transactions:scheduled.title'),
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <View style={styles.header}>
              <Text variant="h2">{t(`transactions:types.${islemType}`)} {t('common:buttons.edit')}</Text>
              <Text variant="caption" color="secondary">
                {t('transactions:messages.typeCannotChange')}
              </Text>
            </View>

            {/* Form */}
            <View style={styles.section}>
              {/* Tutar */}
              <CurrencyInput
                label={isLeave ? t('staff:leave.dayCountLabel') : t('transactions:form.amount')}
                value={amount}
                onChangeText={setAmount}
                error={errors.amount}
                placeholder={isLeave ? '0' : undefined}
                {...(isLeave ? { prefix: t('staff:leave.days') } : {})}
              />

              {/* Hesap Seçici */}
              {needsHesap && (
                <View style={styles.pickerContainer}>
                  <Text variant="label" color="secondary" style={styles.pickerLabel}>
                    {t('transactions:form.account')}
                  </Text>
                  <TouchableOpacity
                    style={[styles.picker, errors.hesap && styles.pickerError]}
                    onPress={() => {
                      setHesapPickerTarget('source');
                      setHesapSearchQuery('');
                      setShowHesapPicker(true);
                      setShowCariPicker(false);
                      setShowPersonelPicker(false);
                    }}
                  >
                    <View style={styles.pickerContent}>
                      {selectedHesap && (
                        <View style={[styles.pickerIcon, { backgroundColor: colors.infoLight }]}>
                          <Wallet size={16} color={colors.info} />
                        </View>
                      )}
                      <Text variant="body" style={styles.pickerText}>
                        {selectedHesap?.name || t('transactions:form.accountPlaceholder')}
                      </Text>
                      {selectedHesap && (
                        <Text style={[styles.pickerBalance, { color: Number(selectedHesap.balance) >= 0 ? colors.success : colors.error }]}>
                          {formatCurrency(Number(selectedHesap.balance), selectedHesap.currency)}
                        </Text>
                      )}
                    </View>
                    <ChevronDown size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                  {errors.hesap && (
                    <Text variant="caption" color="error" style={styles.errorText}>
                      {errors.hesap}
                    </Text>
                  )}
                </View>
              )}

              {/* Hedef Hesap Seçici (Transfer için) */}
              {needsHedefHesap && (
                <View style={styles.pickerContainer}>
                  <Text variant="label" color="secondary" style={styles.pickerLabel}>
                    {t('transactions:form.targetAccount')}
                  </Text>
                  <TouchableOpacity
                    style={styles.picker}
                    onPress={() => {
                      setHesapPickerTarget('hedef');
                      setHesapSearchQuery('');
                      setShowHesapPicker(true);
                      setShowCariPicker(false);
                      setShowPersonelPicker(false);
                    }}
                  >
                    <View style={styles.pickerContent}>
                      {selectedHedefHesap && (
                        <View style={[styles.pickerIcon, { backgroundColor: colors.infoLight }]}>
                          <Wallet size={16} color={colors.info} />
                        </View>
                      )}
                      <Text variant="body" style={styles.pickerText}>
                        {selectedHedefHesap?.name || t('transactions:form.selectTargetAccount')}
                      </Text>
                      {selectedHedefHesap && (
                        <Text style={[styles.pickerBalance, { color: Number(selectedHedefHesap.balance) >= 0 ? colors.success : colors.error }]}>
                          {formatCurrency(Number(selectedHedefHesap.balance), selectedHedefHesap.currency)}
                        </Text>
                      )}
                    </View>
                    <ChevronDown size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              )}

              {/* Kategori Seçici */}
              {needsKategori && (
                <CategoryPicker
                  value={kategoriId}
                  onChange={setKategoriId}
                  type={['gelir', 'cari_satis', 'cari_tahsilat', 'personel_tahsilat', 'personel_satis'].includes(islemType || '') ? 'gelir' : 'gider'}
                  label={t('transactions:form.category')}
                />
              )}

              {/* Cari Seçici */}
              {needsCari && (
                <View style={styles.pickerContainer}>
                  <Text variant="label" color="secondary" style={styles.pickerLabel}>
                    {t('clients:titles.client')}
                  </Text>
                  <TouchableOpacity
                    style={styles.picker}
                    onPress={() => {
                      setShowCariPicker(true);
                      setCariSearchQuery('');
                    }}
                  >
                    <View style={styles.pickerContent}>
                      {selectedCari && (
                        <View style={[styles.pickerIcon, { backgroundColor: colors.primaryLight }]}>
                          <Users size={16} color={colors.primary} />
                        </View>
                      )}
                      <Text variant="body" style={styles.pickerText}>
                        {selectedCari?.name || t('clients:form.selectClient')}
                      </Text>
                      {selectedCari && (
                        <Text style={[styles.pickerBalance, { color: Number(selectedCari.balance) >= 0 ? colors.success : colors.error }]}>
                          {formatCurrency(Number(selectedCari.balance), selectedCari.currency)}
                        </Text>
                      )}
                    </View>
                    <ChevronDown size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              )}

              {/* Personel Seçici */}
              {needsPersonel && (
                <View style={styles.pickerContainer}>
                  <Text variant="label" color="secondary" style={styles.pickerLabel}>
                    {t('staff:titles.personnel')}
                  </Text>
                  <TouchableOpacity
                    style={styles.picker}
                    onPress={() => {
                      setShowPersonelPicker(true);
                      setPersonelSearchQuery('');
                    }}
                  >
                    <View style={styles.pickerContent}>
                      {selectedPersonel && (
                        <View style={[styles.pickerIcon, { backgroundColor: colors.orangeLight }]}>
                          <UserCheck size={16} color={colors.orange} />
                        </View>
                      )}
                      <Text variant="body" style={styles.pickerText}>
                        {selectedPersonel
                          ? `${selectedPersonel.first_name} ${selectedPersonel.last_name}`
                          : t('staff:transactionForm.selectPersonel')}
                      </Text>
                      {selectedPersonel && !isLeave && (
                        <Text style={[styles.pickerBalance, { color: Number(selectedPersonel.balance) >= 0 ? colors.success : colors.error }]}>
                          {formatCurrency(Math.abs(Number(selectedPersonel.balance)), selectedPersonel.currency)}
                        </Text>
                      )}
                    </View>
                    <ChevronDown size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              )}

              {/* Planlanan Tarih */}
              <DateTimePicker
                label={t('transactions:future.dueDate')}
                value={scheduledDate ? parseDateFromDB(scheduledDate) : new Date()}
                onChange={(newDate) => setScheduledDate(formatDateForDB(newDate))}
                mode="date"
              />

              {/* Açıklama */}
              <Input
                label={t('transactions:form.descriptionOptional')}
                placeholder={t('transactions:form.transactionNote')}
                multiline
                numberOfLines={3}
                value={description}
                onChangeText={setDescription}
              />
            </View>

            {/* Buttons */}
            <View style={styles.buttons}>
              <Button
                variant="outline"
                size="lg"
                onPress={() => router.back()}
                style={styles.button}
              >
                {t('common:buttons.cancel')}
              </Button>
              <Button
                variant="primary"
                size="lg"
                loading={updateIslem.isPending}
                onPress={handleSubmit}
                style={styles.button}
              >
                {t('common:buttons.update')}
              </Button>
            </View>

            {/* Delete Button */}
            <View style={styles.deleteSection}>
              <Button
                variant="outline"
                size="lg"
                onPress={handleDelete}
                loading={deleteIslem.isPending}
                style={styles.deleteButton}
              >
                <Text color="error">{t('common:buttons.delete')}</Text>
              </Button>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Hesap Seçici Modal */}
      <Modal
        visible={showHesapPicker}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowHesapPicker(false);
          setHesapSearchQuery('');
        }}
      >
        <TouchableWithoutFeedback
          onPress={() => {
            setShowHesapPicker(false);
            setHesapSearchQuery('');
          }}
        >
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={[styles.modalContent, { height: windowHeight * 0.7 }]}>
                {/* Header */}
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {hesapPickerTarget === 'source'
                      ? t('transactions:form.account')
                      : t('transactions:form.targetAccount')}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowHesapPicker(false);
                      setHesapSearchQuery('');
                    }}
                  >
                    <X size={24} color={colors.text} />
                  </TouchableOpacity>
                </View>

                {/* Search */}
                <View style={styles.searchContainer}>
                  <Search size={20} color={colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder={t('common:search.searchPlaceholder')}
                    placeholderTextColor={colors.textMuted}
                    value={hesapSearchQuery}
                    onChangeText={setHesapSearchQuery}
                  />
                  {hesapSearchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setHesapSearchQuery('')}>
                      <X size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* List */}
                <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent}>
                  {filteredHesaplar.map((hesap) => {
                    const isSelected = hesapPickerTarget === 'source'
                      ? hesap.id === hesapId
                      : hesap.id === hedefHesapId;
                    return (
                      <TouchableOpacity
                        key={hesap.id}
                        style={[styles.modalItem, isSelected && styles.modalItemSelected]}
                        onPress={() => {
                          if (hesapPickerTarget === 'source') {
                            setHesapId(hesap.id);
                          } else {
                            setHedefHesapId(hesap.id);
                          }
                          setShowHesapPicker(false);
                          setHesapSearchQuery('');
                        }}
                      >
                        <View style={[styles.modalItemIcon, { backgroundColor: colors.infoLight }]}>
                          <Wallet size={20} color={colors.info} />
                        </View>
                        <Text style={[styles.modalItemText, isSelected && { color: colors.primary }]}>
                          {hesap.name}
                        </Text>
                        <Text
                          style={[
                            styles.modalItemBalance,
                            { color: Number(hesap.balance) >= 0 ? colors.success : colors.error },
                          ]}
                        >
                          {formatCurrency(Number(hesap.balance), hesap.currency)}
                        </Text>
                        {isSelected && (
                          <View style={[styles.checkIcon, { backgroundColor: colors.primary }]}>
                            <Check size={14} color="#FFFFFF" />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                  {filteredHesaplar.length === 0 && hesapSearchQuery.trim() && (
                    <View style={styles.emptyState}>
                      <Search size={48} color={colors.textMuted} />
                      <Text style={styles.emptyStateText}>{t('common:search.noResults')}</Text>
                    </View>
                  )}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Cari Seçici Modal */}
      <Modal
        visible={showCariPicker}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowCariPicker(false);
          setCariSearchQuery('');
        }}
      >
        <TouchableWithoutFeedback
          onPress={() => {
            setShowCariPicker(false);
            setCariSearchQuery('');
          }}
        >
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={[styles.modalContent, { height: windowHeight * 0.7 }]}>
                {/* Header */}
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{t('clients:titles.client')}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowCariPicker(false);
                      setCariSearchQuery('');
                    }}
                  >
                    <X size={24} color={colors.text} />
                  </TouchableOpacity>
                </View>

                {/* Search */}
                <View style={styles.searchContainer}>
                  <Search size={20} color={colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder={t('clients:search.searchClients')}
                    placeholderTextColor={colors.textMuted}
                    value={cariSearchQuery}
                    onChangeText={setCariSearchQuery}
                  />
                  {cariSearchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setCariSearchQuery('')}>
                      <X size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* List */}
                <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent}>
                  {filteredCariler.map((cari) => {
                    const isSelected = cari.id === cariId;
                    return (
                      <TouchableOpacity
                        key={cari.id}
                        style={[styles.modalItem, isSelected && styles.modalItemSelected]}
                        onPress={() => {
                          setCariId(cari.id);
                          setShowCariPicker(false);
                          setCariSearchQuery('');
                        }}
                      >
                        <View style={[styles.modalItemIcon, { backgroundColor: colors.primaryLight }]}>
                          <Users size={20} color={colors.primary} />
                        </View>
                        <Text style={[styles.modalItemText, isSelected && { color: colors.primary }]}>
                          {cari.name}
                        </Text>
                        <Text
                          style={[
                            styles.modalItemBalance,
                            { color: Number(cari.balance) >= 0 ? colors.success : colors.error },
                          ]}
                        >
                          {formatCurrency(Number(cari.balance), cari.currency)}
                        </Text>
                        {isSelected && (
                          <View style={[styles.checkIcon, { backgroundColor: colors.primary }]}>
                            <Check size={14} color="#FFFFFF" />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                  {filteredCariler.length === 0 && cariSearchQuery.trim() && (
                    <View style={styles.emptyState}>
                      <Search size={48} color={colors.textMuted} />
                      <Text style={styles.emptyStateText}>{t('common:search.noResults')}</Text>
                    </View>
                  )}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Personel Seçici Modal */}
      <Modal
        visible={showPersonelPicker}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowPersonelPicker(false);
          setPersonelSearchQuery('');
        }}
      >
        <TouchableWithoutFeedback
          onPress={() => {
            setShowPersonelPicker(false);
            setPersonelSearchQuery('');
          }}
        >
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={[styles.modalContent, { height: windowHeight * 0.7 }]}>
                {/* Header */}
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{t('staff:transactionForm.selectPersonel')}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowPersonelPicker(false);
                      setPersonelSearchQuery('');
                    }}
                  >
                    <X size={24} color={colors.text} />
                  </TouchableOpacity>
                </View>

                {/* Search */}
                <View style={styles.searchContainer}>
                  <Search size={20} color={colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder={t('staff:search.searchPersonnel')}
                    placeholderTextColor={colors.textMuted}
                    value={personelSearchQuery}
                    onChangeText={setPersonelSearchQuery}
                  />
                  {personelSearchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setPersonelSearchQuery('')}>
                      <X size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* List */}
                <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent}>
                  {filteredPersonel.map((personel) => {
                    const isSelected = personel.id === personelId;
                    return (
                      <TouchableOpacity
                        key={personel.id}
                        style={[styles.modalItem, isSelected && styles.modalItemSelected]}
                        onPress={() => {
                          setPersonelId(personel.id);
                          setShowPersonelPicker(false);
                          setPersonelSearchQuery('');
                        }}
                      >
                        <View style={[styles.modalItemIcon, { backgroundColor: colors.orangeLight }]}>
                          <UserCheck size={20} color={colors.orange} />
                        </View>
                        <Text style={[styles.modalItemText, isSelected && { color: colors.primary }]}>
                          {personel.first_name} {personel.last_name}
                        </Text>
                        <Text
                          style={[
                            styles.modalItemBalance,
                            { color: Number(personel.balance) >= 0 ? colors.success : colors.error },
                          ]}
                        >
                          {formatCurrency(Math.abs(Number(personel.balance)), personel.currency)}
                        </Text>
                        {isSelected && (
                          <View style={[styles.checkIcon, { backgroundColor: colors.orange }]}>
                            <Check size={14} color="#FFFFFF" />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                  {filteredPersonel.length === 0 && personelSearchQuery.trim() && (
                    <View style={styles.emptyState}>
                      <Search size={48} color={colors.textMuted} />
                      <Text style={styles.emptyStateText}>{t('common:search.noResults')}</Text>
                    </View>
                  )}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing['3xl'],
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  pickerContainer: {
    marginBottom: spacing.lg,
  },
  pickerLabel: {
    marginBottom: spacing.sm,
  },
  picker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  pickerError: {
    borderColor: colors.error,
  },
  pickerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pickerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerText: {
    flex: 1,
  },
  pickerBalance: {
    fontSize: 14,
    fontWeight: '500',
    marginRight: spacing.sm,
  },
  errorText: {
    marginTop: spacing.xs,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  modalList: {
    flex: 1,
  },
  modalListContent: {
    padding: 12,
    paddingBottom: 24,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    marginBottom: 8,
  },
  modalItemSelected: {
    backgroundColor: colors.primaryLight + '30',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  modalItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  modalItemText: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  modalItemBalance: {
    fontSize: 16,
    marginRight: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 4,
  },
  checkIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyStateText: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 12,
  },
  buttons: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  button: {
    flex: 1,
  },
  deleteSection: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  deleteButton: {
    borderColor: colors.error,
  },
});
