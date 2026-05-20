import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SectionList,
  Keyboard,
  Platform,
  Modal,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Href } from 'expo-router';
import DateTimePickerRN, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import {
  Search,
  Users,
  UserCheck,
  Truck,
  Package,
  Archive,
  FileText,
  X,
  Wallet,
  CreditCard,
  Landmark,
  ChevronRight,
  SlidersHorizontal,
  Calendar,
  StickyNote,
  CheckCircle2,
} from 'lucide-react-native';
import { ArrowLeft, Clock } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BackButton } from '@/components/ui/BackButton';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useHaptics } from '@/hooks/useHaptics';
import { formatCurrency } from '@/lib/currency';
import { normalizeTurkish } from '@/lib/turkishTextUtils';

const RECENT_SEARCHES_KEY = 'recent_searches';
const MAX_RECENT_SEARCHES = 5;
import { useHesaplar } from '@/hooks/useHesaplar';
import { useCariler } from '@/hooks/useCariler';
import { usePersonelList } from '@/hooks/usePersonel';
import { useUrunler } from '@/hooks/useUrunler';
import { useFilteredIslemler } from '@/hooks/useIslemler';
import { useNotlar } from '@/hooks/useNotlar';

import type { Hesap, Cari, Personel, Urun, IslemWithRelations, Not } from '@/types/database';

type SearchResultItem =
  | { type: 'hesap'; data: Hesap }
  | { type: 'musteri'; data: Cari }
  | { type: 'tedarikci'; data: Cari }
  | { type: 'personel'; data: Personel }
  | { type: 'urun'; data: Urun }
  | { type: 'islem'; data: IslemWithRelations }
  | { type: 'not'; data: Not };

const MAX_ITEMS_PER_SECTION = 3;

interface FullSection {
  title: string;
  sectionType: SearchResultItem['type'];
  allData: SearchResultItem[];
  data: SearchResultItem[];
  totalCount: number;
}

function HighlightedText({ text, highlight }: { text: string; highlight: string }) {
  if (!highlight.trim()) return <Text style={styles.resultName} numberOfLines={1}>{text}</Text>;

  const normalizedText = normalizeTurkish(text);
  const normalizedQuery = normalizeTurkish(highlight.trim());
  const matchIndex = normalizedText.indexOf(normalizedQuery);

  if (matchIndex === -1) return <Text style={styles.resultName} numberOfLines={1}>{text}</Text>;

  const before = text.slice(0, matchIndex);
  const match = text.slice(matchIndex, matchIndex + normalizedQuery.length);
  const after = text.slice(matchIndex + normalizedQuery.length);

  return (
    <Text style={styles.resultName} numberOfLines={1}>
      {before}
      <Text style={styles.resultNameHighlight}>{match}</Text>
      {after}
    </Text>
  );
}

function getHesapIcon(type: string) {
  switch (type) {
    case 'nakit':
      return <Wallet size={18} color={colors.success} />;
    case 'banka':
      return <Landmark size={18} color={colors.info} />;
    case 'kredi_karti':
      return <CreditCard size={18} color={colors.orange} />;
    default:
      return <Wallet size={18} color={colors.primary} />;
  }
}

export default function AramaPage() {
  const router = useRouter();
  const { t } = useTranslation(['common', 'accounts', 'clients', 'staff', 'products', 'transactions']);
  const { formatDateNative, locale } = useDateFormat();
  const haptics = useHaptics();
  const searchInputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState<'from' | 'to' | null>(null);
  const [tempDate, setTempDate] = useState(new Date());
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(new Set(['hesap', 'cari', 'personel', 'urun', 'not', 'islem']));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => searchInputRef.current?.focus(), 100);
    AsyncStorage.getItem(RECENT_SEARCHES_KEY).then((val) => {
      if (val) setRecentSearches(JSON.parse(val));
    });
    return () => clearTimeout(timer);
  }, []);

  const saveRecentSearch = useCallback((term: string) => {
    const trimmed = term.trim();
    if (trimmed.length < 2) return;
    setRecentSearches(prev => {
      const next = [trimmed, ...prev.filter(s => s !== trimmed)].slice(0, MAX_RECENT_SEARCHES);
      AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Reset expanded sections when query changes
  useEffect(() => {
    setExpandedSections(new Set());
  }, [query]);

  const { data: hesaplar = [] } = useHesaplar(true, true);
  const { data: musteriCariler = [] } = useCariler('musteri', true, true);
  const { data: tedarikciCariler = [] } = useCariler('tedarikci', true, true);
  const { data: personelList = [] } = usePersonelList(true, true);
  const { data: notlar = [] } = useNotlar();
  const { data: urunler = [] } = useUrunler(true);

  const parsedMin = useMemo(() => {
    const v = parseFloat(minAmount.replace(/,/g, '.'));
    return isNaN(v) ? null : v;
  }, [minAmount]);

  const parsedMax = useMemo(() => {
    const v = parseFloat(maxAmount.replace(/,/g, '.'));
    return isNaN(v) ? null : v;
  }, [maxAmount]);

  const hasAmountFilter = parsedMin !== null || parsedMax !== null;
  const hasDateFilter = dateFrom !== null || dateTo !== null;

  const { data: islemResults = [], isFetching: islemFetching } = useFilteredIslemler({
    searchQuery: debouncedQuery,
    minAmount: parsedMin,
    maxAmount: parsedMax,
    dateFrom: dateFrom ? dateFrom.toISOString().split('T')[0] : null,
    dateTo: dateTo ? dateTo.toISOString().split('T')[0] : null,
  });

  const amountInRange = useCallback((amount: number): boolean => {
    const abs = Math.abs(amount);
    if (parsedMin !== null && abs < parsedMin) return false;
    if (parsedMax !== null && abs > parsedMax) return false;
    return true;
  }, [parsedMin, parsedMax]);

  const dateInRange = useCallback((dateStr: string | undefined | null): boolean => {
    if (!hasDateFilter || !dateStr) return true;
    const d = new Date(dateStr);
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      if (d < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      if (d > to) return false;
    }
    return true;
  }, [dateFrom, dateTo, hasDateFilter]);

  const handleDateChange = useCallback((event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(null);
      if (event.type === 'set' && selected) {
        if (showDatePicker === 'from') setDateFrom(selected);
        else if (showDatePicker === 'to') setDateTo(selected);
      }
    } else if (selected) {
      setTempDate(selected);
    }
  }, [showDatePicker]);

  const handleIOSDateConfirm = useCallback(() => {
    if (showDatePicker === 'from') setDateFrom(tempDate);
    else if (showDatePicker === 'to') setDateTo(tempDate);
    setShowDatePicker(null);
  }, [showDatePicker, tempDate]);

  const handleIOSDateCancel = useCallback(() => {
    setShowDatePicker(null);
  }, []);

  const isSearching = query !== debouncedQuery || islemFetching;

  const allEntityTypes = useMemo(() => [
    { key: 'hesap', label: t('common:labels.account') },
    { key: 'cari', label: t('clients:titles.clients') },
    { key: 'personel', label: t('common:labels.staff') },
    { key: 'urun', label: t('products:title') },
    { key: 'not', label: t('common:notes.title') },
    { key: 'islem', label: t('common:labels.transactions') },
  ] as const, [t]);

  const toggleEntityType = useCallback((key: string) => {
    setEnabledTypes(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const allTypesEnabled = enabledTypes.size === allEntityTypes.length;

  const sections = useMemo<FullSection[]>(() => {
    const q = normalizeTurkish(query.trim());
    if (!q && !hasAmountFilter && !hasDateFilter) return [];

    const result: FullSection[] = [];
    const nameMatches = (name: string) => !q || normalizeTurkish(name).includes(q);

    const pushSection = (sectionType: SearchResultItem['type'], title: string, items: SearchResultItem[], filterKey?: string) => {
      if (items.length === 0 || !enabledTypes.has(filterKey ?? sectionType)) return;
      const isExpanded = expandedSections.has(sectionType);
      result.push({
        title, sectionType, allData: items,
        data: isExpanded ? items : items.slice(0, MAX_ITEMS_PER_SECTION),
        totalCount: items.length,
      });
    };

    pushSection('hesap', t('common:labels.account'),
      hesaplar.filter((h) => nameMatches(h.name) && (!hasAmountFilter || amountInRange(Number(h.balance))) && dateInRange(h.created_at))
        .map((h) => ({ type: 'hesap' as const, data: h }))
    );

    pushSection('musteri', t('clients:tabs.customers'),
      musteriCariler.filter((c) => nameMatches(c.name) && (!hasAmountFilter || amountInRange(Number(c.balance))) && dateInRange(c.created_at))
        .map((c) => ({ type: 'musteri' as const, data: c })),
      'cari'
    );

    pushSection('tedarikci', t('clients:tabs.suppliers'),
      tedarikciCariler.filter((c) => nameMatches(c.name) && (!hasAmountFilter || amountInRange(Number(c.balance))) && dateInRange(c.created_at))
        .map((c) => ({ type: 'tedarikci' as const, data: c })),
      'cari'
    );

    pushSection('personel', t('common:labels.staff'),
      personelList.filter((p) => {
        const fullName = `${p.first_name} ${p.last_name ?? ''}`;
        return nameMatches(fullName) && (!hasAmountFilter || amountInRange(Number(p.balance))) && dateInRange(p.created_at);
      }).map((p) => ({ type: 'personel' as const, data: p }))
    );

    pushSection('urun', t('products:title'),
      urunler.filter((u) =>
        (nameMatches(u.ad) || (u.kod && (!q || normalizeTurkish(u.kod).includes(q)))) &&
        (!hasAmountFilter || amountInRange(u.satis_fiyati)) && dateInRange(u.created_at)
      ).map((u) => ({ type: 'urun' as const, data: u }))
    );

    if (q || hasDateFilter) {
      pushSection('not', t('common:notes.title'),
        notlar.filter((n) => nameMatches(n.content) && dateInRange(n.created_at))
          .map((n) => ({ type: 'not' as const, data: n }))
      );
    }

    if (enabledTypes.has('islem') && islemResults.length > 0) {
      const allData = islemResults.map((i) => ({ type: 'islem' as const, data: i }));
      const isExpanded = expandedSections.has('islem');
      result.push({
        title: t('common:labels.transactions'),
        sectionType: 'islem',
        allData,
        data: isExpanded ? allData : allData.slice(0, MAX_ITEMS_PER_SECTION),
        totalCount: allData.length,
      });
    }

    return result;
  }, [query, hesaplar, musteriCariler, tedarikciCariler, personelList, urunler, notlar, islemResults, t, expandedSections, enabledTypes, hasAmountFilter, amountInRange, hasDateFilter, dateInRange]);

  const totalResults = useMemo(
    () => sections.reduce((sum, s) => sum + s.totalCount, 0),
    [sections]
  );

  const handleItemPress = useCallback(
    (item: SearchResultItem) => {
      haptics.selection();
      Keyboard.dismiss();
      if (query.trim().length >= 2) saveRecentSearch(query);
      switch (item.type) {
        case 'hesap':
          router.push(`/hesaplar/${item.data.id}` as Href);
          break;
        case 'musteri':
        case 'tedarikci':
          router.push(`/cariler/${item.data.id}` as Href);
          break;
        case 'personel':
          router.push(`/personel/${item.data.id}` as Href);
          break;
        case 'urun':
          router.push(`/urunler/${item.data.id}` as Href);
          break;
        case 'islem': {
          const islem = item.data;
          if (islem.hesap_id) {
            router.push({ pathname: `/hesaplar/[id]`, params: { id: islem.hesap_id, expandIslemId: islem.id } } as Href);
          } else if (islem.cari_id) {
            router.push({ pathname: `/cariler/[id]`, params: { id: islem.cari_id, expandIslemId: islem.id } } as Href);
          } else if (islem.personel_id) {
            router.push({ pathname: `/personel/[id]`, params: { id: islem.personel_id, expandIslemId: islem.id } } as Href);
          }
          break;
        }
        case 'not':
          router.push('/notlar' as Href);
          break;
      }
    },
    [router, haptics, query, saveRecentSearch]
  );

  const toggleSection = useCallback((sectionType: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionType)) {
        next.delete(sectionType);
      } else {
        next.add(sectionType);
      }
      return next;
    });
  }, []);

  const renderIcon = useCallback((item: SearchResultItem) => {
    switch (item.type) {
      case 'hesap':
        return (
          <View style={[styles.iconContainer, { backgroundColor: item.data.type === 'nakit' ? colors.successLight : item.data.type === 'kredi_karti' ? colors.orangeLight : colors.infoLight }]}>
            {getHesapIcon(item.data.type)}
          </View>
        );
      case 'musteri':
        return (
          <View style={[styles.iconContainer, { backgroundColor: colors.primaryLight }]}>
            <Users size={18} color={colors.primary} />
          </View>
        );
      case 'tedarikci':
        return (
          <View style={[styles.iconContainer, { backgroundColor: colors.orangeLight }]}>
            <Truck size={18} color={colors.orange} />
          </View>
        );
      case 'personel':
        return (
          <View style={[styles.iconContainer, { backgroundColor: colors.successLight }]}>
            <UserCheck size={18} color={colors.success} />
          </View>
        );
      case 'urun':
        return (
          <View style={[styles.iconContainer, { backgroundColor: colors.infoLight }]}>
            <Package size={18} color={colors.info} />
          </View>
        );
      case 'islem':
        return (
          <View style={[styles.iconContainer, { backgroundColor: colors.warningLight }]}>
            <FileText size={18} color={colors.warning} />
          </View>
        );
      case 'not':
        return (
          <View style={[styles.iconContainer, { backgroundColor: item.data.is_completed ? colors.successLight : colors.primaryLight }]}>
            {item.data.is_completed
              ? <CheckCircle2 size={18} color={colors.success} />
              : <StickyNote size={18} color={colors.primary} />}
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
      case 'not':
        return item.data.content;
    }
  }, []);

  const isArchived = useCallback((item: SearchResultItem) => {
    return 'is_archived' in item.data && item.data.is_archived === true;
  }, []);

  const getBalance = useCallback((item: SearchResultItem): { text: string; color: string } => {
    if (item.type === 'not') {
      return { text: '', color: colors.textSecondary };
    }
    if (item.type === 'urun') {
      const text = item.data.satis_fiyati > 0
        ? formatCurrency(item.data.satis_fiyati, item.data.currency)
        : '';
      return { text, color: colors.textSecondary };
    }
    if (item.type === 'islem') {
      const isIncome = item.data.type === 'gelir';
      return {
        text: formatCurrency(item.data.amount, item.data.source_currency || 'TRY'),
        color: isIncome ? colors.success : colors.error,
      };
    }
    const balance = Number(item.data.balance);
    return {
      text: formatCurrency(Math.abs(balance), item.data.currency),
      color: balance >= 0 ? colors.success : colors.error,
    };
  }, []);

  const getSubtitle = useCallback((item: SearchResultItem): string | null => {
    switch (item.type) {
      case 'hesap':
        return t(`accounts:typeLabels.${item.data.type}`);
      case 'musteri':
      case 'tedarikci':
        return item.data.phone || item.data.email || null;
      case 'personel':
        return item.data.position || null;
      case 'urun':
        return item.data.kod || null;
      case 'not': {
        const entityMap: Record<string, string> = {
          hesap: 'entityHesap', cari: 'entityCari', personel: 'entityPersonel',
          personel_izin: 'entityPersonelIzin', urun: 'entityUrun', genel: 'entityGenel',
        };
        const entityLabel = t(`common:notes.${entityMap[item.data.entity_type] ?? 'entityGenel'}`);
        const parts: string[] = [entityLabel];
        if (item.data.is_completed) parts.push(t('common:notes.completed'));
        if (item.data.reminder_date) parts.push(t('common:notes.reminder'));
        return parts.join(' · ');
      }
      case 'islem': {
        const typeLabel = t(`transactions:types.${item.data.type}`);
        const parts: string[] = [typeLabel];
        if (item.data.date) parts.push(formatDateNative(new Date(item.data.date)));
        if (item.data.hesap?.name) parts.push(item.data.hesap.name);
        if (item.data.cari?.name) parts.push(item.data.cari.name);
        if (item.data.personel) {
          const name = `${item.data.personel.first_name} ${item.data.personel.last_name ?? ''}`.trim();
          if (name) parts.push(name);
        }
        return parts.join(' · ');
      }
    }
  }, [t, formatDateNative]);

  const renderItem = useCallback(
    ({ item, index, section }: { item: SearchResultItem; index: number; section: FullSection }) => {
      const archived = isArchived(item);
      const subtitle = getSubtitle(item);
      const balance = getBalance(item);
      const isLast = index === section.data.length - 1;
      return (
        <TouchableOpacity
          style={[styles.resultItem, archived && styles.resultItemArchived]}
          activeOpacity={0.6}
          onPress={() => handleItemPress(item)}
        >
          {renderIcon(item)}
          <View style={styles.resultContent}>
            <View style={styles.resultRow}>
              <View style={styles.resultNameContainer}>
                <HighlightedText text={getName(item)} highlight={query} />
                {subtitle && (
                  <Text style={styles.resultSubtitle} numberOfLines={1}>
                    {subtitle}
                  </Text>
                )}
              </View>
              {balance.text ? (
                <Text style={[styles.resultBalance, { color: balance.color }]}>
                  {balance.text}
                </Text>
              ) : null}
            </View>
            {archived && (
              <View style={styles.archivedBadge}>
                <Archive size={10} color={colors.textMuted} />
                <Text style={styles.archivedBadgeText}>{t('common:archive.title')}</Text>
              </View>
            )}
            {!isLast && <View style={styles.divider} />}
          </View>
        </TouchableOpacity>
      );
    },
    [handleItemPress, renderIcon, getName, getBalance, getSubtitle, isArchived, t, query]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: FullSection }) => (
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{section.totalCount}</Text>
          </View>
        </View>
      </View>
    ),
    []
  );

  const renderSectionFooter = useCallback(
    ({ section }: { section: FullSection }) => {
      if (section.totalCount <= MAX_ITEMS_PER_SECTION) return null;
      const isExpanded = expandedSections.has(section.sectionType);
      return (
        <TouchableOpacity
          style={styles.showAllButton}
          activeOpacity={0.6}
          onPress={() => toggleSection(section.sectionType)}
        >
          <Text style={styles.showAllText}>
            {isExpanded
              ? t('common:buttons.showLess')
              : t('common:search.showAll', { count: section.totalCount })}
          </Text>
          <ChevronRight
            size={14}
            color={colors.primary}
            style={isExpanded ? { transform: [{ rotate: '90deg' }] } : undefined}
          />
        </TouchableOpacity>
      );
    },
    [expandedSections, toggleSection, t]
  );

  const hasQuery = query.trim().length > 0;
  const hasEntityFilter = !allTypesEnabled;
  const hasAnyFilter = hasQuery || hasAmountFilter || hasDateFilter;

  const handleClearFilters = useCallback(() => {
    setMinAmount('');
    setMaxAmount('');
    setDateFrom(null);
    setDateTo(null);
    setEnabledTypes(new Set(['hesap', 'cari', 'personel', 'urun', 'not', 'islem']));
  }, []);

  const hasActiveAdvancedFilters = hasAmountFilter || hasDateFilter || hasEntityFilter;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Search Bar */}
      <View style={styles.searchBar}>
        <BackButton icon={ArrowLeft} style={styles.backBtn} />
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
          {isSearching && (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 4 }} />
          )}
          {query.length > 0 && !isSearching && (
            <TouchableOpacity
              onPress={() => setQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.clearButton}
            >
              <X size={14} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          onPress={() => setShowFilters(!showFilters)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.filterToggle}
        >
          <SlidersHorizontal size={20} color={showFilters || hasActiveAdvancedFilters ? colors.primary : colors.textMuted} />
          {hasActiveAdvancedFilters && <View style={styles.filterActiveDot} />}
        </TouchableOpacity>
      </View>

      {/* Entity Type Chips */}
      <View style={styles.chipBarWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipBar}
        >
          {allEntityTypes.map(({ key, label }) => {
            const active = enabledTypes.has(key);
            return (
              <TouchableOpacity
                key={key}
                style={[styles.chip, active && styles.chipActive]}
                activeOpacity={0.7}
                onPress={() => toggleEntityType(key)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Filter Bar */}
      {showFilters && (
        <View style={styles.filterBar}>
          {/* Amount Filter */}
          <Text style={styles.filterSectionLabel}>{t('common:search.amountRange')}</Text>
          <View style={styles.filterInputRow}>
            <View style={styles.filterFieldWithClear}>
              <TextInput
                style={styles.filterInput}
                placeholder={t('common:search.minAmount')}
                placeholderTextColor={colors.textMuted}
                value={minAmount}
                onChangeText={setMinAmount}
                keyboardType="numeric"
              />
              {minAmount.length > 0 && (
                <TouchableOpacity onPress={() => setMinAmount('')} style={styles.inputClearBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <X size={14} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.filterDash}>—</Text>
            <View style={styles.filterFieldWithClear}>
              <TextInput
                style={styles.filterInput}
                placeholder={t('common:search.maxAmount')}
                placeholderTextColor={colors.textMuted}
                value={maxAmount}
                onChangeText={setMaxAmount}
                keyboardType="numeric"
              />
              {maxAmount.length > 0 && (
                <TouchableOpacity onPress={() => setMaxAmount('')} style={styles.inputClearBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <X size={14} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Date Range Filter */}
          <Text style={[styles.filterSectionLabel, { marginTop: spacing.sm }]}>{t('common:search.dateRange')}</Text>
          <View style={styles.filterInputRow}>
            <TouchableOpacity
              style={[styles.datePickerBtn, dateFrom && styles.datePickerBtnActive]}
              onPress={() => {
                setTempDate(dateFrom || new Date());
                setShowDatePicker('from');
              }}
            >
              <Calendar size={16} color={dateFrom ? colors.primary : colors.textMuted} />
              <Text style={[styles.datePickerText, dateFrom && styles.datePickerTextActive]}>
                {dateFrom ? formatDateNative(dateFrom) : t('common:search.startDate')}
              </Text>
              {dateFrom && (
                <TouchableOpacity
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={(e) => { e.stopPropagation(); setDateFrom(null); }}
                >
                  <X size={14} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
            <Text style={styles.filterDash}>—</Text>
            <TouchableOpacity
              style={[styles.datePickerBtn, dateTo && styles.datePickerBtnActive]}
              onPress={() => {
                setTempDate(dateTo || new Date());
                setShowDatePicker('to');
              }}
            >
              <Calendar size={16} color={dateTo ? colors.primary : colors.textMuted} />
              <Text style={[styles.datePickerText, dateTo && styles.datePickerTextActive]}>
                {dateTo ? formatDateNative(dateTo) : t('common:search.endDate')}
              </Text>
              {dateTo && (
                <TouchableOpacity
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={(e) => { e.stopPropagation(); setDateTo(null); }}
                >
                  <X size={14} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          </View>

          {/* Clear all filters */}
          {hasActiveAdvancedFilters && (
            <TouchableOpacity onPress={handleClearFilters} style={styles.clearAllFiltersBtn}>
              <X size={14} color={colors.error} />
              <Text style={styles.clearAllFiltersText}>{t('common:search.clearFilters')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Date Picker (Android) */}
      {Platform.OS === 'android' && showDatePicker && (
        <DateTimePickerRN
          value={tempDate}
          mode="date"
          display="default"
          onChange={handleDateChange}
        />
      )}

      {/* Date Picker (iOS Modal) */}
      {Platform.OS === 'ios' && showDatePicker && (
        <Modal transparent animationType="slide" onRequestClose={handleIOSDateCancel}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={handleIOSDateCancel}>
            <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={handleIOSDateCancel}>
                  <Text style={{ color: colors.textSecondary, fontSize: 16 }}>{t('common:buttons.cancel')}</Text>
                </TouchableOpacity>
                <Text style={{ fontWeight: '600', fontSize: 16 }}>
                  {showDatePicker === 'from' ? t('common:search.startDate') : t('common:search.endDate')}
                </Text>
                <TouchableOpacity onPress={handleIOSDateConfirm}>
                  <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 16 }}>{t('common:buttons.done')}</Text>
                </TouchableOpacity>
              </View>
              <DateTimePickerRN
                value={tempDate}
                mode="date"
                display="spinner"
                onChange={handleDateChange}
                locale={locale}
                textColor={colors.text}
                themeVariant="light"
              />
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Result count */}
      {hasAnyFilter && totalResults > 0 && (
        <View style={styles.resultCountBar}>
          <Text style={styles.resultCountText}>
            {t('common:search.resultCount', { count: totalResults })}
          </Text>
        </View>
      )}

      {/* Results */}
      {hasAnyFilter && totalResults > 0 && (
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => `${item.type}-${item.data.id}-${index}`}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          renderSectionFooter={renderSectionFooter}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          stickySectionHeadersEnabled={false}
        />
      )}

      {/* Empty state - no filter */}
      {!hasAnyFilter && (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconContainer}>
            <Search size={32} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>{t('common:search.globalSearch')}</Text>
          <Text style={styles.emptyHint}>{t('common:search.searchHint')}</Text>
          {recentSearches.length > 0 && (
            <View style={styles.recentSection}>
              <View style={styles.recentHeader}>
                <Text style={styles.recentTitle}>{t('common:search.recentSearches')}</Text>
                <TouchableOpacity onPress={clearRecentSearches} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.recentClearText}>{t('common:search.clearRecentSearches')}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.recentChips}>
                {recentSearches.map((term) => (
                  <TouchableOpacity
                    key={term}
                    style={styles.recentChip}
                    activeOpacity={0.7}
                    onPress={() => { haptics.selection(); setQuery(term); }}
                  >
                    <Clock size={12} color={colors.textMuted} />
                    <Text style={styles.recentChipText}>{term}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>
      )}

      {/* Empty state - no results */}
      {hasAnyFilter && totalResults === 0 && !isSearching && (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconContainer, { backgroundColor: colors.errorLight }]}>
            <Search size={32} color={colors.error} />
          </View>
          <Text style={styles.emptyTitle}>{t('common:search.noResults')}</Text>
          <Text style={styles.emptyHint}>
            {hasActiveAdvancedFilters
              ? t('common:search.noResultsWithFilters')
              : t('common:search.tryDifferent')}
          </Text>
          {hasActiveAdvancedFilters && (
            <TouchableOpacity style={styles.clearFiltersInlineBtn} onPress={handleClearFilters}>
              <X size={14} color={colors.primary} />
              <Text style={styles.clearFiltersInlineText}>{t('common:search.clearFilters')}</Text>
            </TouchableOpacity>
          )}
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
    borderRadius: borderRadius.lg,
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
  clearButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterToggle: {
    padding: spacing.xs,
    position: 'relative',
  },
  filterActiveDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  chipBarWrapper: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  chipBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    gap: 6,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
  },
  chipTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  filterBar: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  filterSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  filterInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  filterField: {
    flex: 1,
  },
  filterFieldWithClear: {
    flex: 1,
    position: 'relative',
  },
  filterInput: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingRight: spacing.xl + spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    height: 42,
  },
  inputClearBtn: {
    position: 'absolute',
    right: spacing.sm,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    width: 24,
  },
  filterDash: {
    color: colors.textMuted,
    fontSize: 18,
    fontWeight: '300',
  },
  datePickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    height: 42,
    borderWidth: 1,
    borderColor: colors.border,
  },
  datePickerBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  datePickerText: {
    flex: 1,
    fontSize: 13,
    color: colors.textMuted,
  },
  datePickerTextActive: {
    color: colors.primary,
    fontWeight: '500',
  },
  clearAllFiltersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
  clearAllFiltersText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.error,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingBottom: spacing['2xl'],
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  resultCountBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  resultCountText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
  },
  listContent: {
    paddingBottom: 320,
  },
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
    backgroundColor: colors.background,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  countBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.full,
    paddingHorizontal: 7,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: 'center',
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  resultItemArchived: {
    opacity: 0.65,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  resultContent: {
    flex: 1,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingRight: spacing.lg,
    paddingBottom: spacing.sm,
  },
  resultNameContainer: {
    flex: 1,
    gap: 2,
    marginRight: spacing.sm,
  },
  resultName: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
  resultNameHighlight: {
    fontWeight: '700',
    color: colors.primary,
  },
  resultSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
  },
  archivedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingBottom: spacing.xs,
  },
  archivedBadgeText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  resultBalance: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 0,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginRight: spacing.lg,
  },
  showAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    gap: 4,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  showAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: 100,
    paddingHorizontal: spacing.xl,
  },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  recentSection: {
    marginTop: spacing.lg,
    width: '100%',
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  recentTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  recentClearText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  recentChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  recentChipText: {
    fontSize: 13,
    color: colors.text,
  },
  clearFiltersInlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryLight,
  },
  clearFiltersInlineText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
});
