/**
 * Import Entity Helpers
 * Kategoriler, hesaplar, cariler ve personel import fonksiyonları
 */

import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  AccountMapping,
  ParsedTransaction,
  chunkArray,
} from '@/lib/excelImport';
import {
  KategoriInsert,
  HesapInsert,
  CariInsert,
  PersonelInsert,
  HesapType,
  CariType,
} from '@/types/database';
import { ProgressTranslations } from './useDataImport.types';

type SetProgressFn = (updater: (p: any) => any) => void;

/**
 * Mevcut entity'leri Supabase'den çeken hook'lar
 */
export function useExistingEntities() {
  const { isletme } = useAuthContext();

  const getExistingCategories = useCallback(async (): Promise<Map<string, string>> => {
    if (!isletme) return new Map();
    const { data } = await supabase
      .from('kategoriler')
      .select('id, name, is_active')
      .eq('isletme_id', isletme.id);

    const map = new Map<string, string>();
    data?.forEach(k => {
      if (k.is_active) map.set(k.name.toLowerCase(), k.id);
    });
    return map;
  }, [isletme]);

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

  return { getExistingCategories, getExistingAccounts, getExistingClients, getExistingPersonel };
}

/**
 * Kategorileri import et
 */
export function useImportCategories() {
  const { isletme } = useAuthContext();

  return useCallback(async (
    categories: string[],
    existingMap: Map<string, string>,
    transactions: ParsedTransaction[],
    setProgress: SetProgressFn,
    translationsRef: React.MutableRefObject<ProgressTranslations>,
    userCategoryMappings?: Record<string, 'gelir' | 'gider'>
  ): Promise<{ map: Map<string, string>; createdIds: string[]; reactivatedIds: string[] }> => {
    if (!isletme) return { map: existingMap, createdIds: [], reactivatedIds: [] };

    const resultMap = new Map(existingMap);
    const newCategories: KategoriInsert[] = [];
    const categoriesToReactivate: string[] = [];

    const { data: allCategories } = await supabase
      .from('kategoriler')
      .select('id, name, is_active')
      .eq('isletme_id', isletme.id);

    const allCategoriesMap = new Map<string, { id: string; is_active: boolean }>();
    allCategories?.forEach(k => {
      allCategoriesMap.set(k.name.toLowerCase(), { id: k.id, is_active: k.is_active });
    });

    const categoryTypeMap = new Map<string, 'gelir' | 'gider'>();
    if (userCategoryMappings && Object.keys(userCategoryMappings).length > 0) {
      Object.entries(userCategoryMappings).forEach(([name, type]) => {
        categoryTypeMap.set(name.toLowerCase(), type);
      });
    } else {
      transactions.forEach(tx => {
        if (tx.category) {
          const catLower = tx.category.toLowerCase();
          if (tx.mappedType === 'gelir' || tx.mappedType === 'cari_satis') {
            categoryTypeMap.set(catLower, 'gelir');
          } else if (!categoryTypeMap.has(catLower)) {
            categoryTypeMap.set(catLower, 'gider');
          }
        }
      });
    }

    categories.forEach(name => {
      const lowerName = name.toLowerCase();
      const existingActive = resultMap.has(lowerName);
      const existingInDB = allCategoriesMap.get(lowerName);

      if (existingActive) return;

      if (existingInDB && !existingInDB.is_active) {
        categoriesToReactivate.push(existingInDB.id);
        resultMap.set(lowerName, existingInDB.id);
      } else if (!existingInDB) {
        const categoryType = categoryTypeMap.get(lowerName) || 'gider';
        newCategories.push({
          isletme_id: isletme.id,
          name,
          type: categoryType,
          is_active: true,
        });
      }
    });

    if (categoriesToReactivate.length > 0) {
      await supabase
        .from('kategoriler')
        .update({ is_active: true })
        .in('id', categoriesToReactivate);
    }

    if (newCategories.length === 0) {
      return { map: resultMap, createdIds: [], reactivatedIds: categoriesToReactivate };
    }

    setProgress((p: any) => ({
      ...p,
      phase: 'categories',
      message: translationsRef.current.categories,
      phaseDetails: { ...p.phaseDetails, categories: newCategories.length },
    }));

    const createdIds: string[] = [];
    const chunks = chunkArray(newCategories, 100);
    for (const chunk of chunks) {
      const { data, error } = await supabase
        .from('kategoriler')
        .insert(chunk)
        .select('id, name');

      if (error) throw new Error(`Kategori hatası: ${error.message}`);
      data?.forEach(k => {
        resultMap.set(k.name.toLowerCase(), k.id);
        createdIds.push(k.id);
      });
    }

    return { map: resultMap, createdIds, reactivatedIds: categoriesToReactivate };
  }, [isletme]);
}

/**
 * Hesapları import et
 */
export function useImportAccounts() {
  const { isletme } = useAuthContext();

  return useCallback(async (
    accountMappings: Record<string, AccountMapping>,
    existingMap: Map<string, string>,
    setProgress: SetProgressFn,
    translationsRef: React.MutableRefObject<ProgressTranslations>,
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
          currency: (mapping.currency || 'TRY') as 'TRY' | 'USD' | 'EUR' | 'GBP' | 'XAU' | 'XAG',
          balance: initialBalance,
          initial_balance: initialBalance,
        });
      }
    });

    if (newAccounts.length === 0) return { map: resultMap, createdIds: [] };

    setProgress((p: any) => ({
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
        createdIds.push(h.id);
      });
    }

    return { map: resultMap, createdIds };
  }, [isletme]);
}

/**
 * Carileri import et
 */
export function useImportClients() {
  const { isletme } = useAuthContext();

  return useCallback(async (
    accountMappings: Record<string, AccountMapping>,
    existingMap: Map<string, string>,
    setProgress: SetProgressFn,
    translationsRef: React.MutableRefObject<ProgressTranslations>,
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
          balance: initialBalance,
        });
      }
    });

    if (newClients.length === 0) return { map: resultMap, createdIds: [] };

    setProgress((p: any) => ({
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
        createdIds.push(c.id);
      });
    }

    return { map: resultMap, createdIds };
  }, [isletme]);
}

/**
 * Personelleri import et
 */
export function useImportPersonel() {
  const { isletme } = useAuthContext();

  return useCallback(async (
    accountMappings: Record<string, AccountMapping>,
    existingMap: Map<string, string>,
    setProgress: SetProgressFn,
    translationsRef: React.MutableRefObject<ProgressTranslations>,
    startingBalances: Map<string, number> = new Map()
  ): Promise<{ map: Map<string, string>; createdIds: string[] }> => {
    if (!isletme) return { map: existingMap, createdIds: [] };

    const resultMap = new Map(existingMap);
    const newPersonel: PersonelInsert[] = [];

    Object.values(accountMappings).forEach(mapping => {
      if (mapping.type === 'personel' && !resultMap.has(mapping.name.toLowerCase())) {
        const nameParts = mapping.name.trim().split(/\s+/);
        const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
        const firstName = nameParts.length > 1
          ? nameParts.slice(0, -1).join(' ')
          : nameParts[0] || mapping.name;

        const initialBalance = startingBalances.get(mapping.name.toLowerCase()) || 0;

        newPersonel.push({
          isletme_id: isletme.id,
          first_name: firstName,
          last_name: lastName,
          balance: initialBalance,
        });
      }
    });

    if (newPersonel.length === 0) return { map: resultMap, createdIds: [] };

    setProgress((p: any) => ({
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
        resultMap.set(fullName.toLowerCase(), p.id);
        createdIds.push(p.id);
      });
    }

    return { map: resultMap, createdIds };
  }, [isletme]);
}
