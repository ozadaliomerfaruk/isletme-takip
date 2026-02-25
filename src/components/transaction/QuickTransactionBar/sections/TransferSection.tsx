import { View, TouchableOpacity } from 'react-native';
import { Wallet, ArrowRight, ChevronDown } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { formatCurrency } from '@/lib/currency';
import { styles } from '../styles';

interface Hesap {
  id: string;
  name: string;
  balance: number;
  currency?: string;
}

export interface TransferSectionProps {
  selectedHesap: Hesap | null | undefined;
  selectedHedefHesap: Hesap | null | undefined;
  onOpenHedefHesapPicker: () => void;
}

export function TransferSection({
  selectedHesap,
  selectedHedefHesap,
  onOpenHedefHesapPicker,
}: TransferSectionProps) {
  const { t } = useTranslation(['accounts', 'transactions']);

  return (
    <View style={styles.sourceAccountRow}>
      <Wallet size={16} color={colors.textMuted} />
      <Text style={styles.sourceAccountText}>
        {selectedHesap?.name || t('accounts:titles.accounts')}
      </Text>
      {selectedHesap && (
        <Text
          style={[
            styles.balanceTextSmall,
            { color: Number(selectedHesap.balance) >= 0 ? colors.success : colors.error },
          ]}
        >
          {formatCurrency(Number(selectedHesap.balance), selectedHesap.currency)}
        </Text>
      )}
      <ArrowRight size={16} color={colors.info} />
      <TouchableOpacity style={styles.targetAccountButton} onPress={onOpenHedefHesapPicker}>
        <Text style={styles.targetAccountText}>
          {selectedHedefHesap ? selectedHedefHesap.name : t('transactions:form.targetAccount')}
        </Text>
        {selectedHedefHesap && (
          <Text
            style={[
              styles.balanceTextSmall,
              {
                color: Number(selectedHedefHesap.balance) >= 0 ? colors.success : colors.error,
                marginRight: 4,
              },
            ]}
          >
            {formatCurrency(Number(selectedHedefHesap.balance), selectedHedefHesap.currency)}
          </Text>
        )}
        <ChevronDown size={16} color={colors.info} />
      </TouchableOpacity>
    </View>
  );
}
