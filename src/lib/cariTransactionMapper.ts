/**
 * Cari Transaction Mapper
 *
 * Baglantili cari islemlerinde, karsi tarafin olusturdugu islemlerin tiplerini
 * goruntuleyenin perspektifine donusturur.
 *
 * Kural: Islem, bakan kisinin isletmesi disinda bir isletme tarafindan
 * olusturulmussa VE cari tipleri farkli ise (ornegin owner: musteri, viewer: tedarikci)
 * islem tipi ters cevrilir.
 *
 * Bu donusum sadece display amaçlidir - veritabaninda islem tipleri degismez.
 */

import type { IslemType } from '@/types/database';

/**
 * Islem tipini ters cevirir (perspektif degisimi icin).
 *
 * Mapping:
 *   cari_alis      <-> cari_satis
 *   cari_odeme     <-> cari_tahsilat
 *   cari_alis_iade <-> cari_satis_iade
 */
export function invertCariTransactionType(type: IslemType): IslemType {
  switch (type) {
    case 'cari_alis':       return 'cari_satis';
    case 'cari_satis':      return 'cari_alis';
    case 'cari_odeme':      return 'cari_tahsilat';
    case 'cari_tahsilat':   return 'cari_odeme';
    case 'cari_alis_iade':  return 'cari_satis_iade';
    case 'cari_satis_iade': return 'cari_alis_iade';
    default:                return type;
  }
}

/**
 * Cari tipleri farkli mi kontrol eder (inversion gerekli olabilecek durum).
 * Hem owner hem viewer icin gecerli.
 */
export function hasTypeMismatch(
  ownerCariType: string | undefined,
  viewerType: string | undefined,
): boolean {
  if (!ownerCariType || !viewerType) return false;
  return ownerCariType !== viewerType;
}

/**
 * Belirli bir islem icin tip inversiyonu gerekli mi kontrol eder.
 *
 * Kural: Islemi olusturan isletme, bakan kisinin isletmesi degilse
 * VE cari tipleri farkliysa -> invert.
 *
 * Bu hem A (owner) hem B (viewer) icin calisir:
 * - A, B'nin islemlerini gorurken: invert (B farkli perspektiften olusturdu)
 * - B, A'nin islemlerini gorurken: invert (A farkli perspektiften olusturdu)
 * - A, kendi islemlerini gorurken: invert yok
 * - B, kendi islemlerini gorurken: invert yok
 */
export function shouldInvertTransaction(
  islemIsletmeId: string | undefined,
  currentIsletmeId: string | undefined,
  typeMismatch: boolean,
): boolean {
  if (!typeMismatch) return false;
  if (!islemIsletmeId || !currentIsletmeId) return false;
  return islemIsletmeId !== currentIsletmeId;
}
