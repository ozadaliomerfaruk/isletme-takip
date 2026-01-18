/**
 * Data Import Hook
 * Excel'den parse edilen verileri Supabase'e batch olarak insert eder
 */

import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateRelatedQueries } from '@/lib/queryKeys';
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
 * Atomik bakiye güncelleme RPC çağrısı
 */
async function safeIncrementBalance(tableName: string, rowId: string, amount: number) {
  const { error } = await supabase.rpc('increment_balance', {
    table_name: tableName,
    row_id: rowId,
    amount: amount,
  });
  if (error) {
    if (__DEV__) {
      console.error('safeIncrementBalance hatası:', { tableName, rowId, amount, error });
    }
    throw error;
  }
}

/**
 * Import edilen bir işlem için bakiye güncelleme
 * Normal işlem oluşturma ile aynı mantığı kullanır
 */
async function updateBalanceForImportedTransaction(islem: IslemInsert): Promise<void> {
  const amount = islem.amount;

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

    case 'transfer':
      // Transfer: Kaynak hesaptan düş, hedef hesaba ekle
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, -amount);
      }
      if (islem.hedef_hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hedef_hesap_id, amount);
      }
      break;

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

    case 'cari_odeme':
      // Cari ödeme: Cariye ödeme yaptık
      // Hesaptan para çıkıyor, cari bakiyesi artıyor (borcumuz azalıyor)
      if (islem.cari_id) {
        await safeIncrementBalance('cariler', islem.cari_id, amount);
      }
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, -amount);
      }
      break;

    case 'cari_tahsilat':
      // Cari tahsilat: Cariden tahsilat aldık
      // Hesaba para giriyor, cari bakiyesi azalıyor (alacağımız azalıyor)
      if (islem.cari_id) {
        await safeIncrementBalance('cariler', islem.cari_id, -amount);
      }
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, amount);
      }
      break;

    case 'personel_gider':
      // Personel gideri: Personele borç yazıldı (maaş, avans vb.)
      if (islem.personel_id) {
        await safeIncrementBalance('personel', islem.personel_id, -amount);
      }
      break;

    case 'personel_odeme':
      // Personel ödemesi: Personele ödeme yapıldı
      // Hesaptan para çıkıyor, personel bakiyesi artıyor (borcumuz azalıyor)
      if (islem.personel_id) {
        await safeIncrementBalance('personel', islem.personel_id, amount);
      }
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, -amount);
      }
      break;

    case 'personel_tahsilat':
      // Personelden tahsilat: Personelden para aldık
      // Hesaba para giriyor, personel bakiyesi azalıyor
      if (islem.personel_id) {
        await safeIncrementBalance('personel', islem.personel_id, -amount);
      }
      if (islem.hesap_id) {
        await safeIncrementBalance('hesaplar', islem.hesap_id, amount);
      }
      break;

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
  const uniqueDates = [...new Set(validTransactions.map(tx => tx.date.split('T')[0]))].sort();

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
   * Başlangıç bakiyesi 0 olarak ayarlanır, kullanıcı manuel değiştirebilir
   * @returns { map, createdIds } - map: tüm hesapların ID'leri, createdIds: yeni oluşturulanların ID'leri
   */
  const importAccounts = useCallback(async (
    accountMappings: Record<string, AccountMapping>,
    existingMap: Map<string, string>
  ): Promise<{ map: Map<string, string>; createdIds: string[] }> => {
    if (!isletme) return { map: existingMap, createdIds: [] };

    const resultMap = new Map(existingMap);
    const newAccounts: HesapInsert[] = [];

    Object.values(accountMappings).forEach(mapping => {
      if (mapping.type === 'hesap' && !resultMap.has(mapping.name.toLowerCase())) {
        newAccounts.push({
          isletme_id: isletme.id,
          name: mapping.name,
          type: (mapping.hesapType || 'banka') as HesapType,
          currency: (mapping.currency || 'TRY') as 'TRY' | 'USD' | 'EUR' | 'GBP' | 'XAU' | 'XAG', // Import'tan tespit edilen para birimi
          balance: 0, // Başlangıç bakiyesi 0, kullanıcı manuel değiştirebilir
        });
      }
    });

    if (newAccounts.length === 0) return { map: resultMap, createdIds: [] };

    setProgress(p => ({
      ...p,
      phase: 'accounts',
      message: translationsRef.current.accounts,
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
   * Başlangıç bakiyesi 0 olarak ayarlanır, kullanıcı manuel değiştirebilir
   * @returns { map, createdIds } - map: tüm carilerin ID'leri, createdIds: yeni oluşturulanların ID'leri
   */
  const importClients = useCallback(async (
    accountMappings: Record<string, AccountMapping>,
    existingMap: Map<string, string>
  ): Promise<{ map: Map<string, string>; createdIds: string[] }> => {
    if (!isletme) return { map: existingMap, createdIds: [] };

    const resultMap = new Map(existingMap);
    const newClients: CariInsert[] = [];

    Object.values(accountMappings).forEach(mapping => {
      if (mapping.type === 'cari' && !resultMap.has(mapping.name.toLowerCase())) {
        newClients.push({
          isletme_id: isletme.id,
          name: mapping.name,
          type: (mapping.cariType || 'tedarikci') as CariType,
          balance: 0, // Başlangıç bakiyesi 0, kullanıcı manuel değiştirebilir
        });
      }
    });

    if (newClients.length === 0) return { map: resultMap, createdIds: [] };

    setProgress(p => ({
      ...p,
      phase: 'clients',
      message: translationsRef.current.clients,
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
   * Başlangıç bakiyesi 0 olarak ayarlanır, kullanıcı manuel değiştirebilir
   * @returns { map, createdIds } - map: tüm personelin ID'leri, createdIds: yeni oluşturulanların ID'leri
   */
  const importPersonel = useCallback(async (
    accountMappings: Record<string, AccountMapping>,
    existingMap: Map<string, string>
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
      });
    }

    Object.values(accountMappings).forEach(mapping => {
      if (mapping.type === 'personel' && !resultMap.has(mapping.name.toLowerCase())) {
        // İsmi first_name ve last_name olarak ayır
        const nameParts = mapping.name.trim().split(/\s+/);
        const firstName = nameParts[0] || mapping.name;
        const lastName = nameParts.slice(1).join(' ') || null;

        if (__DEV__) {
          console.log('Creating personel:', {
            originalName: mapping.name,
            firstName,
            lastName,
            mapKey: mapping.name.toLowerCase(),
          });
        }

        newPersonel.push({
          isletme_id: isletme.id,
          first_name: firstName,
          last_name: lastName,
          balance: 0, // Başlangıç bakiyesi 0, kullanıcı manuel değiştirebilir
        });
      }
    });

    if (newPersonel.length === 0) return { map: resultMap, createdIds: [] };

    setProgress(p => ({
      ...p,
      phase: 'personel',
      message: translationsRef.current.personel,
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

      setProgress({
        phase: 'transactions',
        current: currentProgress,
        total: transactions.length,
        message: `${translationsRef.current.transactions} (${chunkIndex + 1}/${totalChunks})${etaText}`,
        estimatedTimeRemaining,
        startTime,
      });

      for (const tx of chunk) {
        // Satır numarasını transaction'dan al (varsa) veya hesapla
        const rowNumber = tx.rowNumber || (globalIndex + 2);
        globalIndex++;

        try {
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
          const hesapId = tx.account
            ? idMaps.accounts.get(tx.account.toLowerCase()) || null
            : null;

          // Hesap bulunamadıysa atla (cari_alis ve cari_satis HARİÇ)
          const isCariAlisOrSatis = tx.mappedType === 'cari_alis' || tx.mappedType === 'cari_satis';
          if (!hesapId && !isCariAlisOrSatis) {
            skipped++;
            skippedTransactions.push({
              transaction: tx,
              reason: `Hesap bulunamadı: "${tx.account}"`,
              rowNumber,
            });
            continue;
          }
          // cari_alis/cari_satis için hesap belirtilmişse ama bulunamadıysa uyar (atlamadan devam et)
          if (!hesapId && tx.account && isCariAlisOrSatis) {
            if (__DEV__) {
              console.log(`[UYARI] cari_alis/cari_satis için hesap bulunamadı: "${tx.account}", hesap_id null olarak devam ediliyor`);
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

          // Cari işlemleri için cari kontrolü (tüm cari işlem tipleri için)
          if (tx.mappedType === 'cari_odeme' || tx.mappedType === 'cari_tahsilat' ||
              tx.mappedType === 'cari_alis' || tx.mappedType === 'cari_satis') {
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

          const islem: IslemInsert = {
            isletme_id: isletme.id,
            type: islemType,
            amount: tx.amount,
            date: tx.date,
            description: tx.description,
            hesap_id: hesapId,
            hedef_hesap_id: hedefHesapId,
            cari_id: cariId,
            personel_id: personelId,
            kategori_id: kategoriId,
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
          // KRİTİK: Bakiye güncellemesi (rollback destekli)
          // İşlemler eklendi, şimdi bakiyeleri güncelle
          // =====================================================
          if (actualCreated > 0) {
            setProgress(p => ({
              ...p,
              phase: 'balances',
              message: `${translationsRef.current.balances} (${chunkIndex + 1}/${totalChunks})`,
            }));

            // Her başarılı işlem için bakiye güncelle, hataları takip et
            let balanceUpdateSuccessCount = 0;
            let balanceUpdateFailCount = 0;
            const failedTransactionIds: string[] = [];

            for (let i = 0; i < Math.min(actualCreated, islemler.length); i++) {
              const islem = islemler[i];
              const txId = insertedData?.[i]?.id;
              try {
                await updateBalanceForImportedTransaction(islem);
                balanceUpdateSuccessCount++;
              } catch (balanceErr) {
                balanceUpdateFailCount++;
                if (txId) failedTransactionIds.push(txId);

                if (__DEV__) {
                  console.error('Bakiye güncelleme hatası:', {
                    islem,
                    txId,
                    error: balanceErr,
                  });
                }
                errors.push(`Bakiye güncelleme hatası (işlem tipi: ${islem.type}): ${balanceErr}`);
              }
            }

            // Bakiye güncelleme başarısız olan işlemleri geri al (rollback)
            if (failedTransactionIds.length > 0) {
              if (__DEV__) {
                console.warn('Import: Bakiye güncelleme hataları nedeniyle rollback yapılıyor', {
                  failedCount: failedTransactionIds.length,
                  failedIds: failedTransactionIds,
                });
              }

              // Başarısız olan işlemleri sil
              const { error: deleteError } = await supabase
                .from('islemler')
                .delete()
                .in('id', failedTransactionIds);

              if (deleteError) {
                errors.push(`Rollback hatası - işlemler silinemedi: ${deleteError.message}`);
                // Kritik: İşlemler silinmedi, bakiyeler yanlış olabilir!
                errors.push('UYARI: Veritabanı tutarsız durumda olabilir. Manuel kontrol gerekli.');
              } else {
                // Başarıyla silinen işlemleri created sayısından düş
                created -= failedTransactionIds.length;
                skipped += failedTransactionIds.length;
                // transactionIds listesinden sil
                failedTransactionIds.forEach(fId => {
                  const idx = transactionIds.indexOf(fId);
                  if (idx !== -1) transactionIds.splice(idx, 1);
                });

                errors.push(`${failedTransactionIds.length} işlem bakiye hatası nedeniyle geri alındı`);
              }
            }

            if (__DEV__) {
              console.log('Import: Bakiyeler güncellendi', {
                success: balanceUpdateSuccessCount,
                failed: balanceUpdateFailCount,
                rolledBack: failedTransactionIds.length,
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
      };
    }

    setProgress({ phase: 'categories', current: 0, total: 100, message: translationsRef.current.simulation });

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
    const validTransactions = preview.transactions.filter(tx => tx.dateValid);
    const invalidTransactions = preview.transactions.filter(tx => !tx.dateValid);

    // 4. Duplicate kontrolü
    const duplicateMap = await runDuplicateCheck(preview.transactions);

    setProgress({ phase: 'done', current: 100, total: 100, message: translationsRef.current.done });

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
      skipped: invalidTransactions.length + duplicateMap.size,
      skippedTransactions: invalidTransactions.map(tx => ({
        transaction: tx,
        reason: tx.dateError || 'Geçersiz tarih',
        rowNumber: tx.rowNumber,
      })),
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
      };
      setResult(errorResult);
      return errorResult;
    }

    try {
      setProgress({ phase: 'categories', current: 0, total: 100, message: translationsRef.current.starting || translationsRef.current.categories });

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

      // 3. Hesapları import et (bakiye 0, kullanıcı manuel değiştirebilir)
      const accountResult = await importAccounts(accountMappings, existingAccounts);
      const accountsCreated = accountResult.createdIds.length;

      // 4. Carileri import et (bakiye 0, kullanıcı manuel değiştirebilir)
      const clientResult = await importClients(accountMappings, existingClients);
      const clientsCreated = clientResult.createdIds.length;

      // 5. Personelleri import et (bakiye 0, kullanıcı manuel değiştirebilir)
      const personelResult = await importPersonel(accountMappings, existingPersonel);
      const personelCreated = personelResult.createdIds.length;

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
      setProgress({ phase: 'done', current: 100, total: 100, message: translationsRef.current.done });

      invalidateRelatedQueries(queryClient, 'islem');
      invalidateRelatedQueries(queryClient, 'hesap');
      invalidateRelatedQueries(queryClient, 'cari');
      invalidateRelatedQueries(queryClient, 'kategori');
      invalidateRelatedQueries(queryClient, 'personel');

      // Refetch kritik query'leri
      try {
        await Promise.all([
          queryClient.refetchQueries({ queryKey: ['islemler'] }),
          queryClient.refetchQueries({ queryKey: ['month-summary'] }),
          queryClient.refetchQueries({ queryKey: ['hesaplar'] }),
          queryClient.refetchQueries({ queryKey: ['cariler'] }),
          queryClient.refetchQueries({ queryKey: ['personel'] }),
          queryClient.refetchQueries({ queryKey: ['dashboard'] }),
        ]);
      } catch (refetchErr) {
        if (__DEV__) {
          console.error('Refetch hatası:', refetchErr);
        }
      }

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
        skipped: txResult.skipped,
        skippedTransactions: txResult.skippedTransactions,
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
      setProgress({ phase: 'error', current: 0, total: 0, message: errorMessage });

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
    setProgress({ phase: 'idle', current: 0, total: 0, message: '' });
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
