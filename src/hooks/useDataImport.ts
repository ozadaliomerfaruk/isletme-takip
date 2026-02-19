/**
 * Data Import Hook
 * Excel'den parse edilen verileri Supabase'e batch olarak insert eder
 */

import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import {
  ImportPreview,
  AccountMapping,
  ParsedTransaction,
  chunkArray,
} from '@/lib/excelImport';
import {
  KategoriInsert,
  HesapInsert,
  CariInsert,
  PersonelInsert,
  IslemInsert,
  HesapType,
  CariType,
  IslemType,
} from '@/types/database';
import { calculateTargetAmount, safeParseExchangeRate } from '@/lib/currency';

// ============================================================================
// TYPES
// ============================================================================

export interface ImportProgress {
  phase: 'idle' | 'categories' | 'accounts' | 'clients' | 'personel' | 'transactions' | 'balances' | 'done' | 'error';
  current: number;
  total: number;
  message: string;
  estimatedTimeRemaining?: number; // saniye
  startTime?: number;
  // UX iyileştirmeleri
  percentage: number;
  itemsPerSecond: number;
  phaseDetails: {
    categories: number;
    accounts: number;
    clients: number;
    personel: number;
    transactions: number;
  };
}

/**
 * Atlanan işlem bilgisi - neden atlandığını ve orijinal veriyi içerir
 */
export interface SkippedTransaction {
  transaction: ParsedTransaction;
  reason: string;
  rowNumber: number; // Excel'deki satır numarası (2'den başlar, header 1)
}

export interface ImportResult {
  success: boolean;
  categoriesCreated: number;
  accountsCreated: number;
  clientsCreated: number;
  personelCreated: number;
  transactionsCreated: number;
  transactionIds: string[]; // Oluşturulan işlem ID'leri (geri alma için)
  // YENİ: Oluşturulan entity ID'leri (geri alma için)
  createdCategoryIds: string[];
  reactivatedCategoryIds: string[]; // Reactivate edilen kategoriler (geri alma için deactivate edilecek)
  createdAccountIds: string[];
  createdClientIds: string[];
  createdPersonelIds: string[];
  errors: string[];
  skipped: number;
  skippedTransactions: SkippedTransaction[]; // Atlanan işlemlerin detayları
  // Başlangıç bakiyesi sayacı (toplam satır doğrulaması için)
  startingBalancesApplied: number;
  startingBalancesUpdated: number; // Mevcut entity'lere sonradan uygulanan başlangıç bakiyeleri
  totalRowsProcessed: number; // İşlem + Başlangıç Bakiyesi + Atlanan = Toplam
}

interface EntityIdMap {
  categories: Map<string, string>; // name -> id
  accounts: Map<string, string>; // name -> id
  clients: Map<string, string>; // name -> id
  personel: Map<string, string>; // name -> id
}

/**
 * Duplicate işlem bilgisi
 */
export interface DuplicateInfo {
  rowIndex: number;
  existingId: string;
  existingDate: string;
  existingAmount: number;
}

/**
 * Progress mesajları için çeviri arayüzü
 */
export interface ProgressTranslations {
  categories: string;
  accounts: string;
  clients: string;
  personel: string;
  transactions: string;
  balances: string;
  done: string;
  simulation: string;
  starting?: string;
  etaRemaining?: string; // "remaining" veya "kaldı"
}

/**
 * Import seçenekleri
 */
export interface ImportOptions {
  dryRun?: boolean;
  skipDuplicates?: boolean;
  categoryMappings?: Record<string, 'gelir' | 'gider'>; // Kullanıcının belirlediği kategori tipleri
  translations?: ProgressTranslations; // Lokalize edilmiş progress mesajları
}

// ============================================================================
// BALANCE UPDATE HELPERS
// ============================================================================

/**
 * Atomik bakiye güncelleme RPC çağrısı (network hatalarında retry destekli)
 */
async function safeIncrementBalance(tableName: string, rowId: string, amount: number, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { error } = await supabase.rpc('increment_balance', {
        table_name: tableName,
        row_id: rowId,
        amount: amount,
      });
      if (error) {
        throw new Error(`${error.message || error.code || JSON.stringify(error)}`);
      }
      return; // Başarılı
    } catch (err) {
      const isNetworkError = err instanceof TypeError && err.message === 'Network request failed';
      const isRetryable = isNetworkError || (err instanceof Error && err.message.includes('Network'));

      if (isRetryable && attempt < retries) {
        // Exponential backoff: 500ms, 1000ms, 2000ms...
        const delay = 500 * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (__DEV__) {
        console.error(`safeIncrementBalance hatası (attempt ${attempt}/${retries}): ${tableName}/${rowId} amount=${amount} → ${err instanceof Error ? err.message : String(err)}`);
      }
      throw new Error(`increment_balance(${tableName}, ${rowId}, ${amount}): ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }
}

/**
 * Cross-currency işlemlerde entity (cari/personel/hedef hesap) tarafının tutarını hesapla.
 * exchange_rate varsa dönüşüm uygular, yoksa orijinal amount döndürür.
 */
function getEntityAmount(islem: IslemInsert): number {
  const rate = safeParseExchangeRate(islem.exchange_rate);
  const src = islem.source_currency || 'TRY';
  const tgt = islem.target_currency || 'TRY';
  if (rate && src !== tgt) {
    return calculateTargetAmount(islem.amount, rate, src, tgt);
  }
  return islem.amount;
}

/**
 * Import edilen bir işlem için bakiye güncelleme
 * Normal işlem oluşturma ile aynı mantığı kullanır
 * OPTIMIZED: Birden fazla bakiye güncellemesi gerektiren işlemlerde Promise.all kullanılır
 */
async function updateBalanceForImportedTransaction(islem: IslemInsert): Promise<void> {
  const amount = islem.amount;
  const promises: Promise<void>[] = [];

  switch (islem.type) {
    case 'gelir':
      // Gelir: Hesap bakiyesini artır
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, amount);
      }
      break;

    case 'gider':
      // Gider: Hesap bakiyesini azalt
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, -amount);
      }
      break;

    case 'transfer': {
      // Transfer: Kaynak hesaptan düş, hedef hesaba ekle (PARALLEL)
      // Cross-currency: hedef hesaba dönüştürülmüş tutar eklenir
      const transferTargetAmount = getEntityAmount(islem);
      if (islem.hesap_id) {
        promises.push(safeIncrementBalance('hesaplar', islem.hesap_id, -amount));
      }
      if (islem.hedef_hesap_id) {
        promises.push(safeIncrementBalance('hesaplar', islem.hedef_hesap_id, transferTargetAmount));
      }
      if (promises.length > 0) await Promise.all(promises);
      break;
    }

    case 'cari_alis':
      // Cari alış: Cariden aldık, cari bakiyesi azalır (borçlanıyoruz)
      if (islem.cari_id) {
        await safeIncrementBalance('cariler', islem.cari_id, -amount);
      }
      break;

    case 'cari_satis':
      // Cari satış: Cariye sattık, cari bakiyesi artar (alacaklıyız)
      if (islem.cari_id) {
        await safeIncrementBalance('cariler', islem.cari_id, amount);
      }
      break;

    case 'cari_odeme': {
      // Cari ödeme: Cariye ödeme yaptık (PARALLEL)
      // Hesaptan para çıkıyor, cari bakiyesi artıyor (borcumuz azalıyor)
      // Cross-currency: cari bakiyesine dönüştürülmüş tutar eklenir
      const cariOdemeAmount = getEntityAmount(islem);
      if (islem.cari_id) {
        promises.push(safeIncrementBalance('cariler', islem.cari_id, cariOdemeAmount));
      }
      if (islem.hesap_id) {
        promises.push(safeIncrementBalance('hesaplar', islem.hesap_id, -amount));
      }
      if (promises.length > 0) await Promise.all(promises);
      break;
    }

    case 'cari_tahsilat': {
      // Cari tahsilat: Cariden tahsilat aldık (PARALLEL)
      // Hesaba para giriyor, cari bakiyesi azalıyor (alacağımız azalıyor)
      // Cross-currency: cari bakiyesinden dönüştürülmüş tutar düşülür
      const cariTahsilatAmount = getEntityAmount(islem);
      if (islem.cari_id) {
        promises.push(safeIncrementBalance('cariler', islem.cari_id, -cariTahsilatAmount));
      }
      if (islem.hesap_id) {
        promises.push(safeIncrementBalance('hesaplar', islem.hesap_id, amount));
      }
      if (promises.length > 0) await Promise.all(promises);
      break;
    }

    case 'personel_gider':
      // Personel gideri: Personele borç yazıldı (maaş, avans vb.)
      if (islem.personel_id) {
        await safeIncrementBalance('personel', islem.personel_id, -amount);
      }
      break;

    case 'personel_odeme': {
      // Personel ödemesi: Personele ödeme yapıldı (PARALLEL)
      // Hesaptan para çıkıyor, personel bakiyesi artıyor (borcumuz azalıyor)
      // Cross-currency: personel bakiyesine dönüştürülmüş tutar eklenir
      const personelOdemeAmount = getEntityAmount(islem);
      if (islem.personel_id) {
        promises.push(safeIncrementBalance('personel', islem.personel_id, personelOdemeAmount));
      }
      if (islem.hesap_id) {
        promises.push(safeIncrementBalance('hesaplar', islem.hesap_id, -amount));
      }
      if (promises.length > 0) await Promise.all(promises);
      break;
    }

    case 'personel_tahsilat': {
      // Personelden tahsilat: Personelden para aldık (PARALLEL)
      // Hesaba para giriyor, personel bakiyesi azalıyor
      // Cross-currency: personel bakiyesinden dönüştürülmüş tutar düşülür
      const personelTahsilatAmount = getEntityAmount(islem);
      if (islem.personel_id) {
        promises.push(safeIncrementBalance('personel', islem.personel_id, -personelTahsilatAmount));
      }
      if (islem.hesap_id) {
        promises.push(safeIncrementBalance('hesaplar', islem.hesap_id, amount));
      }
      if (promises.length > 0) await Promise.all(promises);
      break;
    }

    // İade işlemleri ve diğer tipler - bakiye güncellemesi gerektirmeyenler
    case 'cari_alis_iade':
    case 'cari_satis_iade':
    case 'nakit_avans_taksit':
      // Bu tipler için bakiye güncellemesi yapılmaz veya özel işlem gerekir
      if (__DEV__) {
        console.log('Import: İşlem tipi için bakiye güncellemesi atlandı:', islem.type);
      }
      break;

    default:
      // Bilinmeyen işlem tipi - uyarı logla
      if (__DEV__) {
        console.warn('Import: Bilinmeyen işlem tipi, bakiye güncellemesi yapılmadı:', islem.type);
      }
      break;
  }
}

/**
 * Bir işlemin bakiye değişikliklerini hesapla (RPC çağrısı yapmadan)
 * updateBalanceForImportedTransaction ile aynı mantık, ama Map döndürür
 * Import sırasında aggregate bakiye güncellemesi için kullanılır
 */
function calculateBalanceChanges(islem: IslemInsert): Map<string, number> {
  const changes = new Map<string, number>();
  const amount = islem.amount;

  const addChange = (tableName: string, rowId: string, delta: number) => {
    const key = `${tableName}/${rowId}`;
    changes.set(key, (changes.get(key) || 0) + delta);
  };

  switch (islem.type) {
    case 'gelir':
      if (islem.hesap_id) addChange('hesaplar', islem.hesap_id, amount);
      break;
    case 'gider':
      if (islem.hesap_id) addChange('hesaplar', islem.hesap_id, -amount);
      break;
    case 'transfer': {
      const tgtAmt = getEntityAmount(islem);
      if (islem.hesap_id) addChange('hesaplar', islem.hesap_id, -amount);
      if (islem.hedef_hesap_id) addChange('hesaplar', islem.hedef_hesap_id, tgtAmt);
      break;
    }
    case 'cari_alis':
      if (islem.cari_id) addChange('cariler', islem.cari_id, -amount);
      break;
    case 'cari_satis':
      if (islem.cari_id) addChange('cariler', islem.cari_id, amount);
      break;
    case 'cari_odeme': {
      const eAmt = getEntityAmount(islem);
      if (islem.cari_id) addChange('cariler', islem.cari_id, eAmt);
      if (islem.hesap_id) addChange('hesaplar', islem.hesap_id, -amount);
      break;
    }
    case 'cari_tahsilat': {
      const eAmt = getEntityAmount(islem);
      if (islem.cari_id) addChange('cariler', islem.cari_id, -eAmt);
      if (islem.hesap_id) addChange('hesaplar', islem.hesap_id, amount);
      break;
    }
    case 'personel_gider':
      if (islem.personel_id) addChange('personel', islem.personel_id, -amount);
      break;
    case 'personel_odeme': {
      const eAmt = getEntityAmount(islem);
      if (islem.personel_id) addChange('personel', islem.personel_id, eAmt);
      if (islem.hesap_id) addChange('hesaplar', islem.hesap_id, -amount);
      break;
    }
    case 'personel_tahsilat': {
      const eAmt = getEntityAmount(islem);
      if (islem.personel_id) addChange('personel', islem.personel_id, -eAmt);
      if (islem.hesap_id) addChange('hesaplar', islem.hesap_id, amount);
      break;
    }
    // İade ve diğer tipler: bakiye güncellemesi yok
    case 'cari_alis_iade':
    case 'cari_satis_iade':
    case 'nakit_avans_taksit':
    default:
      break;
  }

  return changes;
}

// ============================================================================
// DUPLICATE CHECK HELPERS
// ============================================================================

/**
 * Import öncesi duplicate kontrolü
 * Aynı tarih + tutar kombinasyonunu kontrol eder
 * Supabase'de yeni tablo oluşturmadan mevcut islemler tablosunu sorgular
 */
async function checkForDuplicates(
  transactions: ParsedTransaction[],
  isletmeId: string
): Promise<Map<number, DuplicateInfo>> {
  const duplicates = new Map<number, DuplicateInfo>();

  // Sadece geçerli tarihi olan işlemleri al
  const validTransactions = transactions.filter(tx => tx.dateValid && tx.date);
  if (validTransactions.length === 0) return duplicates;

  // Unique tarihleri topla ve sırala (performans için tek sorguda)
  const uniqueDates = [...new Set(validTransactions.filter(tx => tx.date).map(tx => tx.date!.split('T')[0]))].sort();

  try {
    // Tek sorguda tüm potansiyel duplicate'ları al
    const { data: existingIslemler, error } = await supabase
      .from('islemler')
      .select('id, date, amount')
      .eq('isletme_id', isletmeId)
      .gte('date', uniqueDates[0] + 'T00:00:00')
      .lte('date', uniqueDates[uniqueDates.length - 1] + 'T23:59:59');

    if (error) {
      if (__DEV__) {
        console.error('Duplicate check error:', error);
      }
      return duplicates;
    }

    if (!existingIslemler || existingIslemler.length === 0) {
      return duplicates;
    }

    // Map oluştur: date|amount -> existing işlem
    const existingMap = new Map<string, { id: string; date: string; amount: number }>();
    existingIslemler.forEach(islem => {
      // Tarih kısmını normalleştir (saat kısmını kaldır)
      const dateOnly = islem.date.split('T')[0];
      const key = `${dateOnly}|${islem.amount}`;
      existingMap.set(key, {
        id: islem.id,
        date: islem.date,
        amount: islem.amount,
      });
    });

    // Her transaction için kontrol et
    transactions.forEach((tx, idx) => {
      if (!tx.dateValid || !tx.date) return;

      const dateOnly = tx.date.split('T')[0];
      const key = `${dateOnly}|${tx.amount}`;
      const existing = existingMap.get(key);

      if (existing) {
        duplicates.set(idx, {
          rowIndex: idx,
          existingId: existing.id,
          existingDate: existing.date,
          existingAmount: existing.amount,
        });
      }
    });
  } catch (err) {
    if (__DEV__) {
      console.error('Duplicate check exception:', err);
    }
  }

  return duplicates;
}

// ============================================================================
// HOOK
// ============================================================================

// Varsayılan çeviriler (Türkçe fallback)
const DEFAULT_TRANSLATIONS: ProgressTranslations = {
  categories: 'Kategoriler oluşturuluyor...',
  accounts: 'Hesaplar oluşturuluyor...',
  clients: 'Cariler oluşturuluyor...',
  personel: 'Personeller oluşturuluyor...',
  transactions: 'İşlemler import ediliyor...',
  balances: 'Bakiyeler güncelleniyor...',
  done: 'Tamamlandı!',
  simulation: 'Simülasyon yapılıyor...',
  starting: 'Başlatılıyor...',
  etaRemaining: 'kaldı',
};

export function useDataImport() {
  const { isletme } = useAuthContext();
  const queryClient = useQueryClient();

  // Aktif çeviriler ref'i - runImport çağrıldığında güncellenir
  const translationsRef = useRef<ProgressTranslations>(DEFAULT_TRANSLATIONS);

  const [progress, setProgress] = useState<ImportProgress>({
    phase: 'idle',
    current: 0,
    total: 0,
    message: '',
    percentage: 0,
    itemsPerSecond: 0,
    phaseDetails: { categories: 0, accounts: 0, clients: 0, personel: 0, transactions: 0 },
  });

  const [result, setResult] = useState<ImportResult | null>(null);
  const [duplicates, setDuplicates] = useState<Map<number, DuplicateInfo>>(new Map());

  /**
   * Duplicate kontrolü yap
   * Import öncesi çağrılır, önizlemede duplicate'ları göstermek için
   */
  const runDuplicateCheck = useCallback(async (
    transactions: ParsedTransaction[]
  ): Promise<Map<number, DuplicateInfo>> => {
    if (!isletme) return new Map();

    const result = await checkForDuplicates(transactions, isletme.id);
    setDuplicates(result);
    return result;
  }, [isletme]);

  /**
   * Mevcut kategorileri al (duplicate kontrolü için)
   * Sadece aktif kategorileri döndürür - inactive olanlar yeni oluşturulacakmış gibi işlenir
   */
  const getExistingCategories = useCallback(async (): Promise<Map<string, string>> => {
    if (!isletme) return new Map();

    const { data } = await supabase
      .from('kategoriler')
      .select('id, name, is_active')
      .eq('isletme_id', isletme.id);

    const map = new Map<string, string>();
    data?.forEach(k => {
      // Sadece aktif kategorileri ekle
      if (k.is_active) {
        map.set(k.name.toLowerCase(), k.id);
      }
    });

    if (__DEV__) {
      const activeCount = data?.filter(k => k.is_active).length || 0;
      const inactiveCount = data?.filter(k => !k.is_active).length || 0;
      console.log(`Categories in DB: ${data?.length || 0} total, ${activeCount} active, ${inactiveCount} inactive`);
    }

    return map;
  }, [isletme]);

  /**
   * Mevcut hesapları al
   */
  const getExistingAccounts = useCallback(async (): Promise<Map<string, string>> => {
    if (!isletme) return new Map();

    const { data } = await supabase
      .from('hesaplar')
      .select('id, name')
      .eq('isletme_id', isletme.id);

    const map = new Map<string, string>();
    data?.forEach(h => map.set(h.name.toLowerCase(), h.id));
    return map;
  }, [isletme]);

  /**
   * Mevcut carileri al
   */
  const getExistingClients = useCallback(async (): Promise<Map<string, string>> => {
    if (!isletme) return new Map();

    const { data } = await supabase
      .from('cariler')
      .select('id, name')
      .eq('isletme_id', isletme.id);

    const map = new Map<string, string>();
    data?.forEach(c => map.set(c.name.toLowerCase(), c.id));
    return map;
  }, [isletme]);

  /**
   * Mevcut personeli al
   */
  const getExistingPersonel = useCallback(async (): Promise<Map<string, string>> => {
    if (!isletme) return new Map();

    const { data } = await supabase
      .from('personel')
      .select('id, first_name, last_name')
      .eq('isletme_id', isletme.id);

    const map = new Map<string, string>();
    data?.forEach(p => {
      const fullName = p.last_name ? `${p.first_name} ${p.last_name}` : p.first_name;
      map.set(fullName.toLowerCase(), p.id);
    });
    return map;
  }, [isletme]);

  /**
   * Kategorileri import et
   * Kullanıcının belirlediği kategori tiplerini kullanır (categoryMappings)
   * categoryMappings verilmemişse işlem tipine göre otomatik belirler
   * @returns { map, createdIds, reactivatedIds } - map: tüm kategorilerin ID'leri, createdIds: yeni oluşturulanların ID'leri, reactivatedIds: reactivate edilenlerin ID'leri
   */
  const importCategories = useCallback(async (
    categories: string[],
    existingMap: Map<string, string>,
    transactions: ParsedTransaction[],
    userCategoryMappings?: Record<string, 'gelir' | 'gider'>
  ): Promise<{ map: Map<string, string>; createdIds: string[]; reactivatedIds: string[] }> => {
    if (!isletme) return { map: existingMap, createdIds: [], reactivatedIds: [] };

    // Debug: Gelen kategorileri ve mevcut kategorileri logla
    if (__DEV__) {
      console.log('importCategories called with:', {
        categories,
        existingMapKeys: [...existingMap.keys()],
        existingMapSize: existingMap.size,
        transactionsWithCategory: transactions.filter(t => t.category).length,
        userCategoryMappings,
      });
    }

    const resultMap = new Map(existingMap);
    const newCategories: KategoriInsert[] = [];
    const categoriesToReactivate: string[] = []; // Inactive kategorileri aktif yapacağız

    // Tüm kategorileri al (inactive dahil) - reactivation için
    const { data: allCategories } = await supabase
      .from('kategoriler')
      .select('id, name, is_active')
      .eq('isletme_id', isletme.id);

    const allCategoriesMap = new Map<string, { id: string; is_active: boolean }>();
    allCategories?.forEach(k => {
      allCategoriesMap.set(k.name.toLowerCase(), { id: k.id, is_active: k.is_active });
    });

    // Kullanıcının belirlediği kategorileri kullan, yoksa otomatik belirle
    const categoryTypeMap = new Map<string, 'gelir' | 'gider'>();

    if (userCategoryMappings && Object.keys(userCategoryMappings).length > 0) {
      // Kullanıcının belirlediği tipleri kullan
      Object.entries(userCategoryMappings).forEach(([name, type]) => {
        categoryTypeMap.set(name.toLowerCase(), type);
      });
    } else {
      // İşlem tipine göre otomatik belirle
      transactions.forEach(tx => {
        if (tx.category) {
          const catLower = tx.category.toLowerCase();
          // Gelir işlemleri: gelir, cari_satis
          if (tx.mappedType === 'gelir' || tx.mappedType === 'cari_satis') {
            categoryTypeMap.set(catLower, 'gelir');
          } else if (!categoryTypeMap.has(catLower)) {
            // Henüz belirlenmemişse gider olarak işaretle
            categoryTypeMap.set(catLower, 'gider');
          }
        }
      });
    }

    if (__DEV__) {
      console.log('Category type mapping:', [...categoryTypeMap.entries()]);
    }

    categories.forEach(name => {
      const lowerName = name.toLowerCase();
      const existingActive = resultMap.has(lowerName);
      const existingInDB = allCategoriesMap.get(lowerName);

      if (__DEV__) {
        console.log(`Category "${name}" (lower: "${lowerName}"): existingActive=${existingActive}, inDB=${!!existingInDB}, isActive=${existingInDB?.is_active}`);
      }

      if (existingActive) {
        // Zaten aktif, bir şey yapmaya gerek yok
        return;
      }

      if (existingInDB && !existingInDB.is_active) {
        // Veritabanında var ama inactive - aktif yap
        categoriesToReactivate.push(existingInDB.id);
        resultMap.set(lowerName, existingInDB.id);
        if (__DEV__) {
          console.log(`Will reactivate category: "${name}" (id: ${existingInDB.id})`);
        }
      } else if (!existingInDB) {
        // Hiç yok - yeni oluştur
        const categoryType = categoryTypeMap.get(lowerName) || 'gider';
        newCategories.push({
          isletme_id: isletme.id,
          name,
          type: categoryType,
          is_active: true,
        });
      }
    });

    // Inactive kategorileri aktif yap
    if (categoriesToReactivate.length > 0) {
      if (__DEV__) {
        console.log('Reactivating categories:', categoriesToReactivate);
      }
      const { error: reactivateError } = await supabase
        .from('kategoriler')
        .update({ is_active: true })
        .in('id', categoriesToReactivate);

      if (reactivateError) {
        if (__DEV__) {
          console.error('Category reactivation error:', reactivateError);
        }
      } else if (__DEV__) {
        console.log(`Reactivated ${categoriesToReactivate.length} categories`);
      }
    }

    if (__DEV__) {
      console.log('New categories to create:', newCategories);
    }

    if (newCategories.length === 0) {
      if (__DEV__) {
        console.log('No new categories to create, but may have reactivated:', categoriesToReactivate.length);
      }
      return { map: resultMap, createdIds: [], reactivatedIds: categoriesToReactivate };
    }

    setProgress(p => ({
      ...p,
      phase: 'categories',
      message: translationsRef.current.categories,
      phaseDetails: { ...p.phaseDetails, categories: newCategories.length },
    }));

    // Batch insert
    const createdIds: string[] = [];
    const chunks = chunkArray(newCategories, 100);
    for (const chunk of chunks) {
      if (__DEV__) {
        console.log('Inserting categories batch:', chunk);
      }
      const { data, error } = await supabase
        .from('kategoriler')
        .insert(chunk)
        .select('id, name');

      if (error) {
        if (__DEV__) {
          console.error('Category insert error:', error);
        }
        throw new Error(`Kategori hatası: ${error.message}`);
      }

      if (__DEV__) {
        console.log('Categories created:', data);
      }
      data?.forEach(k => {
        resultMap.set(k.name.toLowerCase(), k.id);
        createdIds.push(k.id); // Yeni oluşturulan ID'yi kaydet
      });
    }

    if (__DEV__) {
      console.log('Final category map keys:', [...resultMap.keys()]);
      console.log('Created category IDs:', createdIds);
      console.log('Reactivated category IDs:', categoriesToReactivate);
    }

    return { map: resultMap, createdIds, reactivatedIds: categoriesToReactivate };
  }, [isletme]);

  /**
   * Hesapları import et
   * Başlangıç bakiyesi varsa kullanılır, yoksa 0
   * @param startingBalances - hesap adı (lowercase) -> bakiye map'i
   * @returns { map, createdIds } - map: tüm hesapların ID'leri, createdIds: yeni oluşturulanların ID'leri
   */
  const importAccounts = useCallback(async (
    accountMappings: Record<string, AccountMapping>,
    existingMap: Map<string, string>,
    startingBalances: Map<string, number> = new Map()
  ): Promise<{ map: Map<string, string>; createdIds: string[] }> => {
    if (!isletme) return { map: existingMap, createdIds: [] };

    const resultMap = new Map(existingMap);
    const newAccounts: HesapInsert[] = [];

    Object.values(accountMappings).forEach(mapping => {
      if (mapping.type === 'hesap' && !resultMap.has(mapping.name.toLowerCase())) {
        const initialBalance = startingBalances.get(mapping.name.toLowerCase()) || 0;
        newAccounts.push({
          isletme_id: isletme.id,
          name: mapping.name,
          type: (mapping.hesapType || 'banka') as HesapType,
          currency: (mapping.currency || 'TRY') as 'TRY' | 'USD' | 'EUR' | 'GBP' | 'XAU' | 'XAG', // Import'tan tespit edilen para birimi
          balance: initialBalance, // Başlangıç bakiyesi (varsa) veya 0
          initial_balance: initialBalance, // initial_balance alanını da ayarla
        });
      }
    });

    if (newAccounts.length === 0) return { map: resultMap, createdIds: [] };

    setProgress(p => ({
      ...p,
      phase: 'accounts',
      message: translationsRef.current.accounts,
      phaseDetails: { ...p.phaseDetails, accounts: newAccounts.length },
    }));

    const createdIds: string[] = [];
    const chunks = chunkArray(newAccounts, 100);
    for (const chunk of chunks) {
      const { data, error } = await supabase
        .from('hesaplar')
        .insert(chunk)
        .select('id, name');

      if (error) throw new Error(`Hesap hatası: ${error.message}`);
      data?.forEach(h => {
        resultMap.set(h.name.toLowerCase(), h.id);
        createdIds.push(h.id); // Yeni oluşturulan ID'yi kaydet
      });
    }

    if (__DEV__) {
      console.log('Created account IDs:', createdIds);
    }

    return { map: resultMap, createdIds };
  }, [isletme]);

  /**
   * Carileri import et
   * Başlangıç bakiyesi varsa kullanılır, yoksa 0
   * @param startingBalances - cari adı (lowercase) -> bakiye map'i
   * @returns { map, createdIds } - map: tüm carilerin ID'leri, createdIds: yeni oluşturulanların ID'leri
   */
  const importClients = useCallback(async (
    accountMappings: Record<string, AccountMapping>,
    existingMap: Map<string, string>,
    startingBalances: Map<string, number> = new Map()
  ): Promise<{ map: Map<string, string>; createdIds: string[] }> => {
    if (!isletme) return { map: existingMap, createdIds: [] };

    const resultMap = new Map(existingMap);
    const newClients: CariInsert[] = [];

    Object.values(accountMappings).forEach(mapping => {
      if (mapping.type === 'cari' && !resultMap.has(mapping.name.toLowerCase())) {
        const initialBalance = startingBalances.get(mapping.name.toLowerCase()) || 0;
        newClients.push({
          isletme_id: isletme.id,
          name: mapping.name,
          type: (mapping.cariType || 'tedarikci') as CariType,
          balance: initialBalance, // Başlangıç bakiyesi (varsa) veya 0
        });
      }
    });

    if (newClients.length === 0) return { map: resultMap, createdIds: [] };

    setProgress(p => ({
      ...p,
      phase: 'clients',
      message: translationsRef.current.clients,
      phaseDetails: { ...p.phaseDetails, clients: newClients.length },
    }));

    const createdIds: string[] = [];
    const chunks = chunkArray(newClients, 100);
    for (const chunk of chunks) {
      const { data, error } = await supabase
        .from('cariler')
        .insert(chunk)
        .select('id, name');

      if (error) throw new Error(`Cari hatası: ${error.message}`);
      data?.forEach(c => {
        resultMap.set(c.name.toLowerCase(), c.id);
        createdIds.push(c.id); // Yeni oluşturulan ID'yi kaydet
      });
    }

    if (__DEV__) {
      console.log('Created client IDs:', createdIds);
    }

    return { map: resultMap, createdIds };
  }, [isletme]);

  /**
   * Personelleri import et
   * Başlangıç bakiyesi varsa kullanılır, yoksa 0
   * @param startingBalances - personel adı (lowercase) -> bakiye map'i
   * @returns { map, createdIds } - map: tüm personelin ID'leri, createdIds: yeni oluşturulanların ID'leri
   */
  const importPersonel = useCallback(async (
    accountMappings: Record<string, AccountMapping>,
    existingMap: Map<string, string>,
    startingBalances: Map<string, number> = new Map()
  ): Promise<{ map: Map<string, string>; createdIds: string[] }> => {
    if (!isletme) return { map: existingMap, createdIds: [] };

    const resultMap = new Map(existingMap);
    const newPersonel: PersonelInsert[] = [];

    // Debug: accountMappings içindeki personel tiplerini göster
    if (__DEV__) {
      const personelMappings = Object.values(accountMappings).filter(m => m.type === 'personel');
      console.log('Import Personel Debug:', {
        totalMappings: Object.keys(accountMappings).length,
        personelMappings: personelMappings.map(m => m.name),
        existingPersonel: [...existingMap.keys()],
        startingBalances: [...startingBalances.entries()],
      });
    }

    Object.values(accountMappings).forEach(mapping => {
      if (mapping.type === 'personel' && !resultMap.has(mapping.name.toLowerCase())) {
        // İsmi first_name ve last_name olarak ayır
        // Son kelime soyisim, geri kalan tümü isim
        // "Ömer Faruk Özadalı" -> isim: "Ömer Faruk", soyisim: "Özadalı"
        // "Yusuf" -> isim: "Yusuf", soyisim: ""
        const nameParts = mapping.name.trim().split(/\s+/);
        const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
        const firstName = nameParts.length > 1
          ? nameParts.slice(0, -1).join(' ')
          : nameParts[0] || mapping.name;

        const initialBalance = startingBalances.get(mapping.name.toLowerCase()) || 0;

        if (__DEV__) {
          console.log('Creating personel:', {
            originalName: mapping.name,
            firstName,
            lastName,
            mapKey: mapping.name.toLowerCase(),
            initialBalance,
          });
        }

        newPersonel.push({
          isletme_id: isletme.id,
          first_name: firstName,
          last_name: lastName,
          balance: initialBalance, // Başlangıç bakiyesi (varsa) veya 0
        });
      }
    });

    if (newPersonel.length === 0) return { map: resultMap, createdIds: [] };

    setProgress(p => ({
      ...p,
      phase: 'personel',
      message: translationsRef.current.personel,
      phaseDetails: { ...p.phaseDetails, personel: newPersonel.length },
    }));

    const createdIds: string[] = [];
    const chunks = chunkArray(newPersonel, 100);
    for (const chunk of chunks) {
      const { data, error } = await supabase
        .from('personel')
        .insert(chunk)
        .select('id, first_name, last_name');

      if (error) throw new Error(`Personel hatası: ${error.message}`);
      data?.forEach(p => {
        const fullName = p.last_name ? `${p.first_name} ${p.last_name}` : p.first_name;
        const mapKey = fullName.toLowerCase();
        resultMap.set(mapKey, p.id);
        createdIds.push(p.id); // Yeni oluşturulan ID'yi kaydet

        if (__DEV__) {
          console.log('Personel added to map:', {
            firstName: p.first_name,
            lastName: p.last_name,
            fullName,
            mapKey,
            id: p.id,
          });
        }
      });
    }

    if (__DEV__) {
      console.log('Final personel map keys:', [...resultMap.keys()]);
      console.log('Created personel IDs:', createdIds);
    }

    return { map: resultMap, createdIds };
  }, [isletme]);

  /**
   * İşlemleri import et
   * @param skipDuplicates - true ise duplicate işlemleri atla
   * @param duplicatesMap - runDuplicateCheck'ten dönen duplicate bilgileri
   */
  const importTransactions = useCallback(async (
    transactions: ParsedTransaction[],
    accountMappings: Record<string, AccountMapping>,
    idMaps: EntityIdMap,
    skipDuplicates: boolean = false,
    duplicatesMap: Map<number, DuplicateInfo> = new Map()
  ): Promise<{ created: number; skipped: number; skippedTransactions: SkippedTransaction[]; errors: string[]; transactionIds: string[] }> => {
    if (!isletme) return { created: 0, skipped: 0, skippedTransactions: [], errors: ['İşletme bulunamadı'], transactionIds: [] };

    const errors: string[] = [];
    const skippedTransactions: SkippedTransaction[] = [];
    const transactionIds: string[] = []; // Geri alma için ID'leri topla
    let created = 0;
    let skipped = 0;

    const chunks = chunkArray(transactions, 500);
    const totalChunks = chunks.length;
    let globalIndex = 0; // Toplam işlem indexi (satır numarası için)
    const startTime = Date.now(); // ETA hesaplaması için

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      const islemler: IslemInsert[] = [];
      const islemIndices: number[] = []; // Başarılı eklenen işlemlerin indexleri

      // ETA hesapla
      const currentProgress = chunkIndex * 500;
      const elapsed = Date.now() - startTime;
      let estimatedTimeRemaining: number | undefined;

      if (currentProgress > 0 && elapsed > 0) {
        const rate = currentProgress / elapsed; // işlem/ms
        const remaining = transactions.length - currentProgress;
        estimatedTimeRemaining = Math.ceil(remaining / rate / 1000); // saniye
      }

      const etaText = estimatedTimeRemaining !== undefined && estimatedTimeRemaining > 0
        ? ` (~${estimatedTimeRemaining}s ${translationsRef.current.etaRemaining || 'kaldı'})`
        : '';

      // Hız ve yüzde hesapla
      const percentage = transactions.length > 0 ? Math.round((currentProgress / transactions.length) * 100) : 0;
      const itemsPerSecond = elapsed > 0 ? Math.round(currentProgress / (elapsed / 1000)) : 0;

      setProgress(p => ({
        ...p,
        phase: 'transactions',
        current: currentProgress,
        total: transactions.length,
        message: `${translationsRef.current.transactions} (${chunkIndex + 1}/${totalChunks})${etaText}`,
        estimatedTimeRemaining,
        startTime,
        percentage,
        itemsPerSecond,
        phaseDetails: {
          ...p.phaseDetails,
          transactions: currentProgress,
        },
      }));

      for (const tx of chunk) {
        // Satır numarasını transaction'dan al (varsa) veya hesapla
        const rowNumber = tx.rowNumber || (globalIndex + 2);
        globalIndex++;

        try {
          // Başlangıç bakiyesi işlemlerini sessizce atla (zaten entity'lere uygulandı)
          // Atlanan listesine EKLEMİYORUZ çünkü başarıyla işlendi
          if (tx.mappedType === 'baslangic_bakiyesi') {
            continue;
          }

          // Tarih geçerliliği kontrolü
          if (!tx.dateValid) {
            skipped++;
            skippedTransactions.push({
              transaction: tx,
              reason: tx.dateError || 'Geçersiz tarih',
              rowNumber,
            });
            continue;
          }

          // Tutar geçerliliği kontrolü
          if (!tx.amountValid) {
            skipped++;
            skippedTransactions.push({
              transaction: tx,
              reason: tx.amountError || 'Geçersiz tutar',
              rowNumber,
            });
            continue;
          }

          // Entity geçerliliği kontrolü (hesap/cari/personel)
          if (!tx.entityValid) {
            skipped++;
            skippedTransactions.push({
              transaction: tx,
              reason: tx.entityError || 'Hesap, cari veya personel bilgisi eksik',
              rowNumber,
            });
            continue;
          }

          // Duplicate kontrolü (skipDuplicates aktifse)
          if (skipDuplicates && duplicatesMap.has(globalIndex - 1)) {
            const dupInfo = duplicatesMap.get(globalIndex - 1)!;
            skipped++;
            skippedTransactions.push({
              transaction: tx,
              reason: `Duplicate: ${new Date(dupInfo.existingDate).toLocaleDateString('tr-TR')} tarihinde ${dupInfo.existingAmount.toLocaleString('tr-TR')} tutarında aynı işlem mevcut`,
              rowNumber,
            });
            continue;
          }

          // Ana hesap ID'sini bul (HESAP kolonu)
          // NOT: cari_alis ve cari_satis işlemleri için HESAP zorunlu değil
          let hesapId = tx.account
            ? idMaps.accounts.get(tx.account.toLowerCase()) || null
            : null;

          // HESAP yoksa ve KARŞI HESAP varsa (transfer HARİÇ), hesap_id olarak kullan
          // Defter'de GIDER/GELIR/ÖDEME işlemlerinde KARŞI HESAP = paranın gittiği/geldiği hesap
          if (!hesapId && tx.karsiHesap && tx.mappedType !== 'transfer') {
            hesapId = idMaps.accounts.get(tx.karsiHesap.toLowerCase()) || null;
            if (__DEV__ && hesapId) {
              console.log(`[KARŞI HESAP FALLBACK] ${tx.mappedType}: HESAP="${tx.account}" → KARŞI HESAP="${tx.karsiHesap}" kullanıldı`);
            }
          }

          // Hesap bulunamadıysa atla (istisna: cari işlemleri, iadeler ve personel_gider)
          // personel_gider: Sadece personel bakiyesini etkiler, hesap gerekmez
          // cari_alis/cari_satis/iadeler: Cari bakiyesini etkiler, hesap opsiyonel
          const isCariIslemi = ['cari_alis', 'cari_satis', 'cari_alis_iade', 'cari_satis_iade'].includes(tx.mappedType);
          const isPersonelGider = tx.mappedType === 'personel_gider';
          if (!hesapId && !isCariIslemi && !isPersonelGider) {
            skipped++;
            skippedTransactions.push({
              transaction: tx,
              reason: `Hesap bulunamadı: "${tx.account}"`,
              rowNumber,
            });
            continue;
          }
          // Hesap opsiyonel işlemler için hesap belirtilmişse ama bulunamadıysa uyar (atlamadan devam et)
          if (!hesapId && tx.account && (isCariIslemi || isPersonelGider)) {
            if (__DEV__) {
              console.log(`[UYARI] ${tx.mappedType} için hesap bulunamadı: "${tx.account}", hesap_id null olarak devam ediliyor`);
            }
          }

          // Transfer işlemi için karşı hesap kontrolü
          if (tx.mappedType === 'transfer') {
            if (!tx.karsiHesap) {
              skipped++;
              skippedTransactions.push({
                transaction: tx,
                reason: 'Transfer işlemi için KARŞI HESAP kolonu boş',
                rowNumber,
              });
              continue;
            }

            // Debug: Transfer için hesap lookup
            if (__DEV__) {
              const lookupKey = tx.karsiHesap.toLowerCase();
              console.log('Transfer lookup:', {
                karsiHesap: tx.karsiHesap,
                lookupKey,
                found: idMaps.accounts.has(lookupKey),
                availableAccounts: [...idMaps.accounts.keys()].slice(0, 10),
              });
            }

            const hedefHesapId = idMaps.accounts.get(tx.karsiHesap.toLowerCase()) || null;
            if (!hedefHesapId) {
              skipped++;
              skippedTransactions.push({
                transaction: tx,
                reason: `Transfer için karşı hesap bulunamadı: "${tx.karsiHesap}"`,
                rowNumber,
              });
              continue;
            }
          }

          // Cari işlemleri için cari kontrolü (tüm cari işlem tipleri ve iadeler için)
          const cariIslemTipleri = ['cari_odeme', 'cari_tahsilat', 'cari_alis', 'cari_satis', 'cari_alis_iade', 'cari_satis_iade'];
          if (cariIslemTipleri.includes(tx.mappedType)) {
            const hasCari = tx.tedarikci || tx.musteri;
            if (!hasCari) {
              skipped++;
              skippedTransactions.push({
                transaction: tx,
                reason: `Cari işlemi (${tx.mappedType}) için TEDARİKÇİ veya MÜŞTERİ kolonu boş`,
                rowNumber,
              });
              continue;
            }

            // Cari ID'nin bulunabildiğini kontrol et
            const cariName = tx.tedarikci || tx.musteri;
            const cariId = idMaps.clients.get(cariName!.toLowerCase()) || null;
            if (!cariId) {
              skipped++;
              skippedTransactions.push({
                transaction: tx,
                reason: `Cari bulunamadı: "${cariName}"`,
                rowNumber,
              });
              continue;
            }
          }

          // Personel işlemleri için personel kontrolü
          // personel_gider, personel_odeme VE personel_tahsilat için kontrol
          if (tx.mappedType === 'personel_gider' || tx.mappedType === 'personel_odeme' || tx.mappedType === 'personel_tahsilat') {
            if (!tx.personel) {
              skipped++;
              skippedTransactions.push({
                transaction: tx,
                reason: 'Personel işlemi için PERSONEL kolonu boş',
                rowNumber,
              });
              continue;
            }

            // Debug: Personel lookup
            if (__DEV__) {
              const searchKey = tx.personel.toLowerCase();
              const allKeys = [...idMaps.personel.keys()];
              console.log('Personel lookup:', {
                searchKey,
                found: idMaps.personel.has(searchKey),
                availableKeys: allKeys.slice(0, 5),
                totalPersonel: allKeys.length,
              });
            }

            const personelId = idMaps.personel.get(tx.personel.toLowerCase()) || null;
            if (!personelId) {
              skipped++;
              skippedTransactions.push({
                transaction: tx,
                reason: `Personel bulunamadı: "${tx.personel}"`,
                rowNumber,
              });
              continue;
            }
          }

          // Karşı hesap ID (transfer için)
          const hedefHesapId = tx.karsiHesap
            ? idMaps.accounts.get(tx.karsiHesap.toLowerCase()) || null
            : null;

          // Cari ID (tedarikçi veya müşteri)
          let cariId: string | null = null;
          if (tx.tedarikci) {
            cariId = idMaps.clients.get(tx.tedarikci.toLowerCase()) || null;
          } else if (tx.musteri) {
            cariId = idMaps.clients.get(tx.musteri.toLowerCase()) || null;
          }

          // Personel ID
          const personelId = tx.personel
            ? idMaps.personel.get(tx.personel.toLowerCase()) || null
            : null;

          // Debug: Personel işlemleri için log
          if (__DEV__ && tx.personel) {
            console.log('Transaction with personel:', {
              excelType: tx.type,
              mappedType: tx.mappedType,
              personel: tx.personel,
              personelId,
              lookupKey: tx.personel.toLowerCase(),
            });
          }

          // Kategori ID
          const kategoriId = tx.category
            ? idMaps.categories.get(tx.category.toLowerCase()) || null
            : null;

          // İşlem tipi belirle
          const islemType: IslemType = tx.mappedType as IslemType;

          // Tutarı 2 ondalık basamağa yuvarla (veritabanı DECIMAL(15,2))
          const finalAmount = Math.round(tx.amount * 100) / 100;

          // Son güvenlik kontrolü: tutar > 0 olmalı
          if (finalAmount <= 0) {
            skipped++;
            skippedTransactions.push({
              transaction: tx,
              reason: `Tutar sıfır veya negatif: ${tx.amount}`,
              rowNumber,
            });
            continue;
          }

          // Cross-currency tespiti: bracket notation'dan kur hesapla
          // Kur formatı: "1 yabancı para = X TRY"
          // - Yabancı → TRY: kur = bracketAmount / amount (örn: 28350 TRY / 700 USD = 40.5)
          // - TRY → Yabancı: kur = amount / bracketAmount (örn: 99.91 TRY / 2.74 EUR = 36.46)
          // - Yabancı → Yabancı: kur = bracketAmount / amount (direkt çarpım)
          let sourceCurrency: string | null = null;
          let targetCurrency: string | null = null;
          let exchangeRate: number | null = null;

          // Bracket tutarı ve para birimi belirle (transfer vs entity)
          let bracketAmount: number | null = null;
          let bracketCurrency: string | null = null;
          if (islemType === 'transfer' && tx.karsiHesapAmount && tx.karsiHesapCurrency && tx.currency) {
            bracketAmount = tx.karsiHesapAmount;
            bracketCurrency = tx.karsiHesapCurrency;
          } else if (tx.entityBracketAmount && tx.entityBracketCurrency && tx.currency) {
            bracketAmount = tx.entityBracketAmount;
            bracketCurrency = tx.entityBracketCurrency;
          }

          if (bracketAmount && bracketCurrency && tx.currency && tx.currency !== bracketCurrency) {
            sourceCurrency = tx.currency;
            targetCurrency = bracketCurrency;
            if (finalAmount > 0 && bracketAmount > 0) {
              if (sourceCurrency === 'TRY') {
                // TRY → Yabancı: kur = kaynak TRY / hedef yabancı = "1 yabancı = X TRY"
                exchangeRate = Math.round((finalAmount / bracketAmount) * 10000) / 10000;
              } else {
                // Yabancı → TRY veya Yabancı → Yabancı: kur = hedef / kaynak
                exchangeRate = Math.round((bracketAmount / finalAmount) * 10000) / 10000;
              }
            }
          }

          const islem: IslemInsert = {
            isletme_id: isletme.id,
            type: islemType,
            amount: finalAmount,
            date: tx.date,
            description: tx.description,
            hesap_id: hesapId,
            hedef_hesap_id: hedefHesapId,
            cari_id: cariId,
            personel_id: personelId,
            kategori_id: kategoriId,
            source_currency: sourceCurrency,
            target_currency: targetCurrency,
            exchange_rate: exchangeRate,
          };

          islemler.push(islem);
          islemIndices.push(globalIndex - 1);
        } catch (err) {
          errors.push(`İşlem hatası: ${err}`);
          skipped++;
          skippedTransactions.push({
            transaction: tx,
            reason: `Beklenmeyen hata: ${err}`,
            rowNumber,
          });
        }
      }

      // Batch insert
      if (islemler.length > 0) {
        // Debug: Insert öncesi log
        if (__DEV__) {
          console.log('Import: Inserting batch', {
            count: islemler.length,
            sampleIslem: islemler[0],
            isletme_id: isletme?.id,
          });
        }

        const { data: insertedData, error } = await supabase
          .from('islemler')
          .insert(islemler)
          .select('id'); // Insert edilen satırların ID'lerini döndür

        // Debug: Insert sonrası log
        if (__DEV__) {
          console.log('Import batch result:', {
            attempted: islemler.length,
            inserted: insertedData?.length ?? 0,
            error: error?.message ?? null,
            errorCode: (error as any)?.code ?? null,
          });
        }

        if (error) {
          errors.push(`Batch insert hatası: ${error.message}`);
          // Batch hatasında tüm chunk'taki işlemleri skipped'a ekle
          islemIndices.forEach((idx) => {
            const tx = transactions[idx];
            skippedTransactions.push({
              transaction: tx,
              reason: `Veritabanı hatası: ${error.message}`,
              rowNumber: idx + 2,
            });
          });
          skipped += islemler.length;
        } else {
          // Gerçekten kaç satır insert edildi?
          const actualCreated = insertedData?.length ?? 0;
          created += actualCreated;

          // Insert edilen ID'leri topla (geri alma için)
          if (insertedData) {
            insertedData.forEach(row => {
              if (row.id) transactionIds.push(row.id);
            });
          }

          // Fark varsa raporla
          const notInserted = islemler.length - actualCreated;
          if (notInserted > 0) {
            errors.push(`${notInserted} işlem sessizce başarısız oldu (RLS/constraint?)`);
            skipped += notInserted;
          }

          // =====================================================
          // KRİTİK: Bakiye güncellemesi (aggregate yaklaşım)
          // İşlemler eklendi, şimdi bakiyeleri güncelle
          // Entity başına net bakiye değişimi hesaplanır, sonra tek RPC
          // =====================================================
          if (actualCreated > 0) {
            setProgress(p => ({
              ...p,
              phase: 'balances',
              message: `${translationsRef.current.balances} (${chunkIndex + 1}/${totalChunks})`,
            }));

            // 1. Tüm işlemlerin bakiye değişikliklerini aggregate et
            const aggregatedChanges = new Map<string, number>();
            const balanceUpdateItems = islemler.slice(0, Math.min(actualCreated, islemler.length));

            for (const islem of balanceUpdateItems) {
              const changes = calculateBalanceChanges(islem);
              for (const [key, delta] of changes) {
                aggregatedChanges.set(key, (aggregatedChanges.get(key) || 0) + delta);
              }
            }

            // 2. Aggregate sonuçlarını batch halinde gönder (entity başına 1 RPC)
            const entries = Array.from(aggregatedChanges.entries());
            let balanceUpdateSuccessCount = 0;
            let balanceUpdateFailCount = 0;
            const balanceErrors: string[] = [];
            const successfulUpdates: Array<{ key: string; amount: number }> = [];

            const AGGREGATE_BATCH_SIZE = 20;
            for (let i = 0; i < entries.length; i += AGGREGATE_BATCH_SIZE) {
              const batch = entries.slice(i, i + AGGREGATE_BATCH_SIZE);
              const results = await Promise.all(
                batch.map(([key, amount]) => {
                  const roundedAmount = Math.round(amount * 100) / 100;
                  const [tableName, rowId] = key.split('/');
                  return safeIncrementBalance(tableName, rowId, roundedAmount)
                    .then(() => ({ success: true as const, key, amount: roundedAmount }))
                    .catch((err) => {
                      const errMsg = err instanceof Error ? err.message : String(err);
                      return { success: false as const, key, amount: roundedAmount, error: errMsg };
                    });
                })
              );

              for (const result of results) {
                if (result.success) {
                  balanceUpdateSuccessCount++;
                  successfulUpdates.push({ key: result.key, amount: result.amount });
                } else {
                  balanceUpdateFailCount++;
                  balanceErrors.push(`${result.key}: ${result.error}`);
                }
              }
            }

            // Bakiye güncelleme hatası varsa rollback: başarılı bakiyeleri geri al + işlemleri sil
            if (balanceUpdateFailCount > 0) {
              if (__DEV__) {
                console.warn('Import: Bakiye güncelleme hataları nedeniyle chunk rollback yapılıyor', {
                  failedEntities: balanceUpdateFailCount,
                  errors: balanceErrors,
                });
              }

              // Başarılı bakiye güncellemelerini geri al
              for (const { key, amount } of successfulUpdates) {
                try {
                  const [tableName, rowId] = key.split('/');
                  await safeIncrementBalance(tableName, rowId, -amount);
                } catch (reverseErr) {
                  console.error(`CRITICAL: Bakiye rollback başarısız (${key}):`, reverseErr);
                  errors.push(`Bakiye rollback başarısız (${key}): ${reverseErr instanceof Error ? reverseErr.message : String(reverseErr)}`);
                }
              }

              const chunkTxIds = insertedData?.map(row => row.id).filter(Boolean) || [];
              if (chunkTxIds.length > 0) {
                const { error: deleteError } = await supabase
                  .from('islemler')
                  .delete()
                  .in('id', chunkTxIds);

                if (deleteError) {
                  errors.push(`Rollback hatası - işlemler silinemedi: ${deleteError.message}`);
                  errors.push('UYARI: Veritabanı tutarsız durumda olabilir. Manuel kontrol gerekli.');
                } else {
                  created -= chunkTxIds.length;
                  skipped += chunkTxIds.length;
                  chunkTxIds.forEach(fId => {
                    const idx = transactionIds.indexOf(fId);
                    if (idx !== -1) transactionIds.splice(idx, 1);
                  });
                  errors.push(`${chunkTxIds.length} işlem bakiye hatası nedeniyle geri alındı`);
                }
              }

              balanceErrors.forEach(e => errors.push(`Bakiye hatası: ${e}`));
            }

            if (__DEV__) {
              console.log('Import: Bakiyeler güncellendi (aggregate)', {
                uniqueEntities: entries.length,
                success: balanceUpdateSuccessCount,
                failed: balanceUpdateFailCount,
              });
            }
          }
        }
      }
    }

    setProgress(p => ({
      ...p,
      current: transactions.length,
      total: transactions.length,
    }));

    return { created, skipped, skippedTransactions, errors, transactionIds };
  }, [isletme]);

  /**
   * Dry run simülasyonu - veritabanına yazma, sadece ne olacağını hesapla
   */
  const simulateImport = useCallback(async (
    preview: ImportPreview,
    accountMappings: Record<string, AccountMapping>
  ): Promise<ImportResult> => {
    if (!isletme) {
      return {
        success: false,
        categoriesCreated: 0,
        accountsCreated: 0,
        clientsCreated: 0,
        personelCreated: 0,
        transactionsCreated: 0,
        transactionIds: [],
        createdCategoryIds: [],
        reactivatedCategoryIds: [],
        createdAccountIds: [],
        createdClientIds: [],
        createdPersonelIds: [],
        errors: ['İşletme bulunamadı'],
        skipped: 0,
        skippedTransactions: [],
        startingBalancesApplied: 0,
        startingBalancesUpdated: 0,
        totalRowsProcessed: 0,
      };
    }

    setProgress({
      phase: 'categories',
      current: 0,
      total: 100,
      message: translationsRef.current.simulation,
      percentage: 0,
      itemsPerSecond: 0,
      phaseDetails: { categories: 0, accounts: 0, clients: 0, personel: 0, transactions: 0 },
    });

    // 1. Mevcut verileri al (sadece kontrol için)
    const [existingCategories, existingAccounts, existingClients, existingPersonel] = await Promise.all([
      getExistingCategories(),
      getExistingAccounts(),
      getExistingClients(),
      getExistingPersonel(),
    ]);

    // 2. Yeni oluşturulacak entity'leri hesapla
    let categoriesWouldCreate = 0;
    let accountsWouldCreate = 0;
    let clientsWouldCreate = 0;
    let personelWouldCreate = 0;

    // Kategoriler
    preview.uniqueCategories.forEach(name => {
      if (!existingCategories.has(name.toLowerCase())) {
        categoriesWouldCreate++;
      }
    });

    // Hesaplar, cariler, personel
    Object.values(accountMappings).forEach(mapping => {
      if (mapping.type === 'hesap' && !existingAccounts.has(mapping.name.toLowerCase())) {
        accountsWouldCreate++;
      }
      if (mapping.type === 'cari' && !existingClients.has(mapping.name.toLowerCase())) {
        clientsWouldCreate++;
      }
      if (mapping.type === 'personel' && !existingPersonel.has(mapping.name.toLowerCase())) {
        personelWouldCreate++;
      }
    });

    // 3. İşlem sayısını hesapla
    // Başlangıç bakiyesi işlemlerini normal işlemlerden ayır
    const startingBalanceTransactions = preview.transactions.filter(tx => tx.mappedType === 'baslangic_bakiyesi');
    // Geçerli işlemler: tarih VE tutar geçerli ve başlangıç bakiyesi değil
    const validTransactions = preview.transactions.filter(tx =>
      tx.dateValid && tx.amountValid && tx.mappedType !== 'baslangic_bakiyesi'
    );
    // Geçersiz tarihli işlemler
    const invalidDateTransactions = preview.transactions.filter(tx =>
      !tx.dateValid && tx.mappedType !== 'baslangic_bakiyesi'
    );
    // Geçersiz tutarlı işlemler (tarih geçerli ama tutar geçersiz)
    const invalidAmountTransactions = preview.transactions.filter(tx =>
      tx.dateValid && !tx.amountValid && tx.mappedType !== 'baslangic_bakiyesi'
    );

    // 4. Duplicate kontrolü
    const duplicateMap = await runDuplicateCheck(preview.transactions);

    setProgress({
      phase: 'done',
      current: 100,
      total: 100,
      message: translationsRef.current.done,
      percentage: 100,
      itemsPerSecond: 0,
      phaseDetails: {
        categories: categoriesWouldCreate,
        accounts: accountsWouldCreate,
        clients: clientsWouldCreate,
        personel: personelWouldCreate,
        transactions: validTransactions.length - duplicateMap.size,
      },
    });

    // Skipped transactions listesini oluştur
    const skippedList: SkippedTransaction[] = [
      ...invalidDateTransactions.map(tx => ({
        transaction: tx,
        reason: tx.dateError || 'Geçersiz tarih',
        rowNumber: tx.rowNumber || 0,
      })),
      ...invalidAmountTransactions.map(tx => ({
        transaction: tx,
        reason: tx.amountError || 'Geçersiz tutar',
        rowNumber: tx.rowNumber || 0,
      })),
      // Başlangıç bakiyesi işlemlerini atlanan listesine EKLEMİYORUZ
      // çünkü bunlar entity'lere otomatik olarak uygulanacak
    ];

    const totalSkipped = invalidDateTransactions.length + invalidAmountTransactions.length +
                         duplicateMap.size; // startingBalanceTransactions dahil değil

    const simulationResult: ImportResult = {
      success: true,
      categoriesCreated: categoriesWouldCreate,
      accountsCreated: accountsWouldCreate,
      clientsCreated: clientsWouldCreate,
      personelCreated: personelWouldCreate,
      transactionsCreated: validTransactions.length - duplicateMap.size,
      transactionIds: [], // Dry run'da ID yok
      createdCategoryIds: [], // Dry run'da ID yok
      reactivatedCategoryIds: [], // Dry run'da ID yok
      createdAccountIds: [],
      createdClientIds: [],
      createdPersonelIds: [],
      errors: [],
      skipped: totalSkipped,
      skippedTransactions: skippedList,
      // Başlangıç bakiyesi ve toplam satır sayısı
      startingBalancesApplied: startingBalanceTransactions.length,
      startingBalancesUpdated: 0,
      totalRowsProcessed: validTransactions.length + startingBalanceTransactions.length + totalSkipped,
    };

    setResult(simulationResult);
    return simulationResult;
  }, [isletme, getExistingCategories, getExistingAccounts, getExistingClients, getExistingPersonel, runDuplicateCheck]);

  /**
   * Ana import fonksiyonu
   * @param options.dryRun - true ise simülasyon modu (veritabanına yazma)
   * @param options.skipDuplicates - true ise duplicate işlemleri atla
   */
  const runImport = useCallback(async (
    preview: ImportPreview,
    accountMappings: Record<string, AccountMapping>,
    options: ImportOptions = {}
  ): Promise<ImportResult> => {
    // Çevirileri güncelle (verilmişse)
    if (options.translations) {
      translationsRef.current = options.translations;
    }

    // Dry run modunda simülasyon yap
    if (options.dryRun) {
      return simulateImport(preview, accountMappings);
    }

    if (!isletme) {
      const errorResult: ImportResult = {
        success: false,
        categoriesCreated: 0,
        accountsCreated: 0,
        clientsCreated: 0,
        personelCreated: 0,
        transactionsCreated: 0,
        transactionIds: [],
        createdCategoryIds: [],
        reactivatedCategoryIds: [],
        createdAccountIds: [],
        createdClientIds: [],
        createdPersonelIds: [],
        errors: ['İşletme bulunamadı'],
        skipped: 0,
        skippedTransactions: [],
        startingBalancesApplied: 0,
        startingBalancesUpdated: 0,
        totalRowsProcessed: 0,
      };
      setResult(errorResult);
      return errorResult;
    }

    try {
      setProgress({
        phase: 'categories',
        current: 0,
        total: 100,
        message: translationsRef.current.starting || translationsRef.current.categories,
        percentage: 0,
        itemsPerSecond: 0,
        phaseDetails: { categories: 0, accounts: 0, clients: 0, personel: 0, transactions: 0 },
      });

      // 0. Başlangıç bakiyelerini topla (baslangic_bakiyesi işlemlerinden)
      // Bu bakiyeler entity oluşturulurken kullanılacak
      const startingBalances = {
        hesaplar: new Map<string, number>(), // hesap adı (lowercase) -> bakiye
        cariler: new Map<string, number>(),  // cari adı (lowercase) -> bakiye
        personel: new Map<string, number>(), // personel adı (lowercase) -> bakiye
      };

      preview.transactions.forEach(tx => {
        if (tx.mappedType === 'baslangic_bakiyesi') {
          // signedAmount kullan: Excel'deki orijinal işaretli değer
          // Pozitif = bize borçlu, Negatif = biz borçluyuz
          const balanceValue = tx.signedAmount;

          // Hesap başlangıç bakiyesi
          if (tx.account) {
            startingBalances.hesaplar.set(tx.account.toLowerCase(), balanceValue);
          }
          // Cari başlangıç bakiyesi (tedarikçi veya müşteri)
          if (tx.tedarikci) {
            // Tedarikçi: Pozitif = tedarikçi bize borçlu, Negatif = biz tedarikçiye borçluyuz
            startingBalances.cariler.set(tx.tedarikci.toLowerCase(), balanceValue);
          }
          if (tx.musteri) {
            // Müşteri: Pozitif = müşteri bize borçlu, Negatif = biz müşteriye borçluyuz
            startingBalances.cariler.set(tx.musteri.toLowerCase(), balanceValue);
          }
          // Personel başlangıç bakiyesi
          if (tx.personel) {
            // Personel: Pozitif = biz personele borçluyuz, Negatif = personel bize borçlu
            startingBalances.personel.set(tx.personel.toLowerCase(), balanceValue);
          }
        }
      });

      if (__DEV__) {
        console.log('Starting balances extracted:', {
          hesaplar: [...startingBalances.hesaplar.entries()],
          cariler: [...startingBalances.cariler.entries()],
          personel: [...startingBalances.personel.entries()],
        });
      }

      // 1. Mevcut verileri al
      const [existingCategories, existingAccounts, existingClients, existingPersonel] = await Promise.all([
        getExistingCategories(),
        getExistingAccounts(),
        getExistingClients(),
        getExistingPersonel(),
      ]);

      // 2. Kategorileri import et
      const categoryResult = await importCategories(preview.uniqueCategories, existingCategories, preview.transactions, options.categoryMappings);
      const categoriesCreated = categoryResult.createdIds.length;

      // 3. Hesapları import et (başlangıç bakiyesi varsa kullan, yoksa 0)
      const accountResult = await importAccounts(accountMappings, existingAccounts, startingBalances.hesaplar);
      const accountsCreated = accountResult.createdIds.length;

      // 4. Carileri import et (başlangıç bakiyesi varsa kullan, yoksa 0)
      const clientResult = await importClients(accountMappings, existingClients, startingBalances.cariler);
      const clientsCreated = clientResult.createdIds.length;

      // 5. Personelleri import et (başlangıç bakiyesi varsa kullan, yoksa 0)
      const personelResult = await importPersonel(accountMappings, existingPersonel, startingBalances.personel);
      const personelCreated = personelResult.createdIds.length;

      // 5.5. Mevcut entity'lere başlangıç bakiyesi uygula
      // Yeni oluşturulan entity'ler zaten importAccounts/Clients/Personel'da halledildi
      // Burada sadece MEVCUT entity'ler için başlangıç bakiyesi uygulanır
      const balanceSkippedTransactions: SkippedTransaction[] = [];
      let startingBalancesUpdatedCount = 0;

      for (const tx of preview.transactions) {
        if (tx.mappedType !== 'baslangic_bakiyesi') continue;
        const rowNumber = tx.rowNumber || 0;
        const balanceValue = tx.signedAmount;

        // Hesaplar için başlangıç bakiyesi kontrolü
        if (tx.account) {
          const key = tx.account.toLowerCase();
          const existingId = existingAccounts.get(key);
          const isNewlyCreated = existingId ? accountResult.createdIds.includes(existingId) : false;

          if (existingId && !isNewlyCreated) {
            // Mevcut hesabın balance ve initial_balance bilgisini çek
            const { data: hesapData } = await supabase
              .from('hesaplar')
              .select('id, balance, initial_balance')
              .eq('id', existingId)
              .single();

            if (hesapData) {
              if (hesapData.initial_balance && hesapData.initial_balance !== 0) {
                // Zaten başlangıç bakiyesi var → atlanan listesine ekle
                balanceSkippedTransactions.push({
                  transaction: tx,
                  reason: `Bu hesap için daha önce başlangıç bakiyesi işlenmiş (mevcut: ${hesapData.initial_balance})`,
                  rowNumber,
                });
              } else {
                // Başlangıç bakiyesi yok → uygula
                await supabase
                  .from('hesaplar')
                  .update({
                    balance: (hesapData.balance || 0) + balanceValue,
                    initial_balance: balanceValue,
                  })
                  .eq('id', existingId);
                startingBalancesUpdatedCount++;
              }
            }
          }
        }

        // Cariler için başlangıç bakiyesi kontrolü (tedarikçi veya müşteri)
        const cariName = tx.tedarikci || tx.musteri;
        if (cariName) {
          const key = cariName.toLowerCase();
          const existingId = existingClients.get(key);
          const isNewlyCreated = existingId ? clientResult.createdIds.includes(existingId) : false;

          if (existingId && !isNewlyCreated) {
            // Mevcut carinin balance bilgisini ve işlem etkilerini çek
            const [{ data: cariData }, { data: cariTransactions }] = await Promise.all([
              supabase.from('cariler').select('id, balance').eq('id', existingId).single(),
              supabase.from('islemler').select('type, amount').eq('cari_id', existingId),
            ]);

            if (cariData) {
              // Gerçek başlangıç bakiyesini hesapla: currentBalance - transactionEffects
              let cariTxEffect = 0;
              cariTransactions?.forEach(t => {
                const amt = Number(t.amount) || 0;
                if (t.type === 'cari_alis') cariTxEffect -= amt;
                else if (t.type === 'cari_odeme') cariTxEffect += amt;
                else if (t.type === 'cari_satis') cariTxEffect += amt;
                else if (t.type === 'cari_tahsilat') cariTxEffect -= amt;
                else if (t.type === 'cari_alis_iade') cariTxEffect += amt;
                else if (t.type === 'cari_satis_iade') cariTxEffect -= amt;
              });
              const cariInitialBalance = (cariData.balance || 0) - cariTxEffect;

              if (cariInitialBalance !== 0) {
                // Zaten başlangıç bakiyesi var
                balanceSkippedTransactions.push({
                  transaction: tx,
                  reason: `Bu cari için daha önce başlangıç bakiyesi işlenmiş (mevcut başlangıç bakiyesi: ${cariInitialBalance})`,
                  rowNumber,
                });
              } else {
                // Başlangıç bakiyesi yok → uygula (mevcut işlem etkilerini koru)
                await supabase
                  .from('cariler')
                  .update({ balance: balanceValue + cariTxEffect })
                  .eq('id', existingId);
                startingBalancesUpdatedCount++;
              }
            }
          }
        }

        // Personel için başlangıç bakiyesi kontrolü
        if (tx.personel) {
          const key = tx.personel.toLowerCase();
          const existingId = existingPersonel.get(key);
          const isNewlyCreated = existingId ? personelResult.createdIds.includes(existingId) : false;

          if (existingId && !isNewlyCreated) {
            // Mevcut personelin balance bilgisini ve işlem etkilerini çek
            const [{ data: personelData }, { data: personelTransactions }] = await Promise.all([
              supabase.from('personel').select('id, balance').eq('id', existingId).single(),
              supabase.from('islemler').select('type, amount').eq('personel_id', existingId),
            ]);

            if (personelData) {
              // Gerçek başlangıç bakiyesini hesapla
              let personelTxEffect = 0;
              personelTransactions?.forEach(t => {
                const amt = Number(t.amount) || 0;
                if (t.type === 'personel_gider') personelTxEffect -= amt;
                else if (t.type === 'personel_odeme') personelTxEffect += amt;
                else if (t.type === 'personel_tahsilat') personelTxEffect -= amt;
              });
              const personelInitialBalance = (personelData.balance || 0) - personelTxEffect;

              if (personelInitialBalance !== 0) {
                // Zaten başlangıç bakiyesi var
                balanceSkippedTransactions.push({
                  transaction: tx,
                  reason: `Bu personel için daha önce başlangıç bakiyesi işlenmiş (mevcut başlangıç bakiyesi: ${personelInitialBalance})`,
                  rowNumber,
                });
              } else {
                // Başlangıç bakiyesi yok → uygula (mevcut işlem etkilerini koru)
                await supabase
                  .from('personel')
                  .update({ balance: balanceValue + personelTxEffect })
                  .eq('id', existingId);
                startingBalancesUpdatedCount++;
              }
            }
          }
        }
      }

      if (__DEV__) {
        console.log('Starting balances for existing entities:', {
          updated: startingBalancesUpdatedCount,
          skipped: balanceSkippedTransactions.length,
        });
      }

      // 6. İşlemleri import et
      const idMaps: EntityIdMap = {
        categories: categoryResult.map,
        accounts: accountResult.map,
        clients: clientResult.map,
        personel: personelResult.map,
      };

      const txResult = await importTransactions(
        preview.transactions,
        accountMappings,
        idMaps,
        options.skipDuplicates || false,
        duplicates
      );

      // 7. Cache'i invalidate et ve refetch yap
      setProgress(p => ({
        ...p,
        phase: 'done',
        current: 100,
        total: 100,
        message: translationsRef.current.done,
        percentage: 100,
        phaseDetails: {
          categories: categoriesCreated,
          accounts: accountsCreated,
          clients: clientsCreated,
          personel: personelCreated,
          transactions: txResult.created,
        },
      }));

      // OPTIMIZED: Sadece kritik query'leri invalidate et (cascade invalidation KALDIRILDI)
      // Eski kod 50+ query invalidate ediyordu, şimdi sadece 5 query
      queryClient.invalidateQueries({ queryKey: ['hesaplar'] });
      queryClient.invalidateQueries({ queryKey: ['cariler'] });
      queryClient.invalidateQueries({ queryKey: ['personel'] });
      queryClient.invalidateQueries({ queryKey: ['kategoriler'] });
      queryClient.invalidateQueries({ queryKey: ['islemler'] });

      // OPTIMIZED: Kademeli refetch - önce entity'ler (hızlı), sonra işlemler (arka planda)
      try {
        // Önce kritik entity'leri refetch et (küçük veri, hızlı)
        await Promise.all([
          queryClient.refetchQueries({ queryKey: ['hesaplar'] }),
          queryClient.refetchQueries({ queryKey: ['cariler'] }),
          queryClient.refetchQueries({ queryKey: ['personel'] }),
        ]);

        // İşlemler ve dashboard arka planda (büyük veri, kullanıcıyı bekletme)
        // await YOK - kullanıcı UI'da devam edebilir
        queryClient.refetchQueries({ queryKey: ['islemler'] });
        queryClient.refetchQueries({ queryKey: ['month-summary'] });
        queryClient.refetchQueries({ queryKey: ['dashboard'] });
      } catch (refetchErr) {
        if (__DEV__) {
          console.error('Refetch hatası:', refetchErr);
        }
      }

      // Başlangıç bakiyesi işlemlerini say
      const startingBalanceCount = preview.transactions.filter(tx => tx.mappedType === 'baslangic_bakiyesi').length;
      const totalSkippedWithBalances = txResult.skipped + balanceSkippedTransactions.length;
      const allSkippedTransactions = [...txResult.skippedTransactions, ...balanceSkippedTransactions];
      const totalRowsProcessed = txResult.created + startingBalanceCount + totalSkippedWithBalances;

      const finalResult: ImportResult = {
        success: true,
        categoriesCreated,
        accountsCreated,
        clientsCreated,
        personelCreated,
        transactionsCreated: txResult.created,
        transactionIds: txResult.transactionIds,
        createdCategoryIds: categoryResult.createdIds,
        reactivatedCategoryIds: categoryResult.reactivatedIds,
        createdAccountIds: accountResult.createdIds,
        createdClientIds: clientResult.createdIds,
        createdPersonelIds: personelResult.createdIds,
        errors: txResult.errors,
        skipped: totalSkippedWithBalances,
        skippedTransactions: allSkippedTransactions,
        startingBalancesApplied: startingBalanceCount,
        startingBalancesUpdated: startingBalancesUpdatedCount,
        totalRowsProcessed,
      };

      if (__DEV__) {
        console.log('Import completed with created IDs:', {
          categories: categoryResult.createdIds.length,
          accounts: accountResult.createdIds.length,
          clients: clientResult.createdIds.length,
          personel: personelResult.createdIds.length,
          transactions: txResult.transactionIds.length,
        });
      }

      setResult(finalResult);
      return finalResult;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Bilinmeyen hata';
      setProgress(p => ({
        ...p,
        phase: 'error',
        current: 0,
        total: 0,
        message: errorMessage,
        percentage: 0,
        itemsPerSecond: 0,
      }));

      const errorResult: ImportResult = {
        success: false,
        categoriesCreated: 0,
        accountsCreated: 0,
        clientsCreated: 0,
        personelCreated: 0,
        transactionsCreated: 0,
        transactionIds: [],
        createdCategoryIds: [],
        reactivatedCategoryIds: [],
        createdAccountIds: [],
        createdClientIds: [],
        createdPersonelIds: [],
        errors: [errorMessage],
        skipped: 0,
        skippedTransactions: [],
        startingBalancesApplied: 0,
        startingBalancesUpdated: 0,
        totalRowsProcessed: 0,
      };

      setResult(errorResult);
      return errorResult;
    }
  }, [
    isletme,
    queryClient,
    duplicates,
    getExistingCategories,
    getExistingAccounts,
    getExistingClients,
    getExistingPersonel,
    importCategories,
    importAccounts,
    importClients,
    importPersonel,
    importTransactions,
    simulateImport,
  ]);

  const reset = useCallback(() => {
    setProgress({
      phase: 'idle',
      current: 0,
      total: 0,
      message: '',
      percentage: 0,
      itemsPerSecond: 0,
      phaseDetails: { categories: 0, accounts: 0, clients: 0, personel: 0, transactions: 0 },
    });
    setResult(null);
    setDuplicates(new Map());
  }, []);

  return {
    progress,
    result,
    duplicates,
    runImport,
    runDuplicateCheck,
    reset,
  };
}
