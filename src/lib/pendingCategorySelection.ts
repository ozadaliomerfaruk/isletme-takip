/**
 * Kategori-ekle sayfası ile QTB arasındaki tek-seferlik köprü.
 *
 * Akış: QTB'nin kategori seçicisinden "yeni kategori" → /kategoriler/ekle
 * (QTB navigatedAway ile GİZLENİR, kapanmaz) → kayıt başarılı olunca burada
 * işaretlenir → QTB odak geri gelince consume edip yeni kategoriyi SEÇER.
 * Modül-düzeyi tekil değer: kalıcı durum değil, navigasyon el sıkışması.
 */

let pending: { id: string; type: string; at: number } | null = null;

export function setPendingCategorySelection(id: string, type: string): void {
  pending = { id, type, at: Date.now() };
}

/** Bekleyen seçimi al ve temizle; bayatsa (varsayılan 5 dk) yok say. */
export function consumePendingCategorySelection(maxAgeMs = 5 * 60_000): { id: string; type: string } | null {
  if (!pending) return null;
  const p = pending;
  pending = null;
  return Date.now() - p.at <= maxAgeMs ? { id: p.id, type: p.type } : null;
}
