import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  getLastUsedSelections,
  type LastUsedSelections,
  type CategoryFamily,
} from '@/lib/lastUsedSelections';

const EMPTY_STORE: LastUsedSelections = {
  hesapByType: {},
  recentKategoriByFamily: {},
};
const EMPTY_ARR: string[] = [];

/**
 * QuickTransactionBar için son-kullanılan hesap/kategori belleğini yükler.
 *
 * - Anahtar aktif isletme.id ile namespace'lidir (çapraz-kiracı sızıntı yok); işletme
 *   değişince otomatik olarak diğer işletmenin belleğini okur, açık temizlik gerekmez.
 * - getHesapId/getKategoriId REF üzerinden okur (kimlik-stabil) → ön-doldurma
 *   effect'leri değeri senkron okuyabilir, dep dizilerini şişirmez.
 * - recentKategoriByFamily REACTIVE'dir → "son 3 kategori" chip satırı yeniden render olur.
 * - reload(): diski yeniden okur (bar her açılışında çağrılır ki aynı oturumdaki
 *   kayıtlar da yansısın; kayıt useTransactionSubmit içinde diske yazılır).
 *
 * NOT: bar kullanıcı açmadan çok önce mount olur, bu yüzden storeRef ilk açılışta
 * genelde doludur. Yine de ön-doldurma effect'leri "değer yoksa varsayılana düş"
 * mantığıyla yazılmalı (soğuk açılışta bellek bir tık geç gelebilir).
 */
export function useLastUsedSelections() {
  const { isletme } = useAuthContext();
  const isletmeId = isletme?.id;

  const [store, setStore] = useState<LastUsedSelections>(EMPTY_STORE);
  const storeRef = useRef(store);
  storeRef.current = store;

  const load = useCallback(() => {
    if (!isletmeId) {
      setStore(EMPTY_STORE);
      return;
    }
    getLastUsedSelections(isletmeId)
      .then((s) => setStore(s))
      .catch(() => {});
  }, [isletmeId]);

  // Mount / isletme değişiminde ön-yükle.
  useEffect(() => {
    load();
  }, [load]);

  const getHesapId = useCallback((type: string): string | undefined => {
    return storeRef.current.hesapByType[type];
  }, []);

  const getKategoriId = useCallback((family: CategoryFamily | undefined): string | undefined => {
    if (!family) return undefined;
    // "Son kullanılan tek kategori" = recents listesinin ilk elemanı (türetilir, ayrı tutulmaz).
    return storeRef.current.recentKategoriByFamily[family]?.[0];
  }, []);

  const getRecentKategoriIds = useCallback(
    (family: CategoryFamily | undefined): string[] => {
      if (!family) return EMPTY_ARR;
      return store.recentKategoriByFamily[family] ?? EMPTY_ARR;
    },
    [store]
  );

  return { getHesapId, getKategoriId, getRecentKategoriIds, reload: load };
}
