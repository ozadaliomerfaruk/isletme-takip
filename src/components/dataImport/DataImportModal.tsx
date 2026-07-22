import { useState, type ComponentType } from 'react';
import { View, ScrollView, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import {
  Receipt,
  Building2,
  Users,
  Tag,
  AlertTriangle,
  X,
  Coins,
} from 'lucide-react-native';
import { Text, FloatingSearchBar, FLOATING_SEARCH_CLEARANCE } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
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
  onSetAccountCurrency: (name: string, currency: string) => void;
  onToggleCategoryType: (name: string) => void;
  // Toplu aksiyon + para birimi seçici
  currencies: { code: string; symbol: string; name: string }[];
  onBulkEntityType: (names: string[], entityType: 'cari' | 'personel', cariType?: 'musteri' | 'tedarikci') => void;
  onBulkHesapSubType: (names: string[], hesapType: 'nakit' | 'banka' | 'kredi_karti' | 'birikim') => void;
  onBulkAccountCurrency: (names: string[], currency: string) => void;
  onBulkCategoryType: (names: string[], type: 'gelir' | 'gider') => void;
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
  onSetAccountCurrency,
  onToggleCategoryType,
  currencies,
  onBulkEntityType,
  onBulkHesapSubType,
  onBulkAccountCurrency,
  onBulkCategoryType,
  t,
}: DataImportModalProps) {
  // Para birimi seçici hedefi: hesap adı, ya da tüm hesaplar için '__ALL__'
  const [currencyPickerFor, setCurrencyPickerFor] = useState<string | null>(null);

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
                {filteredAccounts.length > 1 && (
                  <View style={bulkStyles.bar}>
                    <Text variant="caption" color="muted" style={bulkStyles.prefix}>{t('dataImport.bulk.prefix')}</Text>
                    <BulkChip label={t('dataImport.accountTypes.banka')} onPress={() => onBulkHesapSubType(filteredAccounts.map(a => a.name), 'banka')} />
                    <BulkChip label={t('dataImport.accountTypes.nakit')} onPress={() => onBulkHesapSubType(filteredAccounts.map(a => a.name), 'nakit')} />
                    <BulkChip label={t('dataImport.bulk.currency')} icon={Coins} onPress={() => setCurrencyPickerFor('__ALL__')} />
                  </View>
                )}
                {filteredAccounts.map((item) => (
                  <AccountItem
                    key={item.name}
                    name={item.name}
                    mapping={item}
                    onToggleType={() => onToggleFromHesap(item.name)}
                    onSubTypeChange={(subType) => onSetHesapSubType(item.name, subType)}
                    onCurrencyChange={() => setCurrencyPickerFor(item.name)}
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
                {filteredClientsAndPersonel.length > 1 && (
                  <View style={bulkStyles.bar}>
                    <Text variant="caption" color="muted" style={bulkStyles.prefix}>{t('dataImport.bulk.prefix')}</Text>
                    <BulkChip label={t('dataImport.clientTypes.tedarikci')} onPress={() => onBulkEntityType(filteredClientsAndPersonel.map(c => c.name), 'cari', 'tedarikci')} />
                    <BulkChip label={t('dataImport.clientTypes.musteri')} onPress={() => onBulkEntityType(filteredClientsAndPersonel.map(c => c.name), 'cari', 'musteri')} />
                    <BulkChip label={t('dataImport.entityTypes.personel')} onPress={() => onBulkEntityType(filteredClientsAndPersonel.map(c => c.name), 'personel')} />
                  </View>
                )}
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
                {filteredCategories.length > 1 && (
                  <View style={bulkStyles.bar}>
                    <Text variant="caption" color="muted" style={bulkStyles.prefix}>{t('dataImport.bulk.prefix')}</Text>
                    <BulkChip label={t('dataImport.badges.income')} onPress={() => onBulkCategoryType(filteredCategories, 'gelir')} />
                    <BulkChip label={t('dataImport.badges.expense')} onPress={() => onBulkCategoryType(filteredCategories, 'gider')} />
                  </View>
                )}
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

          {/* Para birimi seçici — döngü badge yerine açılır liste */}
          {currencyPickerFor !== null && (
            <Modal visible transparent animationType="slide" onRequestClose={() => setCurrencyPickerFor(null)}>
              <TouchableOpacity style={bulkStyles.pickerOverlay} activeOpacity={1} onPress={() => setCurrencyPickerFor(null)}>
                <TouchableOpacity style={bulkStyles.pickerSheet} activeOpacity={1} onPress={() => {}}>
                  <View style={bulkStyles.pickerHeader}>
                    <Text variant="h3">{t('dataImport.bulk.currencyTitle')}</Text>
                    <TouchableOpacity onPress={() => setCurrencyPickerFor(null)}>
                      <X size={24} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                  <ScrollView bounces={false}>
                    {currencies.map((c) => (
                      <TouchableOpacity
                        key={c.code}
                        style={bulkStyles.pickerRow}
                        onPress={() => {
                          if (currencyPickerFor === '__ALL__') {
                            onBulkAccountCurrency(filteredAccounts.map((a) => a.name), c.code);
                          } else {
                            onSetAccountCurrency(currencyPickerFor, c.code);
                          }
                          setCurrencyPickerFor(null);
                        }}
                      >
                        <Text variant="body">{c.symbol} {c.code}</Text>
                        <Text variant="caption" color="secondary">{c.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </TouchableOpacity>
              </TouchableOpacity>
            </Modal>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** Toplu aksiyon çipi (Tümü: Tedarikçi / Banka / Gelir …) */
function BulkChip({ label, onPress, icon: Icon }: { label: string; onPress: () => void; icon?: ComponentType<{ size: number; color: string }> }) {
  return (
    <TouchableOpacity style={bulkStyles.chip} onPress={onPress} activeOpacity={0.7}>
      {Icon ? <Icon size={13} color={colors.primary} /> : null}
      <Text variant="caption" style={bulkStyles.chipText}>{label}</Text>
    </TouchableOpacity>
  );
}

const bulkStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  prefix: { marginRight: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.primaryLight,
  },
  chipText: { color: colors.primary, fontWeight: '600' },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 24,
    maxHeight: '60%',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
