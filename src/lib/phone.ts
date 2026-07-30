/**
 * Telefon yardımcıları — Ara / WhatsApp kısayolları için.
 * Telefon alanı serbest metin girildiğinden (0555..., +90 555..., 555...)
 * WhatsApp'ın beklediği uluslararası biçime TR varsayımıyla katlanır.
 */

export const MAX_STORED_PHONE_LENGTH = 20;

export type PhoneNormalizationError = 'extension' | 'invalid' | 'tooLong';

export type PhoneNormalizationResult =
  | { ok: true; value: string | null }
  | { ok: false; reason: PhoneNormalizationError };

const PHONE_EXTENSION_PATTERN = /(?:\b(?:ext(?:ension)?|dahili)\b|[xX#;,])/i;
const PHONE_ALLOWED_CHARACTERS_PATTERN = /^[+\d\s().\-/]*$/;

/**
 * Cari/personel DB kolonları VARCHAR(20). Manuel giriş ile rehber seçimi aynı
 * kurala bağlanır:
 * - yalnız baştaki `+` ve rakamlar saklanır,
 * - yaygın görsel ayraçlar temizlenir,
 * - dahili/pause bilgisi sessizce kaybedilmez,
 * - DB sınırı RPC çağrısından önce doğrulanır.
 *
 * Ülke kodu tahmini yapılmaz. Örneğin 0532... yine 0532... olarak kalır; bu,
 * yabancı numaraları TR varsayımıyla yanlış dönüştürmemek içindir.
 */
export function normalizePhoneForStorage(
  phone: string | null | undefined,
): PhoneNormalizationResult {
  const trimmed = (phone ?? '').trim();
  if (!trimmed) return { ok: true, value: null };

  if (PHONE_EXTENSION_PATTERN.test(trimmed)) {
    return { ok: false, reason: 'extension' };
  }

  if (!PHONE_ALLOWED_CHARACTERS_PATTERN.test(trimmed)) {
    return { ok: false, reason: 'invalid' };
  }

  const plusMatches = trimmed.match(/\+/g) ?? [];
  const hasLeadingPlus = trimmed.startsWith('+');
  if (plusMatches.length > 1 || (plusMatches.length === 1 && !hasLeadingPlus)) {
    return { ok: false, reason: 'invalid' };
  }

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return { ok: false, reason: 'invalid' };

  const normalized = `${hasLeadingPlus ? '+' : ''}${digits}`;
  if (normalized.length > MAX_STORED_PHONE_LENGTH) {
    return { ok: false, reason: 'tooLong' };
  }

  return { ok: true, value: normalized };
}

/**
 * Düzenleme ekranlarında dokunulmamış legacy biçimi korur. Böylece kullanıcı
 * yalnız not/pozisyon gibi başka bir alanı değiştirirken telefon satırı
 * gereksiz yere normalize edilip yeniden yazılmaz.
 */
export function preparePhoneForSave(
  phone: string | null | undefined,
  originalPhone?: string | null,
): PhoneNormalizationResult {
  if (originalPhone !== undefined && (phone ?? '') === (originalPhone ?? '')) {
    return { ok: true, value: originalPhone };
  }
  return normalizePhoneForStorage(phone);
}

export function getPhoneValidationMessageKey(reason: PhoneNormalizationError): string {
  return `contactPicker.errors.${reason}`;
}

export type PhoneDuplicateEntityType = 'cari' | 'personel';

export interface PhoneDuplicateCariCandidate {
  id: string;
  name: string;
  phone: string | null | undefined;
}

export interface PhoneDuplicatePersonelCandidate {
  id: string;
  first_name: string;
  last_name: string | null | undefined;
  phone: string | null | undefined;
}

export interface PhoneDuplicateMatch {
  id: string;
  entityType: PhoneDuplicateEntityType;
  displayName: string;
}

export interface PhoneDuplicateExclusion {
  id: string;
  entityType: PhoneDuplicateEntityType;
}

interface FindPhoneDuplicateMatchesOptions {
  cariler?: ReadonlyArray<PhoneDuplicateCariCandidate> | null;
  personeller?: ReadonlyArray<PhoneDuplicatePersonelCandidate> | null;
  exclude?: PhoneDuplicateExclusion;
}

/**
 * İzin/tenant filtreli hook'lardan gelen görünür cari ve personel listelerinde
 * normalize telefon eşleşmesini bulur.
 *
 * Bu helper kendisi veri çekmez. Çağıran yalnız mevcut kullanıcının görebildiği,
 * aynı işletmeye ait listeleri vermelidir. Normalize edilemeyen legacy değerler
 * sessizce atlanır; uyarı hiçbir zaman kayıt engeline dönüşmez.
 */
export function findPhoneDuplicateMatches(
  phone: string | null | undefined,
  {
    cariler = [],
    personeller = [],
    exclude,
  }: FindPhoneDuplicateMatchesOptions,
): PhoneDuplicateMatch[] {
  const target = normalizePhoneForStorage(phone);
  if (!target.ok || !target.value) return [];

  const matches: PhoneDuplicateMatch[] = [];
  const seen = new Set<string>();

  const addIfMatch = (
    entityType: PhoneDuplicateEntityType,
    id: string,
    candidatePhone: string | null | undefined,
    displayName: string,
  ) => {
    if (exclude?.entityType === entityType && exclude.id === id) return;

    const normalized = normalizePhoneForStorage(candidatePhone);
    if (!normalized.ok || normalized.value !== target.value) return;

    const key = `${entityType}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    matches.push({
      id,
      entityType,
      displayName: displayName.trim(),
    });
  };

  for (const cari of cariler ?? []) {
    addIfMatch('cari', cari.id, cari.phone, cari.name);
  }

  for (const personel of personeller ?? []) {
    addIfMatch(
      'personel',
      personel.id,
      personel.phone,
      `${personel.first_name} ${personel.last_name ?? ''}`,
    );
  }

  return matches;
}

export interface PhoneDuplicateWarningCopy {
  title: string;
  message: string;
  confirmLabel: string;
}

/** Uyarı metnini, yeni i18n anahtarı gerektirmeden mevcut TR/EN uygulama dillerinde üretir. */
export function getPhoneDuplicateWarningCopy(
  matches: ReadonlyArray<PhoneDuplicateMatch>,
  language: string,
): PhoneDuplicateWarningCopy {
  const isEnglish = language.toLowerCase().startsWith('en');
  const shown = matches.slice(0, 3).map((match) => {
    const fallbackName = isEnglish
      ? match.entityType === 'cari' ? 'Unnamed client' : 'Unnamed staff'
      : match.entityType === 'cari' ? 'İsimsiz cari' : 'İsimsiz personel';
    const entityLabel = isEnglish
      ? match.entityType === 'cari' ? 'client' : 'staff'
      : match.entityType === 'cari' ? 'cari' : 'personel';
    return `${match.displayName || fallbackName} (${entityLabel})`;
  });
  const remaining = Math.max(0, matches.length - shown.length);

  if (isEnglish) {
    return {
      title: 'Phone number already in use',
      message: `This phone number is also used by these visible records: ${shown.join(', ')}${remaining > 0 ? ` and ${remaining} more` : ''}. Do you want to save anyway?`,
      confirmLabel: 'Save anyway',
    };
  }

  return {
    title: 'Telefon numarası zaten kullanılıyor',
    message: `Bu telefon numarası şu görünür kayıtlarda da kullanılıyor: ${shown.join(', ')}${remaining > 0 ? ` ve ${remaining} kayıt daha` : ''}. Yine de kaydetmek istiyor musunuz?`,
    confirmLabel: 'Yine de kaydet',
  };
}

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
