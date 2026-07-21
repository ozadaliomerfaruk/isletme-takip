import { View, ScrollView, TouchableOpacity, Modal } from 'react-native';
import {
  Receipt,
  Building2,
  Users,
  Tag,
  AlertTriangle,
  X,
} from 'lucide-react-native';
import { Text, FloatingSearchBar, FLOATING_SEARCH_CLEARANCE } from '@/components/ui';
import { colors } from '@/constants/colors';
import type { AccountMapping, ParsedTransaction } from '@/lib/excelImport';
import type { SkippedTransaction } from '@/hooks/useDataImport';
import type { ModalType } from './types';
import { styles } from './styles';
import {
  TransactionItem,
  AccountItem,
  ClientPersonelItem,
  SkippedTransactionItemSimple,
  CategoryItem,
} from './helpers';

interface DataImportModalProps {
  activeModal: ModalType;
  windowHeight: number;
  bottomInset: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onClose: () => void;
  // Data
  preview: { totalRows: number; uniqueCategories: string[] } | null;
  filteredTransactions: ParsedTransaction[];
  filteredAccounts: (AccountMapping & { name: string })[];
  filteredClientsAndPersonel: (AccountMapping & { name: string })[];
  filteredCategories: string[];
  categoryMappings: Record<string, 'gelir' | 'gider'>;
  result: { skipped?: number; skippedTransactions?: SkippedTransaction[] } | null;
  countByType: (type: 'hesap' | 'cari' | 'personel') => number;
  countCariAndPersonel: number;
  // Handlers
  onToggleFromHesap: (name: string) => void;
  onToggleToHesap: (name: string) => void;
  onToggleEntityType: (name: string, type: 'cari' | 'personel') => void;
  onSetHesapSubType: (name: string, subType: string) => void;
  onSetCariSubType: (name: string, subType: string) => void;
  onCycleAccountCurrency: (name: string) => void;
  onToggleCategoryType: (name: string) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export function DataImportModal({
  activeModal,
  windowHeight,
  bottomInset,
  searchQuery,
  onSearchChange,
  onClose,
  preview,
  filteredTransactions,
  filteredAccounts,
  filteredClientsAndPersonel,
  filteredCategories,
  categoryMappings,
  result,
  countByType,
  countCariAndPersonel,
  onToggleFromHesap,
  onToggleToHesap,
  onToggleEntityType,
  onSetHesapSubType,
  onSetCariSubType,
  onCycleAccountCurrency,
  onToggleCategoryType,
  t,
}: DataImportModalProps) {
  if (!activeModal) return null;

  const getModalTitle = () => {
    switch (activeModal) {
      case 'transactions': return t('dataImport.modal.transactions', { count: preview?.totalRows || 0 });
      case 'accounts': return t('dataImport.modal.accounts', { count: countByType('hesap') });
      case 'clients': return t('dataImport.modal.clients', { count: countCariAndPersonel });
      case 'categories': return t('dataImport.modal.categories', { count: preview?.uniqueCategories.length || 0 });
      case 'skipped': return t('dataImport.modal.skipped', { count: result?.skipped || 0 });
      default: return '';
    }
  };

  const getSearchPlaceholder = () => {
    switch (activeModal) {
      case 'transactions': return t('dataImport.search.transactions');
      case 'accounts': return t('dataImport.search.accounts');
      case 'clients': return t('dataImport.search.clientsStaff');
      case 'categories': return t('dataImport.search.categories');
      case 'skipped': return t('dataImport.search.skipped');
      default: return t('dataImport.search.default');
    }
  };

  return (
    <Modal
      visible={true}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={[styles.modalContent, { height: windowHeight * 0.7, paddingBottom: bottomInset }]}>
          <View style={styles.modalHeader}>
            <Text variant="h3">{getModalTitle()}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.listContainer}
            contentContainerStyle={[styles.listContent, { paddingBottom: FLOATING_SEARCH_CLEARANCE + 24 }]}
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
                      {t('dataImport.empty.transactions')}
                    </Text>
                  </View>
                )}
                {preview && preview.totalRows > 100 && filteredTransactions.length > 0 && (
                  <Text variant="caption" color="muted" style={styles.footerText}>
                    {t('dataImport.preview.showingFirst100', { total: preview.totalRows })}
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
                    onToggleType={() => onToggleFromHesap(item.name)}
                    onSubTypeChange={(subType) => onSetHesapSubType(item.name, subType)}
                    onCurrencyChange={() => onCycleAccountCurrency(item.name)}
                  />
                ))}
                {filteredAccounts.length === 0 && (
                  <View style={styles.emptyState}>
                    <Building2 size={48} color={colors.textMuted} />
                    <Text variant="body" color="secondary" style={styles.emptyText}>
                      {t('dataImport.empty.accounts')}
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
                    onToggleToHesap={() => onToggleToHesap(item.name)}
                    onToggleEntityType={(type) => onToggleEntityType(item.name, type)}
                    onSubTypeChange={(subType) => onSetCariSubType(item.name, subType)}
                  />
                ))}
                {filteredClientsAndPersonel.length === 0 && (
                  <View style={styles.emptyState}>
                    <Users size={48} color={colors.textMuted} />
                    <Text variant="body" color="secondary" style={styles.emptyText}>
                      {t('dataImport.empty.clientsStaff')}
                    </Text>
                  </View>
                )}
              </>
            )}

            {activeModal === 'categories' && (
              <>
                <View style={styles.categoryHint}>
                  <Text variant="caption" color="secondary">
                    {t('dataImport.hints.categoryToggle')}
                  </Text>
                </View>
                {filteredCategories.map((item) => (
                  <CategoryItem
                    key={item}
                    name={item}
                    categoryType={categoryMappings[item] || 'gider'}
                    onToggleType={() => onToggleCategoryType(item)}
                    t={t}
                  />
                ))}
                {filteredCategories.length === 0 && (
                  <View style={styles.emptyState}>
                    <Tag size={48} color={colors.textMuted} />
                    <Text variant="body" color="secondary" style={styles.emptyText}>
                      {t('dataImport.empty.categories')}
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
                    item.reason?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    item.transaction.account?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    item.transaction.description?.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((item, index) => (
                    <SkippedTransactionItemSimple key={index} item={item} />
                  ))}
                {result.skippedTransactions.filter(item =>
                  !searchQuery ||
                  item.reason?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  item.transaction.account?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  item.transaction.description?.toLowerCase().includes(searchQuery.toLowerCase())
                ).length === 0 && (
                  <View style={styles.emptyState}>
                    <AlertTriangle size={48} color={colors.textMuted} />
                    <Text variant="body" color="secondary" style={styles.emptyText}>
                      {t('dataImport.empty.skipped')}
                    </Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>

          {/* Sheet altında yüzen arama çubuğu */}
          <FloatingSearchBar
            value={searchQuery}
            onChangeText={onSearchChange}
            placeholder={getSearchPlaceholder()}
            bottomOffset={16 + bottomInset + 12}
          />
        </View>
      </View>
    </Modal>
  );
}
