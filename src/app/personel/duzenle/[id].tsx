import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Calendar, X } from 'lucide-react-native';
import { Text, Input, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { usePersonelById, useUpdatePersonel } from '@/hooks/usePersonel';
import { formatDateForDB } from '@/lib/date';
import { useDateFormat } from '@/hooks/useDateFormat';

export default function PersonelDuzenlePage() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation(['staff', 'common', 'errors']);
  const { locale, formatDateNative } = useDateFormat();
  const { data: personel, isLoading } = usePersonelById(id);
  const updatePersonel = useUpdatePersonel();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState('');
  const [salary, setSalary] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [errors, setErrors] = useState<{ firstName?: string }>({});

  useEffect(() => {
    if (personel) {
      setFirstName(personel.first_name);
      setLastName(personel.last_name || '');
      setPhone(personel.phone || '');
      setPosition(personel.position || '');
      setSalary(personel.salary ? String(personel.salary) : '');
      setStartDate(personel.start_date ? new Date(personel.start_date) : null);
    }
  }, [personel]);

  const validate = () => {
    const newErrors: { firstName?: string } = {};

    if (!firstName.trim()) {
      newErrors.firstName = t('staff:validation.firstNameRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !id) return;

    try {
      await updatePersonel.mutateAsync({
        id,
        first_name: firstName.trim(),
        last_name: lastName.trim() || null,
        phone: phone.trim() || null,
        position: position.trim() || null,
        salary: salary ? parseFloat(salary.replace(',', '.')) : null,
        start_date: startDate ? formatDateForDB(startDate) : null,
      });

      Alert.alert(t('common:status.success'), t('staff:messages.updateSuccess'), [
        { text: t('common:buttons.ok'), onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert(t('common:status.error'), error.message || t('errors:personel.updateFailed'));
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text>{t('common:status.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!personel) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text>{t('errors:personel.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
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
            {/* Form */}
            <View style={styles.section}>
              <Input
                label={t('staff:form.firstName')}
                placeholder={t('staff:form.firstNamePlaceholder')}
                value={firstName}
                onChangeText={setFirstName}
                error={errors.firstName}
              />

              <Input
                label={t('staff:form.lastNameOptional')}
                placeholder={t('staff:form.lastNamePlaceholder')}
                value={lastName}
                onChangeText={setLastName}
              />

              <Input
                label={t('staff:form.phoneOptional')}
                placeholder={t('staff:form.phoneExample')}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />

              <Input
                label={t('staff:form.positionOptional')}
                placeholder={t('staff:form.positionPlaceholder')}
                value={position}
                onChangeText={setPosition}
              />

              <Input
                label={t('staff:form.salaryOptional')}
                placeholder={t('staff:form.salaryPlaceholder')}
                keyboardType="decimal-pad"
                value={salary}
                onChangeText={setSalary}
              />

              {/* İşe Başlama Tarihi */}
              <View style={styles.dateField}>
                <Text variant="label" style={styles.dateLabel}>
                  {t('staff:form.startDateOptional')}
                </Text>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Calendar size={20} color={colors.textMuted} />
                  <Text
                    variant="body"
                    color={startDate ? 'primary' : 'secondary'}
                    style={styles.dateText}
                  >
                    {startDate
                      ? formatDateNative(startDate)
                      : t('staff:form.selectDate')}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* iOS için DateTimePicker Modal */}
              {Platform.OS === 'ios' && showDatePicker && (
                <Modal visible={showDatePicker} transparent animationType="slide">
                  <Pressable
                    style={styles.datePickerModalOverlay}
                    onPress={() => setShowDatePicker(false)}
                  >
                    <Pressable
                      style={styles.datePickerModalContent}
                      onPress={(e) => e.stopPropagation()}
                    >
                      <View style={styles.datePickerModalHeader}>
                        <Text variant="h3">{t('staff:form.startDate')}</Text>
                        <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                          <X size={24} color={colors.text} />
                        </TouchableOpacity>
                      </View>
                      <DateTimePicker
                        value={startDate || new Date()}
                        mode="date"
                        display="inline"
                        onChange={(event, date) => {
                          if (date) {
                            setStartDate(date);
                          }
                        }}
                        maximumDate={new Date()}
                        locale={locale}
                        themeVariant="light"
                        accentColor={colors.primary}
                        style={{ height: 350 }}
                      />
                      <Button
                        variant="primary"
                        onPress={() => setShowDatePicker(false)}
                        style={{ marginTop: spacing.md }}
                      >
                        {t('common:buttons.ok')}
                      </Button>
                    </Pressable>
                  </Pressable>
                </Modal>
              )}

              {/* Android için DateTimePicker */}
              {Platform.OS === 'android' && showDatePicker && (
                <DateTimePicker
                  value={startDate || new Date()}
                  mode="date"
                  display="default"
                  onChange={(event, date) => {
                    setShowDatePicker(false);
                    if (event.type === 'set' && date) {
                      setStartDate(date);
                    }
                  }}
                  maximumDate={new Date()}
                />
              )}
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
                loading={updatePersonel.isPending}
                onPress={handleSubmit}
                style={styles.button}
              >
                {t('common:buttons.update')}
              </Button>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
    </SafeAreaView>
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
    paddingTop: spacing['3xl'],
    paddingBottom: spacing['3xl'],
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
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
  // Date picker styles
  dateField: {
    marginBottom: spacing.md,
  },
  dateLabel: {
    marginBottom: spacing.xs,
    color: colors.text,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  dateText: {
    flex: 1,
  },
  datePickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  datePickerModalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
  },
  datePickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
});
