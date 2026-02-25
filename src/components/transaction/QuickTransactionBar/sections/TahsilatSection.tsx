import { View, TouchableOpacity } from 'react-native';
import {
  Wallet,
  Building2,
  Users,
  UserCheck,
  ArrowRight,
  ChevronDown,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { formatCurrency } from '@/lib/currency';
import { styles } from '../styles';
import type { TahsilatHedefType } from '../types';

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

export interface TahsilatSectionProps {
  selectedHesap: Hesap | null | undefined;
  selectedHedefHesap: Hesap | null | undefined;
  selectedCari: Cari | null | undefined;
  selectedPersonel: Personel | null | undefined;
  tahsilatHedefType: TahsilatHedefType;
  onOpenTahsilatTypePicker: () => void;
  onOpenCariPicker: () => void;
  onOpenPersonelPicker: () => void;
  onOpenHedefHesapPicker: () => void;
}

export function TahsilatSection({
  selectedHesap,
  selectedHedefHesap,
  selectedCari,
  selectedPersonel,
  tahsilatHedefType,
  onOpenTahsilatTypePicker,
  onOpenCariPicker,
  onOpenPersonelPicker,
  onOpenHedefHesapPicker,
}: TahsilatSectionProps) {
  const { t } = useTranslation(['transactions', 'clients', 'staff', 'accounts']);

  return (
    <>
      {/* Tahsilat Türü → Hedef Hesap Satırı */}
      <View style={styles.paymentRow}>
        {/* Sol: Tahsilat Türü Seçici */}
        <TouchableOpacity style={styles.paymentRowLeft} onPress={onOpenTahsilatTypePicker}>
          {tahsilatHedefType === 'musteri' ? (
            <Users size={16} color={colors.success} />
          ) : tahsilatHedefType === 'tedarikci' ? (
            <Building2 size={16} color={colors.success} />
          ) : tahsilatHedefType === 'personel' ? (
            <UserCheck size={16} color={colors.success} />
          ) : null}
          <Text
            style={[styles.paymentTypeText, !tahsilatHedefType && { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {tahsilatHedefType === 'musteri'
              ? t('clients:transactionTitles.customerCollection')
              : tahsilatHedefType === 'tedarikci'
                ? t('clients:transactionTitles.supplierCollection')
                : tahsilatHedefType === 'personel'
                  ? t('staff:transactionTitles.collection')
                  : t('transactions:form.selectCollectionType')}
          </Text>
          <ChevronDown size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Ok */}
        <ArrowRight size={18} color={colors.success} />

        {/* Sağ: Hedef Hesap (seçilebilir) */}
        <TouchableOpacity style={styles.paymentRowRight} onPress={onOpenHedefHesapPicker}>
          <Wallet size={16} color={colors.primary} />
          <View style={styles.paymentAccountInfo}>
            <Text style={styles.paymentAccountName} numberOfLines={1}>
              {selectedHedefHesap?.name || selectedHesap?.name || t('accounts:titles.selectAccount')}
            </Text>
            {(selectedHedefHesap || selectedHesap) && (
              <Text
                style={[
                  styles.paymentAccountBalance,
                  {
                    color:
                      Number((selectedHedefHesap || selectedHesap)?.balance) >= 0
                        ? colors.success
                        : colors.error,
                  },
                ]}
              >
                {formatCurrency(Number((selectedHedefHesap || selectedHesap)?.balance), (selectedHedefHesap || selectedHesap)?.currency)}
              </Text>
            )}
          </View>
          <ChevronDown size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Müşteri Seçici */}
      {tahsilatHedefType === 'musteri' && (
        <TouchableOpacity style={styles.pickerButton} onPress={onOpenCariPicker}>
          <Users size={18} color={colors.success} />
          <Text style={styles.pickerButtonText}>
            {selectedCari ? selectedCari.name : t('clients:transactionForm.selectCustomer')}
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

      {/* Tedarikçi Seçici */}
      {tahsilatHedefType === 'tedarikci' && (
        <TouchableOpacity style={styles.pickerButton} onPress={onOpenCariPicker}>
          <Building2 size={18} color={colors.success} />
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
      {tahsilatHedefType === 'personel' && (
        <TouchableOpacity style={styles.pickerButton} onPress={onOpenPersonelPicker}>
          <UserCheck size={18} color={colors.success} />
          <Text style={styles.pickerButtonText}>
            {selectedPersonel
              ? `${selectedPersonel.first_name}${selectedPersonel.last_name ? ` ${selectedPersonel.last_name}` : ''}`
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
    </>
  );
}
