import { IslemType, UrunHareketTipi } from '@/types/database';

/**
 * Bir ürün hareketinin FİNANSAL YÖNÜ — stok yönünden (giriş/çıkış) BAĞIMSIZ.
 *
 * Neden gerekli: `hareket_tipi` yalnızca stok yönüdür (giris/cikis/duzeltme).
 * İadeler ters stok yönünde olur:
 *   - Alış iadesi (cari_alis_iade) → malı geri veririz → stok ÇIKIŞI
 *   - Satış iadesi (cari_satis_iade) → mal geri gelir → stok GİRİŞİ
 * Bu yüzden yalnız hareket_tipi'ye bakan bir gösterim, alış iadesini "satış",
 * satış iadesini "alış" gibi gösterir (yanlış aile). Doğru sınıflandırma için
 * bağlı işlemin tipi (islemType) şarttır.
 *
 * useProductReport (Alış-Satış raporu) zaten bu iade tiplerini net'liyor; bu
 * helper aynı semantiği ürün detay listesi ve aylık/dönem özetine taşır.
 */
export type UrunHareketYon = 'alis' | 'alis_iade' | 'satis' | 'satis_iade' | 'duzeltme';

const ALIS_IADE_TIPLERI = new Set<IslemType>(['cari_alis_iade']);
const SATIS_IADE_TIPLERI = new Set<IslemType>(['cari_satis_iade']);
const ALIS_TIPLERI = new Set<IslemType>(['cari_alis']);
const SATIS_TIPLERI = new Set<IslemType>(['cari_satis', 'personel_satis']);

/**
 * (hareket_tipi + bağlı işlem tipi) → finansal yön.
 *
 * - duzeltme her zaman 'duzeltme'.
 * - İşleme bağlı hareketlerde islemType belirleyicidir (iadeler doğru aileye gider).
 * - islemType yoksa (manuel stok hareketi) ya da ürünle ilgisiz bir tipse
 *   stok yönüne düşülür: giriş→alış, çıkış→satış (mevcut davranışla uyumlu).
 */
export function urunHareketYon(
  hareketTipi: UrunHareketTipi,
  islemType: IslemType | null | undefined,
): UrunHareketYon {
  if (hareketTipi === 'duzeltme') return 'duzeltme';
  if (islemType) {
    if (ALIS_IADE_TIPLERI.has(islemType)) return 'alis_iade';
    if (SATIS_IADE_TIPLERI.has(islemType)) return 'satis_iade';
    if (ALIS_TIPLERI.has(islemType)) return 'alis';
    if (SATIS_TIPLERI.has(islemType)) return 'satis';
  }
  return hareketTipi === 'giris' ? 'alis' : 'satis';
}

/** Alış ailesi mi? (alış + alış iadesi — ikisi de ALIŞ tarafına yazılır) */
export const isAlisAilesi = (yon: UrunHareketYon): boolean =>
  yon === 'alis' || yon === 'alis_iade';

/** Satış ailesi mi? (satış + satış iadesi) */
export const isSatisAilesi = (yon: UrunHareketYon): boolean =>
  yon === 'satis' || yon === 'satis_iade';

/** Bu yön bir iade mi? */
export const isIadeYon = (yon: UrunHareketYon): boolean =>
  yon === 'alis_iade' || yon === 'satis_iade';

/**
 * Bir hareketin ait olduğu ailedeki NET katkı işareti:
 *   +1 → aileyi artırır (alış / satış)
 *   -1 → aileyi azaltır (alış iadesi ALIŞ'tan düşer, satış iadesi SATIŞ'tan düşer)
 *    0 → düzeltme (aileye yazılmaz)
 */
export function aileNetIsaret(yon: UrunHareketYon): -1 | 0 | 1 {
  if (yon === 'alis' || yon === 'satis') return 1;
  if (yon === 'alis_iade' || yon === 'satis_iade') return -1;
  return 0;
}
