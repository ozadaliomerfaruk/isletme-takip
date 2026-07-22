import { View, TouchableOpacity } from 'react-native';
import { Wallet, Building2, Users, UserCheck, ChevronDown } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { formatCurrency } from '@/lib/currency';
import { styles } from '../styles';
import type { TransactionType } from '../types';
import type { CariType } from '@/types/database';

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

export interface EntityDisplaySectionProps {
  type: TransactionType;
  isCariMode: boolean;
  isPersonelMode: boolean;
  defaultCariType?: CariType;
  selectedHesap: Hesap | null | undefined;
  selectedSourceHesap: Hesap | null | undefined;
  selectedCari: Cari | null | undefined;
  selectedPersonel: Personel | null | undefined;
  onOpenHesapPicker: () => void;
}

export function EntityDisplaySection({
  type,
  isCariMode,
  isPersonelMode,
  defaultCariType,
  selectedHesap,
  selectedSourceHesap,
  selectedCari,
  selectedPersonel,
  onOpenHesapPicker,
}: EntityDisplaySectionProps) {
  const { t } = useTranslation(['accounts']);

  return (
    <>
      {/* Normal Mod: Gelir/Gider için Hesap Bilgisi */}
      {!isCariMode && !isPersonelMode && (type === 'gelir' || type === 'gider') && selectedHesap && (
        <View style={styles.sourceAccountRow}>
          <Wallet size={16} color={colors.primary} />
          <Text style={styles.sourceAccountText}>{selectedHesap.name}</Text>
          <Text
            style={[
              styles.balanceText,
              { color: Number(selectedHesap.balance) >= 0 ? colors.success : colors.error },
            ]}
          >
            {formatCurrency(Number(selectedHesap.balance), selectedHesap.currency)}
          </Text>
        </View>
      )}

      {/* Cari Modunda Ödeme/Tahsilat için Kaynak Hesap Seçimi (üstte) */}
      {isCariMode && (type === 'odeme' || type === 'tahsilat') && (
        <TouchableOpacity style={styles.sourceAccountRow} onPress={onOpenHesapPicker}>
          <Wallet size={16} color={colors.textMuted} />
          <Text style={styles.sourceAccountText}>
            {selectedSourceHesap?.name || t('accounts:titles.selectAccount')}
          </Text>
          {selectedSourceHesap && (
            <Text
              style={[
                styles.balanceText,
                {
                  color:
                    Number(selectedSourceHesap.balance) >= 0 ? colors.success : colors.error,
                },
              ]}
            >
              {formatCurrency(Number(selectedSourceHesap.balance), selectedSourceHesap.currency)}
            </Text>
          )}
          <ChevronDown size={16} color={colors.info} />
        </TouchableOpacity>
      )}

      {/* Cari Modu: Seçili cari bilgisi — zemin rengi yok, tip ayrımı ikon renginden */}
      {isCariMode && selectedCari && (
        <View style={styles.sourceAccountRow}>
          {defaultCariType === 'tedarikci' ? (
            <Building2 size={16} color={colors.orange} />
          ) : (
            <Users size={16} color={colors.primary} />
          )}
          <Text style={styles.sourceAccountText}>{selectedCari.name}</Text>
          <Text
            style={[
              styles.balanceText,
              { color: Number(selectedCari.balance) >= 0 ? colors.success : colors.error },
            ]}
          >
            {formatCurrency(Number(selectedCari.balance), selectedCari.currency)}
          </Text>
        </View>
      )}

      {/* Personel Modu: Seçili personel bilgisi */}
      {isPersonelMode && selectedPersonel && (
        <View style={styles.sourceAccountRow}>
          <UserCheck size={16} color={colors.success} />
          <Text style={styles.sourceAccountText}>
            {selectedPersonel.first_name}{selectedPersonel.last_name ? ` ${selectedPersonel.last_name}` : ''}
          </Text>
          <Text
            style={[
              styles.balanceText,
              { color: Number(selectedPersonel.balance) >= 0 ? colors.success : colors.error },
            ]}
          >
            {formatCurrency(Number(selectedPersonel.balance), selectedPersonel.currency)}
          </Text>
        </View>
      )}

      {/* Personel Modunda Ödeme/Tahsilat için Hesap Seçimi */}
      {isPersonelMode && (type === 'personel_odeme_tab' || type === 'personel_tahsilat_tab') && (
        <TouchableOpacity style={styles.sourceAccountRow} onPress={onOpenHesapPicker}>
          <Wallet size={16} color={colors.textMuted} />
          <Text style={styles.sourceAccountText}>
            {selectedSourceHesap?.name || t('accounts:titles.selectAccount')}
          </Text>
          {selectedSourceHesap && (
            <Text
              style={[
                styles.balanceText,
                {
                  color:
                    Number(selectedSourceHesap.balance) >= 0 ? colors.success : colors.error,
                },
              ]}
            >
              {formatCurrency(Number(selectedSourceHesap.balance), selectedSourceHesap.currency)}
            </Text>
          )}
          <ChevronDown size={16} color={colors.info} />
        </TouchableOpacity>
      )}
    </>
  );
}
