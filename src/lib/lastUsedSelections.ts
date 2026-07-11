/**
 * Son Kullanılan Seçimler (Last-Used Selections)
 *
 * QuickTransactionBar açılışında hesap/kategori ön-doldurması için işlem-tipi
 * başına son kullanılan seçimleri saklar. Esnaf her gün aynı 2-3 kategoriyle
 * çalıştığından kayıt akışını kısaltır.
 *
 * GÜVENLİK / KAPSAMLAMA KURALLARI (A1):
 * - Anahtar isletme_id ile namespace'lenir → impersonation/çoklu-işletme
 *   senaryosunda başka işletmenin id'si asla prefill olmaz (çapraz-kiracı sızıntı yok).
 * - Ön-doldurulan id'ler KULLANILMADAN ÖNCE canlı listeye karşı doğrulanmalı
 *   (silinmiş/arşivlenmiş/yanlış-aile id → tüketici tarafında yok sayılır).
 * - Yalnız düz string/dizi saklanır (Map/Set persist YASAK — JSON'a {} olur, çöker).
 * - Değerler şifresiz saklanır; yalnız id referansları tutulur (hassas veri yok).
 *
 * Hesaplar işlem-tipine göre filtrelenmez → hesap RAW TransactionType ile key'lenir.
 * Kategoriler gelir/gider ailesine göre filtrelenir → kategori AİLE ('gelir'|'gider')
 * ile key'lenir (aksi halde satis + personel_satis_tab gibi aynı aileye düşen tipler
 * belleği gereksiz parçalar).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/** Kategori ailesi (gelir/gider) — categoryTypeMapper.getCategoryType çıktısı. */
export type CategoryFamily = 'gelir' | 'gider';

export interface LastUsedSelections {
  /** Son kullanılan hesap id'si — RAW işlem tipi (gelir/gider/transfer/...) başına. */
  hesapByType: Record<string, string>;
  /**
   * Son kullanılan kategoriler (en yeni önce, tekilleştirilmiş) — gelir/gider ailesi başına.
   * "Son kullanılan tek kategori" = recentKategoriByFamily[family][0] (ayrı alan tutulmaz —
   * diske yazılan şema minimal kalsın; türetilebilir alanı persist etmek sonradan çıkarmayı
   * consumer-guard'a mahkûm eder).
   */
  recentKategoriByFamily: Record<string, string[]>;
}

/** "Son kullanılanlar" listesinde saklanan azami kategori sayısı (görüntüde dilimlenir). */
const RECENT_LIMIT = 8;

const EMPTY: LastUsedSelections = {
  hesapByType: {},
  recentKategoriByFamily: {},
};

function keyFor(isletmeId: string): string {
  return `@defter_last_used_${isletmeId}`;
}

/** Bozuk/eksik JSON'a karşı güvenli — her zaman tam şekilli bir nesne döndürür. */
function normalize(raw: unknown): LastUsedSelections {
  if (!raw || typeof raw !== 'object') return { ...EMPTY };
  const obj = raw as Partial<LastUsedSelections>;
  return {
    hesapByType: obj.hesapByType && typeof obj.hesapByType === 'object' ? obj.hesapByType : {},
    recentKategoriByFamily:
      obj.recentKategoriByFamily && typeof obj.recentKategoriByFamily === 'object'
        ? obj.recentKategoriByFamily
        : {},
  };
}

/**
 * Bir işletmenin son-kullanılan seçimlerini okur. Miss/hata durumunda boş şekil döner
 * (asla throw etmez — persistence yolu kaydı bozmamalı).
 */
export async function getLastUsedSelections(
  isletmeId: string | null | undefined
): Promise<LastUsedSelections> {
  if (!isletmeId) return { ...EMPTY };
  try {
    const data = await AsyncStorage.getItem(keyFor(isletmeId));
    if (!data) return { ...EMPTY };
    return normalize(JSON.parse(data));
  } catch (error) {
    if (__DEV__) console.error('[lastUsedSelections] okuma hatası:', error);
    return { ...EMPTY };
  }
}

interface RecordArgs {
  type: string;
  family: CategoryFamily | undefined;
  hesapId?: string | null;
  kategoriId?: string | null;
}

/** Kaydı saf (pure) olarak uygular — hem disk hem hook state'i aynı mantığı paylaşır. */
export function applyRecord(store: LastUsedSelections, args: RecordArgs): LastUsedSelections {
  const { type, family, hesapId, kategoriId } = args;
  const next: LastUsedSelections = {
    hesapByType: { ...store.hesapByType },
    recentKategoriByFamily: { ...store.recentKategoriByFamily },
  };

  if (type && hesapId) {
    next.hesapByType[type] = hesapId;
  }

  if (family && kategoriId) {
    const prev = next.recentKategoriByFamily[family] ?? [];
    next.recentKategoriByFamily[family] = [
      kategoriId,
      ...prev.filter((id) => id !== kategoriId),
    ].slice(0, RECENT_LIMIT);
  }

  return next;
}

/**
 * Başarılı kayıt sonrası son-kullanılanı diske yazar (fire-and-forget kullanılır).
 * hesapId yalnız varsa, kategori yalnız aile+id varsa güncellenir; null değer belleği silmez.
 */
export async function recordLastUsed(
  isletmeId: string | null | undefined,
  args: RecordArgs
): Promise<void> {
  if (!isletmeId) return;
  // Kaydedilecek anlamlı bir şey yoksa diske gitme.
  if (!args.hesapId && !(args.family && args.kategoriId)) return;
  try {
    const store = await getLastUsedSelections(isletmeId);
    const next = applyRecord(store, args);
    await AsyncStorage.setItem(keyFor(isletmeId), JSON.stringify(next));
  } catch (error) {
    if (__DEV__) console.error('[lastUsedSelections] yazma hatası:', error);
  }
}

/** Belirli bir işletmenin son-kullanılan belleğini siler (logout/hesap silme). */
export async function clearLastUsedSelections(
  isletmeId: string | null | undefined
): Promise<void> {
  if (!isletmeId) return;
  try {
    await AsyncStorage.removeItem(keyFor(isletmeId));
  } catch (error) {
    if (__DEV__) console.error('[lastUsedSelections] silme hatası:', error);
  }
}
