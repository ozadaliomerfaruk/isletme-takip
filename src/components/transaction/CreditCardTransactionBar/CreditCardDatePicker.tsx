import { DateTimePickerModal } from '@/components/transaction/QuickTransactionBar/components/DateTimePickerModal';

interface CreditCardDatePickerProps {
  visible: boolean;
  date: Date;
  onDateChange: (date: Date) => void;
  onDismiss: () => void;
  locale: string;
  t: (key: string) => string;
}

/**
 * Kredi kartı QTB'si ana QTB ile aynı tarih sözleşmesini kullanır. Ayrı bir
 * picker kopyası tutmak 1970/epoch ve iOS kontrollü-state düzeltmelerinin iki
 * yerde zamanla ayrışmasına neden oluyordu.
 */
export function CreditCardDatePicker({
  visible,
  date,
  onDateChange,
  onDismiss,
  locale,
}: CreditCardDatePickerProps) {
  return (
    <DateTimePickerModal
      visible={visible}
      value={date}
      onChange={onDateChange}
      onDismiss={onDismiss}
      locale={locale}
    />
  );
}
