import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SectionList,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Search,
  Users,
  UserCheck,
  Truck,
  Package,
  Archive,
  FileText,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { getHesapIconConfig } from '@/lib/icons';
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCariler } from '@/hooks/useCariler';
import { usePersonelList } from '@/hooks/usePersonel';
import { useUrunler } from '@/hooks/useUrunler';
import { useSearchIslemler } from '@/hooks/useIslemler';

import type { Hesap, Cari, Personel, Urun, IslemWithRelations } from '@/types/database';

type SearchResultItem =
  | { type: 'hesap'; data: Hesap }
  | { type: 'musteri'; data: Cari }
  | { type: 'tedarikci'; data: Cari }
  | { type: 'personel'; data: Personel }
  | { type: 'urun'; data: Urun }
  | { type: 'islem'; data: IslemWithRelations };

interface Section {
  title: string;
  data: SearchResultItem[];
}

export default function AramaPage() {
  const router = useRouter();
  const { t } = useTranslation(['common', 'accounts', 'clients', 'staff', 'products', 'transactions']);
  const searchInputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-focus on mount
  useEffect(() => {
    const timer = setTimeout(() => searchInputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  // Debounce server-side search query (300ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Data hooks — includePassive=true, includeArchived=true to search everything
  const { data: hesaplar = [] } = useHesaplar(true, true);
  const { data: musteriCariler = [] } = useCariler('musteri', true, true);
  const { data: tedarikciCariler = [] } = useCariler('tedarikci', true, true);
  const { data: personelList = [] } = usePersonelList(true, true);
  const { data: urunler = [] } = useUrunler(true);
  const { data: islemResults = [] } = useSearchIslemler(debouncedQuery);

  // Filter and build sections
  const sections = useMemo<Section[]>(() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const result: Section[] = [];

    // Hesaplar
    const filteredHesaplar = hesaplar.filter((h) =>
      h.name.toLowerCase().includes(q)
    );
    if (filteredHesaplar.length > 0) {
      result.push({
        title: t('common:labels.account'),
        data: filteredHesaplar.map((h) => ({ type: 'hesap' as const, data: h })),
      });
    }

    // Müşteriler
    const filteredMusteriler = musteriCariler.filter((c) =>
      c.name.toLowerCase().includes(q)
    );
    if (filteredMusteriler.length > 0) {
      result.push({
        title: t('clients:tabs.customers'),
        data: filteredMusteriler.map((c) => ({ type: 'musteri' as const, data: c })),
      });
    }

    // Tedarikçiler
    const filteredTedarikci = tedarikciCariler.filter((c) =>
      c.name.toLowerCase().includes(q)
    );
    if (filteredTedarikci.length > 0) {
      result.push({
        title: t('clients:tabs.suppliers'),
        data: filteredTedarikci.map((c) => ({ type: 'tedarikci' as const, data: c })),
      });
    }

    // Personel
    const filteredPersonel = personelList.filter((p) => {
      const fullName = `${p.first_name} ${p.last_name ?? ''}`.toLowerCase();
      return fullName.includes(q);
    });
    if (filteredPersonel.length > 0) {
      result.push({
        title: t('common:labels.staff'),
        data: filteredPersonel.map((p) => ({ type: 'personel' as const, data: p })),
      });
    }

    // Ürünler
    const filteredUrunler = urunler.filter((u) =>
      u.ad.toLowerCase().includes(q) ||
      (u.kod && u.kod.toLowerCase().includes(q))
    );
    if (filteredUrunler.length > 0) {
      result.push({
        title: t('products:title'),
        data: filteredUrunler.map((u) => ({ type: 'urun' as const, data: u })),
      });
    }

    // İşlem Notları (server-side search)
    if (islemResults.length > 0) {
      result.push({
        title: t('transactions:titles.transactionNotes'),
        data: islemResults.map((i) => ({ type: 'islem' as const, data: i })),
      });
    }

    return result;
  }, [query, hesaplar, musteriCariler, tedarikciCariler, personelList, urunler, islemResults, t]);

  const totalResults = useMemo(
    () => sections.reduce((sum, s) => sum + s.data.length, 0),
    [sections]
  );

  const handleItemPress = useCallback(
    (item: SearchResultItem) => {
      Keyboard.dismiss();
      switch (item.type) {
        case 'hesap':
          router.push(`/hesaplar/${item.data.id}`);
          break;
        case 'musteri':
        case 'tedarikci':
          router.push(`/cariler/${item.data.id}`);
          break;
        case 'personel':
          router.push(`/personel/${item.data.id}`);
          break;
        case 'urun':
          router.push(`/urunler/${item.data.id}`);
          break;
        case 'islem':
          router.push(`/islemler/duzenle/${item.data.id}`);
          break;
      }
    },
    [router]
  );

  const renderIcon = useCallback((item: SearchResultItem) => {
    switch (item.type) {
      case 'hesap': {
        const config = getHesapIconConfig(item.data.type, 20);
        return (
          <View style={[styles.iconContainer, { backgroundColor: config.backgroundColor }]}>
            {config.icon}
          </View>
        );
      }
      case 'musteri':
        return (
          <View style={[styles.iconContainer, { backgroundColor: colors.primaryLight }]}>
            <Users size={20} color={colors.primary} />
          </View>
        );
      case 'tedarikci':
        return (
          <View style={[styles.iconContainer, { backgroundColor: colors.orangeLight }]}>
            <Truck size={20} color={colors.orange} />
          </View>
        );
      case 'personel':
        return (
          <View style={[styles.iconContainer, { backgroundColor: colors.successLight }]}>
            <UserCheck size={20} color={colors.success} />
          </View>
        );
      case 'urun':
        return (
          <View style={[styles.iconContainer, { backgroundColor: colors.primaryLight }]}>
            <Package size={20} color={colors.primary} />
          </View>
        );
      case 'islem':
        return (
          <View style={[styles.iconContainer, { backgroundColor: colors.warningLight }]}>
            <FileText size={20} color={colors.warning} />
          </View>
        );
    }
  }, []);

  const getName = useCallback((item: SearchResultItem) => {
    switch (item.type) {
      case 'hesap':
        return item.data.name;
      case 'musteri':
      case 'tedarikci':
        return item.data.name;
      case 'personel':
        return `${item.data.first_name} ${item.data.last_name ?? ''}`.trim();
      case 'urun':
        return item.data.ad;
      case 'islem':
        return item.data.description || '';
    }
  }, []);

  const isArchived = useCallback((item: SearchResultItem) => {
    return 'is_archived' in item.data && item.data.is_archived === true;
  }, []);

  const getBalance = useCallback((item: SearchResultItem) => {
    if (item.type === 'urun') {
      return item.data.satis_fiyati > 0
        ? formatCurrency(item.data.satis_fiyati, item.data.currency)
        : '';
    }
    if (item.type === 'islem') {
      return formatCurrency(item.data.amount, item.data.source_currency || 'TRY');
    }
    return formatCurrency(item.data.balance, item.data.currency);
  }, []);

  const getSubtitle = useCallback((item: SearchResultItem) => {
    if (item.type !== 'islem') return null;
    const typeLabel = t(`transactions:types.${item.data.type}`);
    const entityParts: string[] = [typeLabel];
    if (item.data.hesap?.name) entityParts.push(item.data.hesap.name);
    if (item.data.cari?.name) entityParts.push(item.data.cari.name);
    if (item.data.personel) {
      const name = `${item.data.personel.first_name} ${item.data.personel.last_name ?? ''}`.trim();
      if (name) entityParts.push(name);
    }
    return entityParts.join(' · ');
  }, [t]);

  const renderItem = useCallback(
    ({ item }: { item: SearchResultItem }) => {
      const archived = isArchived(item);
      const subtitle = getSubtitle(item);
      return (
        <TouchableOpacity
          style={[styles.resultItem, archived && styles.resultItemArchived]}
          activeOpacity={0.7}
          onPress={() => handleItemPress(item)}
        >
          {renderIcon(item)}
          <View style={styles.resultNameContainer}>
            <Text style={[styles.resultName, archived && styles.resultNameArchived]} numberOfLines={1}>
              {getName(item)}
            </Text>
            {subtitle && (
              <Text style={styles.resultSubtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
            {archived && (
              <View style={styles.archivedBadge}>
                <Archive size={10} color={colors.textMuted} />
                <Text style={styles.archivedBadgeText}>{t('common:archive.title')}</Text>
              </View>
            )}
          </View>
          <Text style={styles.resultBalance}>{getBalance(item)}</Text>
        </TouchableOpacity>
      );
    },
    [handleItemPress, renderIcon, getName, getBalance, getSubtitle, isArchived, t]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: Section }) => (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
      </View>
    ),
    []
  );

  const hasQuery = query.trim().length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Search Bar */}
      <View style={styles.searchBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.searchInputContainer}>
          <Search size={18} color={colors.textMuted} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder={t('common:search.globalSearch')}
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Text style={styles.clearText}>{t('common:buttons.clear')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Results */}
      {hasQuery && totalResults > 0 && (
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => `${item.type}-${item.data.id}-${index}`}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
        />
      )}

      {/* Empty states */}
      {!hasQuery && (
        <View style={styles.emptyState}>
          <Search size={48} color={colors.textMuted} />
          <Text style={styles.emptyText}>{t('common:search.globalSearch')}</Text>
        </View>
      )}
      {hasQuery && totalResults === 0 && (
        <View style={styles.emptyState}>
          <Search size={48} color={colors.textMuted} />
          <Text style={styles.emptyText}>{t('common:search.noResults')}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    padding: spacing.xs,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    height: 40,
    gap: spacing.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 0,
  },
  clearText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    backgroundColor: colors.background,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultNameContainer: {
    flex: 1,
    gap: 2,
  },
  resultName: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
  resultSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
  },
  resultNameArchived: {
    opacity: 0.6,
  },
  resultItemArchived: {
    opacity: 0.75,
  },
  archivedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  archivedBadgeText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  resultBalance: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: 100,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
