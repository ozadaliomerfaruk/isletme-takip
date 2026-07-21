/**
 * Telefon yardımcıları — Ara / WhatsApp kısayolları için.
 * Telefon alanı serbest metin girildiğinden (0555..., +90 555..., 555...)
 * WhatsApp'ın beklediği uluslararası biçime TR varsayımıyla katlanır.
 */

/** wa.me için rakam-normalize numara; anlamlı numara çıkmazsa null. */
export function normalizePhoneForWa(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  // +90/90 ile zaten uluslararası
  if (digits.startsWith('90') && digits.length === 12) return digits;
  // 05xx xxx xx xx → 90 5xx...
  if (digits.startsWith('0') && digits.length === 11) return `9${digits}`;
  // 5xx xxx xx xx → 90 5xx...
  if (digits.length === 10) return `90${digits}`;
  // Diğer ülke kodları — olduğu gibi bırak
  return digits;
}

/** WhatsApp sohbet linki (opsiyonel hazır mesajla); numara çözülemezse null. */
export function buildWhatsAppUrl(phone: string | null | undefined, text?: string): string | null {
  const normalized = normalizePhoneForWa(phone);
  if (!normalized) return null;
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${normalized}${query}`;
}

/** Telefon araması linki. */
export function buildTelUrl(phone: string | null | undefined): string | null {
  const cleaned = (phone ?? '').replace(/[^+\d]/g, '');
  return cleaned.length >= 7 ? `tel:${cleaned}` : null;
}
