/**
 * İşlem Renk ve Görünüm Yönetimi
 *
 * Tüm işlem tiplerine göre renk, prefix ve accent bar kararları burada.
 * icons.tsx sadece ikon config'lerini tutar; renk/prefix mantığı burada.
 *
 * Kurallar:
 * - Gelen para (yeşil): gelir, satış, tahsilat
 * - Çıkan para (kırmızı): gider, alış, ödeme
 * - Nötr (muted): transfer, iade
 */

import type { IslemType } from '@/types/database';

// ============================================================================
// RENK
// ============================================================================

const COLOR_IN = '#059669';    // Gelen para — yeşil
const COLOR_OUT = '#DC2626';   // Çıkan para — kırmızı
const COLOR_NEUTRAL = '#6B7280'; // Nötr — muted
const COLOR_TRADE = '#2563EB';   // Ticari işlem (satış/alış) — mavi

/**
 * İşlem tipine göre birincil renk döndür.
 * Label, tutar ve accent bar için aynı renk kullanılır.
 */
export function getTransactionColor(type: IslemType): string {
  switch (type) {
    // Gelen para / hak kazanma
    case 'gelir':
    case 'cari_satis':
    case 'cari_tahsilat':
    case 'personel_satis':
    case 'personel_tahsilat':
    case 'personel_izin_hakki':
      return COLOR_IN;

    // Çıkan para
    case 'gider':
    case 'cari_alis':
    case 'cari_odeme':
    case 'personel_gider':
    case 'personel_odeme':
      return COLOR_OUT;

    // Nötr (transfer, iade, izin kullanımı)
    case 'cari_alis_iade':
    case 'cari_satis_iade':
    case 'personel_izin_kullanimi':
    case 'transfer':
    default:
      return COLOR_NEUTRAL;
  }
}

// ============================================================================
// PREFIX
// ============================================================================

/**
 * İşlem tipine göre tutar öneki döndür.
 * Amount her zaman Math.abs() ile formatlanır, işaret buradan gelir.
 */
export function getTransactionPrefix(type: IslemType): string {
  switch (type) {
    // Para girişi / hak kazanma
    case 'gelir':
    case 'cari_satis':
    case 'cari_tahsilat':
    case 'personel_satis':
    case 'personel_tahsilat':
    case 'personel_izin_hakki':
      return '+';

    // Para çıkışı / izin kullanımı
    case 'gider':
    case 'cari_alis':
    case 'cari_odeme':
    case 'personel_gider':
    case 'personel_odeme':
    case 'personel_izin_kullanimi':
      return '-';

    // İade
    case 'cari_alis_iade':
    case 'cari_satis_iade':
      return '↩ ';

    // Transfer ve diğer
    default:
      return '';
  }
}

// ============================================================================
// ENTITY PERSPECTIVE COLOR
// ============================================================================

/**
 * Cari/Personel detay sayfasında işlem rengini belirler.
 * Genel kasa perspektifinden değil, cari/personel ilişkisi perspektifinden renk verir.
 *
 * 3 kategori:
 * - Nakit hareketler (ödeme, tahsilat) → mavi (nakit akış)
 * - Bakiye artıran (satış, izin hakkı) → yeşil
 * - Bakiye azaltan (alış, gider) → kırmızı
 * - İade, transfer → nötr gri
 */
export function getEntityPerspectiveColor(type: IslemType): string {
  switch (type) {
    // Nakit hareketler (ödeme/tahsilat) → mavi
    case 'cari_odeme':
    case 'cari_tahsilat':
    case 'personel_odeme':
    case 'personel_tahsilat':
      return COLOR_TRADE;

    // Bakiye artıran ticari işlemler → yeşil
    case 'cari_satis':
    case 'personel_satis':
    case 'personel_izin_hakki':
      return COLOR_IN;

    // Bakiye azaltan / gider → kırmızı
    case 'cari_alis':
    case 'personel_gider':
    case 'personel_izin_kullanimi':
      return COLOR_OUT;

    // İade, transfer → nötr
    case 'cari_alis_iade':
    case 'cari_satis_iade':
    case 'transfer':
    default:
      return COLOR_NEUTRAL;
  }
}

/**
 * Cari/Personel detay sayfasında tutar öneki.
 * Bakiye etkisini gösterir: bakiye artıran +, bakiye azaltan -.
 */
export function getEntityPerspectivePrefix(type: IslemType): string {
  switch (type) {
    // Artı prefix: bakiye artıran (satış, ödeme, izin hakkı)
    case 'cari_satis':
    case 'cari_odeme':
    case 'personel_satis':
    case 'personel_odeme':
    case 'personel_izin_hakki':
      return '+';

    // Eksi prefix: bakiye azaltan (alış, tahsilat, gider)
    case 'cari_alis':
    case 'cari_tahsilat':
    case 'personel_gider':
    case 'personel_tahsilat':
    case 'personel_izin_kullanimi':
      return '-';

    // İade
    case 'cari_alis_iade':
    case 'cari_satis_iade':
      return '↩ ';

    default:
      return '';
  }
}

// ============================================================================
// ACCENT BAR
// ============================================================================

/**
 * Bu işlem tipi için sol accent bar gösterilmeli mi?
 * Transfer ve iade tiplerinde bar gösterilmez.
 */
export function showAccentBar(type: IslemType): boolean {
  switch (type) {
    case 'transfer':
    case 'cari_alis_iade':
    case 'cari_satis_iade':
    case 'personel_izin_kullanimi':
      return false;
    default:
      return true;
  }
}
