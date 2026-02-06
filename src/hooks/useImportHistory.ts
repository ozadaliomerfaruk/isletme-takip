/**
 * Import History Hook
 * AsyncStorage kullanarak import geçmişini yerel olarak saklar
 * Supabase'de yeni tablo oluşturmadan duplicate dosya kontrolü sağlar
 */

import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { ImportResult } from './useDataImport';

// ============================================================================
// CONSTANTS
// ============================================================================

const IMPORT_HISTORY_KEY = 'import_history';
const LAST_IMPORT_KEY = 'last_import_data';
const MAX_HISTORY_ITEMS = 10; // Her işletme için max 10 import kaydı

// ============================================================================
// TYPES
// ============================================================================

export interface ImportHistoryItem {
  id: string;
  isletmeId: string;
  fileName: string;
  fileHash: string;
  importedAt: string;
  categoriesCreated: number;
  accountsCreated: number;
  clientsCreated: number;
  personelCreated: number;
  transactionsCreated: number;
  transactionsSkipped: number;
  errors: string[];
}

// Son import verisi (geri alma için)
export interface LastImportData {
  isletmeId: string;
  fileName: string;
  importedAt: string;
  transactionIds: string[];
  // Yeni oluşturulan entity ID'leri (tam geri alma için)
  createdCategoryIds: string[];
  reactivatedCategoryIds: string[]; // Reactivate edilen kategoriler (geri alma için deactivate edilecek)
  createdAccountIds: string[];
  createdClientIds: string[];
  createdPersonelIds: string[];
  canUndo: boolean;
}

// ============================================================================
// HOOK
// ============================================================================

export function useImportHistory() {
  const { isletme } = useAuthContext();
  const [history, setHistory] = useState<ImportHistoryItem[]>([]);
  const [lastImport, setLastImport] = useState<LastImportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUndoing, setIsUndoing] = useState(false);

  /**
   * Geçmişi yükle
   */
  const loadHistory = useCallback(async () => {
    if (!isletme) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      // Import history
      const stored = await AsyncStorage.getItem(IMPORT_HISTORY_KEY);
      if (stored) {
        try {
          const allHistory: ImportHistoryItem[] = JSON.parse(stored);
          // Sadece bu işletmeye ait kayıtları filtrele
          const filtered = allHistory.filter(h => h.isletmeId === isletme.id);
          setHistory(filtered);
        } catch (parseErr: unknown) {
          // JSON parse hatası - corrupted data, temizle
          if (__DEV__) {
            console.error('Import history JSON parse error, clearing:', parseErr);
          }
          await AsyncStorage.removeItem(IMPORT_HISTORY_KEY);
          setHistory([]);
        }
      } else {
        setHistory([]);
      }

      // Last import data (geri alma için)
      const lastImportStored = await AsyncStorage.getItem(LAST_IMPORT_KEY);
      if (lastImportStored) {
        try {
          const lastImportData: LastImportData = JSON.parse(lastImportStored);
          // Sadece bu işletmeye ait ve geri alınabilir olanı yükle
          if (lastImportData.isletmeId === isletme.id && lastImportData.canUndo) {
            setLastImport(lastImportData);
          } else {
            setLastImport(null);
          }
        } catch {
          setLastImport(null);
        }
      }
    } catch (err: unknown) {
      if (__DEV__) {
        console.error('Import history load error:', err);
      }
      setHistory([]);
    } finally {
      setIsLoading(false);
    }
  }, [isletme]);

  /**
   * Yeni import kaydı ekle
   * @param result - Import sonucu
   * @param fileName - İmport edilen dosya adı
   * @param fileHash - Dosya hash'i (duplicate kontrolü için)
   * @param createdIds - Oluşturulan entity ID'leri (geri alma için)
   */
  const saveImportHistory = useCallback(async (
    result: ImportResult,
    fileName: string,
    fileHash: string,
    createdIds: {
      transactionIds: string[];
      categoryIds: string[];
      reactivatedCategoryIds: string[];
      accountIds: string[];
      clientIds: string[];
      personelIds: string[];
    }
  ): Promise<void> => {
    if (!isletme) return;

    const newItem: ImportHistoryItem = {
      id: Date.now().toString(),
      isletmeId: isletme.id,
      fileName,
      fileHash,
      importedAt: new Date().toISOString(),
      categoriesCreated: result.categoriesCreated,
      accountsCreated: result.accountsCreated,
      clientsCreated: result.clientsCreated,
      personelCreated: result.personelCreated,
      transactionsCreated: result.transactionsCreated,
      transactionsSkipped: result.skipped,
      errors: result.errors,
    };

    try {
      const stored = await AsyncStorage.getItem(IMPORT_HISTORY_KEY);
      let allHistory: ImportHistoryItem[] = [];

      if (stored) {
        try {
          allHistory = JSON.parse(stored);
        } catch {
          // JSON parse hatası - yeni array ile başla
          allHistory = [];
        }
      }

      // Yeni kaydı başa ekle
      allHistory.unshift(newItem);

      // Her işletme için max 10 kayıt tut (eski kayıtları sil)
      const byIsletme = new Map<string, ImportHistoryItem[]>();
      allHistory.forEach(h => {
        const list = byIsletme.get(h.isletmeId) || [];
        if (list.length < MAX_HISTORY_ITEMS) {
          list.push(h);
        }
        byIsletme.set(h.isletmeId, list);
      });

      // Düzleştir
      allHistory = [...byIsletme.values()].flat();

      await AsyncStorage.setItem(IMPORT_HISTORY_KEY, JSON.stringify(allHistory));

      // Son import verisini kaydet (geri alma için)
      // Herhangi bir entity oluşturulduysa veya reactivate edildiyse geri alınabilir
      const hasAnyCreated =
        createdIds.transactionIds.length > 0 ||
        createdIds.categoryIds.length > 0 ||
        createdIds.reactivatedCategoryIds.length > 0 ||
        createdIds.accountIds.length > 0 ||
        createdIds.clientIds.length > 0 ||
        createdIds.personelIds.length > 0;

      if (hasAnyCreated) {
        const lastImportData: LastImportData = {
          isletmeId: isletme.id,
          fileName,
          importedAt: new Date().toISOString(),
          transactionIds: createdIds.transactionIds,
          createdCategoryIds: createdIds.categoryIds,
          reactivatedCategoryIds: createdIds.reactivatedCategoryIds,
          createdAccountIds: createdIds.accountIds,
          createdClientIds: createdIds.clientIds,
          createdPersonelIds: createdIds.personelIds,
          canUndo: true,
        };
        await AsyncStorage.setItem(LAST_IMPORT_KEY, JSON.stringify(lastImportData));
        setLastImport(lastImportData);

        if (__DEV__) {
          console.log('Saved last import data for undo:', {
            transactions: createdIds.transactionIds.length,
            categories: createdIds.categoryIds.length,
            reactivatedCategories: createdIds.reactivatedCategoryIds.length,
            accounts: createdIds.accountIds.length,
            clients: createdIds.clientIds.length,
            personel: createdIds.personelIds.length,
          });
        }
      }

      // State güncelle
      const filtered = allHistory.filter(h => h.isletmeId === isletme.id);
      setHistory(filtered);
    } catch (err: unknown) {
      if (__DEV__) {
        console.error('Import history save error:', err);
      }
    }
  }, [isletme]);

  /**
   * File hash kontrolü (aynı dosya daha önce import edilmiş mi?)
   */
  const checkFileHash = useCallback(async (
    fileHash: string
  ): Promise<ImportHistoryItem | null> => {
    if (!isletme) return null;

    try {
      const stored = await AsyncStorage.getItem(IMPORT_HISTORY_KEY);
      if (stored) {
        try {
          const allHistory: ImportHistoryItem[] = JSON.parse(stored);
          return allHistory.find(
            h => h.isletmeId === isletme.id && h.fileHash === fileHash
          ) || null;
        } catch {
          // JSON parse hatası - corrupted data
          return null;
        }
      }
    } catch (err: unknown) {
      if (__DEV__) {
        console.error('File hash check error:', err);
      }
    }
    return null;
  }, [isletme]);

  /**
   * Geçmişi temizle (sadece bu işletme için)
   */
  const clearHistory = useCallback(async (): Promise<void> => {
    if (!isletme) return;

    try {
      const stored = await AsyncStorage.getItem(IMPORT_HISTORY_KEY);
      if (stored) {
        try {
          let allHistory: ImportHistoryItem[] = JSON.parse(stored);
          // Bu işletmeye ait kayıtları filtrele (kaldır)
          allHistory = allHistory.filter(h => h.isletmeId !== isletme.id);
          await AsyncStorage.setItem(IMPORT_HISTORY_KEY, JSON.stringify(allHistory));
        } catch {
          // JSON parse hatası - tüm geçmişi sil
          await AsyncStorage.removeItem(IMPORT_HISTORY_KEY);
        }
        setHistory([]);
      }
    } catch (err: unknown) {
      if (__DEV__) {
        console.error('Clear history error:', err);
      }
    }
  }, [isletme]);

  /**
   * Bir işlemin bakiyesini geri al
   * Helper function for undoLastImport
   * OPTIMIZED: Tüm RPC çağrıları paralel çalıştırılır
   */
  const revertTransactionBalance = async (tx: {
    id: string;
    type: string;
    amount: number;
    hesap_id: string | null;
    hedef_hesap_id: string | null;
    cari_id: string | null;
    personel_id: string | null;
  }) => {
    const amount = Number(tx.amount) || 0;
    const promises: Promise<void>[] = [];

    // Helper: RPC çağrısını Promise'e çevir
    const incrementBalance = async (tableName: string, rowId: string, amt: number): Promise<void> => {
      const { error } = await supabase.rpc('increment_balance', {
        table_name: tableName,
        row_id: rowId,
        amount: amt,
      });
      if (error) throw error;
    };

    // Hesap bakiyesini geri al
    if (tx.hesap_id) {
      const isIncomeType = ['gelir', 'cari_tahsilat', 'personel_tahsilat'].includes(tx.type);
      const reverseAmount = tx.type === 'transfer' ? amount : (isIncomeType ? -amount : amount);
      promises.push(incrementBalance('hesaplar', tx.hesap_id, reverseAmount));
    }

    // Transfer hedef hesabını geri al
    if (tx.type === 'transfer' && tx.hedef_hesap_id) {
      promises.push(incrementBalance('hesaplar', tx.hedef_hesap_id, -amount));
    }

    // Cari bakiyesini geri al
    if (tx.cari_id) {
      const reverseAmount = ['cari_tahsilat', 'cari_alis'].includes(tx.type) ? amount : -amount;
      promises.push(incrementBalance('cariler', tx.cari_id, reverseAmount));
    }

    // Personel bakiyesini geri al
    if (tx.personel_id) {
      const reverseAmount = tx.type === 'personel_odeme' ? amount : -amount;
      promises.push(incrementBalance('personel', tx.personel_id, reverseAmount));
    }

    // Tüm RPC'leri paralel çalıştır
    if (promises.length > 0) {
      await Promise.all(promises);
    }
  };

  /**
   * Son importu tamamen geri al
   * Import edilen hesap/cari/personel ile ilişkili TÜM işlemleri siler (import sonrası girilenler dahil)
   *
   * Sıralama:
   * 1. Import edilen hesap/cari/personel ile ilişkili TÜM işlemleri bul ve sil
   * 2. Import edilen kategorileri sil/deaktive et
   * 3. Import edilen hesapları sil
   * 4. Import edilen carileri sil
   * 5. Import edilen personeli sil
   */
  const undoLastImport = useCallback(async (): Promise<{
    success: boolean;
    deletedCount: number;
    deletedEntities: {
      transactions: number;
      categories: number;
      accounts: number;
      clients: number;
      personel: number;
    };
    error?: string;
  }> => {
    const emptyResult = {
      success: false,
      deletedCount: 0,
      deletedEntities: { transactions: 0, categories: 0, accounts: 0, clients: 0, personel: 0 },
    };

    if (!isletme || !lastImport || !lastImport.canUndo) {
      return { ...emptyResult, error: 'Geri alınacak import bulunamadı' };
    }

    setIsUndoing(true);

    try {
      const {
        transactionIds,
        createdCategoryIds = [],
        reactivatedCategoryIds = [],
        createdAccountIds = [],
        createdClientIds = [],
        createdPersonelIds = [],
      } = lastImport;

      if (__DEV__) {
        console.log('Undo import: Starting full undo', {
          importedTransactions: transactionIds.length,
          categories: createdCategoryIds.length,
          reactivatedCategories: reactivatedCategoryIds.length,
          accounts: createdAccountIds.length,
          clients: createdClientIds.length,
          personel: createdPersonelIds.length,
        });
      }

      // ========================================================================
      // 1. İMPORT EDİLEN ENTITY'LERLE İLİŞKİLİ TÜM İŞLEMLERİ BUL VE SİL
      // (Import sonrası girilenler dahil)
      // ========================================================================

      let totalDeletedTransactions = 0;
      const allRelatedTransactionIds = new Set<string>(transactionIds);

      // 1a. Import edilen HESAPLARLA ilişkili işlemleri bul
      if (createdAccountIds.length > 0) {
        const { data: accountTx, error: accTxError } = await supabase
          .from('islemler')
          .select('id, type, amount, hesap_id, hedef_hesap_id, cari_id, personel_id')
          .eq('isletme_id', isletme.id)
          .or(`hesap_id.in.(${createdAccountIds.join(',')}),hedef_hesap_id.in.(${createdAccountIds.join(',')})`);

        if (!accTxError && accountTx) {
          accountTx.forEach(tx => allRelatedTransactionIds.add(tx.id));
          if (__DEV__) {
            console.log('Found transactions related to imported accounts:', accountTx.length);
          }
        }
      }

      // 1b. Import edilen CARİLERLE ilişkili işlemleri bul
      if (createdClientIds.length > 0) {
        const { data: cariTx, error: cariTxError } = await supabase
          .from('islemler')
          .select('id, type, amount, hesap_id, hedef_hesap_id, cari_id, personel_id')
          .eq('isletme_id', isletme.id)
          .in('cari_id', createdClientIds);

        if (!cariTxError && cariTx) {
          cariTx.forEach(tx => allRelatedTransactionIds.add(tx.id));
          if (__DEV__) {
            console.log('Found transactions related to imported clients:', cariTx.length);
          }
        }
      }

      // 1c. Import edilen PERSONELLE ilişkili işlemleri bul
      if (createdPersonelIds.length > 0) {
        const { data: personelTx, error: personelTxError } = await supabase
          .from('islemler')
          .select('id, type, amount, hesap_id, hedef_hesap_id, cari_id, personel_id')
          .eq('isletme_id', isletme.id)
          .in('personel_id', createdPersonelIds);

        if (!personelTxError && personelTx) {
          personelTx.forEach(tx => allRelatedTransactionIds.add(tx.id));
          if (__DEV__) {
            console.log('Found transactions related to imported personel:', personelTx.length);
          }
        }
      }

      // 1d. Tüm ilişkili işlemleri getir ve bakiyelerini geri al
      const allTxIds = Array.from(allRelatedTransactionIds);
      if (allTxIds.length > 0) {
        if (__DEV__) {
          console.log('Undo import: Reverting balances for', allTxIds.length, 'transactions');
        }

        // Batch halinde işle (Supabase'in IN limiti nedeniyle)
        const BATCH_SIZE = 100;
        for (let i = 0; i < allTxIds.length; i += BATCH_SIZE) {
          const batch = allTxIds.slice(i, i + BATCH_SIZE);

          const { data: transactions, error: fetchError } = await supabase
            .from('islemler')
            .select('id, type, amount, hesap_id, hedef_hesap_id, cari_id, personel_id')
            .in('id', batch);

          if (fetchError) {
            if (__DEV__) {
              console.error('İşlem fetch hatası:', fetchError);
            }
            continue;
          }

          // OPTIMIZED: Batch parallel balance reversion (100'lük gruplar)
          if (transactions && transactions.length > 0) {
            const REVERT_BATCH_SIZE = 100;
            for (let j = 0; j < transactions.length; j += REVERT_BATCH_SIZE) {
              const revertBatch = transactions.slice(j, j + REVERT_BATCH_SIZE);
              const revertPromises = revertBatch.map(tx =>
                revertTransactionBalance(tx).catch(err => {
                  if (__DEV__) {
                    console.error('Balance revert error:', err);
                  }
                })
              );
              await Promise.all(revertPromises);
            }
          }
        }

        // İşlemleri sil (batch halinde)
        for (let i = 0; i < allTxIds.length; i += BATCH_SIZE) {
          const batch = allTxIds.slice(i, i + BATCH_SIZE);

          const { error: txDeleteError } = await supabase
            .from('islemler')
            .delete()
            .in('id', batch);

          if (txDeleteError) {
            if (__DEV__) {
              console.error('İşlem silme hatası:', txDeleteError);
            }
          }
        }

        totalDeletedTransactions = allTxIds.length;
        if (__DEV__) {
          console.log('Undo import: Deleted', totalDeletedTransactions, 'transactions (including post-import)');
        }
      }

      // ========================================================================
      // 2. KATEGORİLERİ SİL / DEAKTİVE ET
      // ========================================================================
      let deletedCategories = 0;
      if (createdCategoryIds.length > 0) {
        const { error: catDeleteError } = await supabase
          .from('kategoriler')
          .delete()
          .in('id', createdCategoryIds);

        if (catDeleteError) {
          if (__DEV__) {
            console.error('Kategori silme hatası:', catDeleteError);
          }
        } else {
          deletedCategories = createdCategoryIds.length;
          if (__DEV__) {
            console.log('Undo import: Categories deleted', { count: deletedCategories });
          }
        }
      }

      let deactivatedCategories = 0;
      if (reactivatedCategoryIds.length > 0) {
        const { error: catDeactivateError } = await supabase
          .from('kategoriler')
          .update({ is_active: false })
          .in('id', reactivatedCategoryIds);

        if (catDeactivateError) {
          if (__DEV__) {
            console.error('Kategori deaktive hatası:', catDeactivateError);
          }
        } else {
          deactivatedCategories = reactivatedCategoryIds.length;
          if (__DEV__) {
            console.log('Undo import: Categories deactivated', { count: deactivatedCategories });
          }
        }
      }

      // ========================================================================
      // 3. HESAPLARI SİL
      // ========================================================================
      let deletedAccounts = 0;
      if (createdAccountIds.length > 0) {
        const { error: accDeleteError } = await supabase
          .from('hesaplar')
          .delete()
          .in('id', createdAccountIds);

        if (accDeleteError) {
          if (__DEV__) {
            console.error('Hesap silme hatası:', accDeleteError);
          }
        } else {
          deletedAccounts = createdAccountIds.length;
          if (__DEV__) {
            console.log('Undo import: Accounts deleted', { count: deletedAccounts });
          }
        }
      }

      // ========================================================================
      // 4. CARİLERİ SİL
      // ========================================================================
      let deletedClients = 0;
      if (createdClientIds.length > 0) {
        const { error: cariDeleteError } = await supabase
          .from('cariler')
          .delete()
          .in('id', createdClientIds);

        if (cariDeleteError) {
          if (__DEV__) {
            console.error('Cari silme hatası:', cariDeleteError);
          }
        } else {
          deletedClients = createdClientIds.length;
          if (__DEV__) {
            console.log('Undo import: Clients deleted', { count: deletedClients });
          }
        }
      }

      // ========================================================================
      // 5. PERSONELİ SİL
      // ========================================================================
      let deletedPersonel = 0;
      if (createdPersonelIds.length > 0) {
        const { error: personelDeleteError } = await supabase
          .from('personel')
          .delete()
          .in('id', createdPersonelIds);

        if (personelDeleteError) {
          if (__DEV__) {
            console.error('Personel silme hatası:', personelDeleteError);
          }
        } else {
          deletedPersonel = createdPersonelIds.length;
          if (__DEV__) {
            console.log('Undo import: Personel deleted', { count: deletedPersonel });
          }
        }
      }

      // ========================================================================
      // 6. LOCAL STORAGE'I TEMİZLE
      // ========================================================================
      await AsyncStorage.removeItem(LAST_IMPORT_KEY);
      setLastImport(null);

      // History'den son kaydı kaldır
      const stored = await AsyncStorage.getItem(IMPORT_HISTORY_KEY);
      if (stored) {
        try {
          let allHistory: ImportHistoryItem[] = JSON.parse(stored);
          const thisIsletmeHistory = allHistory.filter(h => h.isletmeId === isletme.id);
          if (thisIsletmeHistory.length > 0) {
            const lastHistoryId = thisIsletmeHistory[0].id;
            allHistory = allHistory.filter(h => h.id !== lastHistoryId);
            await AsyncStorage.setItem(IMPORT_HISTORY_KEY, JSON.stringify(allHistory));
            setHistory(allHistory.filter(h => h.isletmeId === isletme.id));
          }
        } catch {
          // Ignore parse errors
        }
      }

      const totalCategories = deletedCategories + deactivatedCategories;
      const totalDeleted = totalDeletedTransactions + totalCategories + deletedAccounts + deletedClients + deletedPersonel;

      if (__DEV__) {
        console.log('Undo import: Complete', {
          transactions: totalDeletedTransactions,
          categoriesDeleted: deletedCategories,
          categoriesDeactivated: deactivatedCategories,
          accounts: deletedAccounts,
          clients: deletedClients,
          personel: deletedPersonel,
          total: totalDeleted,
        });
      }

      return {
        success: true,
        deletedCount: totalDeleted,
        deletedEntities: {
          transactions: totalDeletedTransactions,
          categories: totalCategories,
          accounts: deletedAccounts,
          clients: deletedClients,
          personel: deletedPersonel,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
      if (__DEV__) {
        console.error('Undo import error:', err);
      }
      return {
        success: false,
        deletedCount: 0,
        deletedEntities: { transactions: 0, categories: 0, accounts: 0, clients: 0, personel: 0 },
        error: message,
      };
    } finally {
      setIsUndoing(false);
    }
  }, [isletme, lastImport]);

  // İlk yüklemede geçmişi getir
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return {
    history,
    lastImport,
    isLoading,
    isUndoing,
    saveImportHistory,
    checkFileHash,
    clearHistory,
    loadHistory,
    undoLastImport,
  };
}
