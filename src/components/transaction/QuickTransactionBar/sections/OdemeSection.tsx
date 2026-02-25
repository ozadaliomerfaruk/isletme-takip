import { View, TouchableOpacity } from 'react-native';
import {
  Wallet,
  Building2,
  UserCheck,
  CreditCard,
  ArrowRight,
  ChevronDown,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { formatCurrency } from '@/lib/currency';
import { styles } from '../styles';
import type { OdemeHedefType } from '../types';

interface Hesap {
  id: string;
  name: string;
  balance: number;
  currency?: string;
}

interface Cari {
  id: string;
  name: string;
  balance: number;
  currency?: string;
}

interface Personel {
  id: string;
  first_name: string;
  last_name: string | null;
  balance: number;
  currency?: string;
}

export interface OdemeSectionProps {
  selectedHesap: Hesap | null | undefined;
  selectedSourceHesap: Hesap | null | undefined;
  selectedCari: Cari | null | undefined;
  selectedPersonel: Personel | null | undefined;
  selectedKrediKarti: Hesap | null | undefined;
  odemeHedefType: OdemeHedefType;
  onOpenOdemeTypePicker: () => void;
  onOpenCariPicker: () => void;
  onOpenPersonelPicker: () => void;
  onOpenSourceHesapPicker: () => void;
  onOpenKrediKartiPicker: () => void;
}

export function OdemeSection({
  selectedHesap,
  selectedSourceHesap: _selectedSourceHesap,
  selectedCari,
  selectedPersonel,
  selectedKrediKarti,
  odemeHedefType,
  onOpenOdemeTypePicker,
  onOpenCariPicker,
  onOpenPersonelPicker,
  onOpenSourceHesapPicker: _onOpenSourceHesapPicker,
  onOpenKrediKartiPicker,
}: OdemeSectionProps) {
  const { t } = useTranslation(['transactions', 'clients', 'staff', 'accounts']);

  return (
    <>
      {/* Kaynak Hesap → Ödeme Türü Satırı */}
      <View style={styles.paymentRow}>
        {/* Sol: Kaynak Hesap (sabit) */}
        <View style={styles.paymentRowLeft}>
          <Wallet size={16} color={colors.primary} />
          <View style={styles.paymentAccountInfo}>
            <Text style={styles.paymentAccountName} numberOfLines={1}>
              {selectedHesap?.name || t('accounts:titles.accounts')}
            </Text>
            {selectedHesap && (
              <Text
                style={[
                  styles.paymentAccountBalance,
                  { color: Number(selectedHesap.balance) >= 0 ? colors.success : colors.error },
                ]}
              >
                {formatCurrency(Number(selectedHesap.balance), selectedHesap.currency)}
              </Text>
            )}
          </View>
        </View>

        {/* Ok */}
        <ArrowRight size={18} color={colors.orange} />

        {/* Sağ: Ödeme Türü Seçici */}
        <TouchableOpacity style={styles.paymentRowRight} onPress={onOpenOdemeTypePicker}>
          {odemeHedefType === 'tedarikci' ? (
            <Building2 size={16} color={colors.orange} />
          ) : odemeHedefType === 'staff' ? (
            <UserCheck size={16} color={colors.orange} />
          ) : odemeHedefType === 'kredi_karti' ? (
            <CreditCard size={16} color={colors.orange} />
          ) : null}
          <Text
            style={[styles.paymentTypeText, !odemeHedefType && { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {odemeHedefType === 'tedarikci'
              ? t('clients:transactionTitles.supplierPayment')
              : odemeHedefType === 'staff'
                ? t('staff:transactionTitles.payment')
                : odemeHedefType === 'kredi_karti'
                  ? t('accounts:transactionTitles.creditCardPayment')
                  : t('transactions:form.selectPaymentType')}
          </Text>
          <ChevronDown size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Tedarikçi Seçici */}
      {odemeHedefType === 'tedarikci' && (
        <TouchableOpacity style={styles.pickerButton} onPress={onOpenCariPicker}>
          <Building2 size={18} color={colors.orange} />
          <Text style={styles.pickerButtonText}>
            {selectedCari ? selectedCari.name : t('clients:transactionForm.selectSupplier')}
          </Text>
          {selectedCari && (
            <Text
              style={[
                styles.balanceText,
                { color: Number(selectedCari.balance) >= 0 ? colors.success : colors.error },
              ]}
            >
              {formatCurrency(Number(selectedCari.balance), selectedCari.currency)}
            </Text>
          )}
          <ChevronDown size={18} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      {/* Personel Seçici */}
      {odemeHedefType === 'staff' && (
        <TouchableOpacity style={styles.pickerButton} onPress={onOpenPersonelPicker}>
          <UserCheck size={18} color={colors.orange} />
          <Text style={styles.pickerButtonText}>
            {selectedPersonel
              ? `${selectedPersonel.first_name} ${selectedPersonel.last_name}`
              : t('staff:transactionForm.selectPersonel')}
          </Text>
          {selectedPersonel && (
            <Text
              style={[
                styles.balanceText,
                { color: Number(selectedPersonel.balance) >= 0 ? colors.success : colors.error },
              ]}
            >
              {formatCurrency(Number(selectedPersonel.balance), selectedPersonel.currency)}
            </Text>
          )}
          <ChevronDown size={18} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      {/* Kredi Kartı Seçici - sadece hedef kredi kartı seç (kaynak hesap üstte zaten gösteriliyor) */}
      {odemeHedefType === 'kredi_karti' && (
        <TouchableOpacity style={styles.pickerButton} onPress={onOpenKrediKartiPicker}>
          <CreditCard size={18} color={colors.orange} />
          <Text style={styles.pickerButtonText}>
            {selectedKrediKarti
              ? selectedKrediKarti.name
              : t('accounts:titles.selectCreditCard')}
          </Text>
          {selectedKrediKarti && (
            <Text
              style={[
                styles.balanceText,
                { color: colors.error },
              ]}
            >
              {formatCurrency(Math.abs(Number(selectedKrediKarti.balance)), selectedKrediKarti.currency)}
            </Text>
          )}
          <ChevronDown size={18} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </>
  );
}
