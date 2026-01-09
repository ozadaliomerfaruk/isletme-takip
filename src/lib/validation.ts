/**
 * Merkezi Validasyon Yönetimi
 *
 * Bu dosya form validasyonlarının tek kaynağıdır.
 * Yeni validasyon kuralı eklendiğinde sadece burası güncellenmelidir.
 *
 * KULLANIM KURALLARI:
 * - Form component'larında inline validasyon yazma
 * - Tüm validasyonlar bu dosyadaki fonksiyonları kullanmalı
 * - Hata mesajları Türkçe ve tutarlı olmalı
 */

import { parseCurrency, isValidAmount, isValidBalance } from './currency';

// ============================================================================
// TİP TANIMLAMALARI
// ============================================================================

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export type Validator<T = string> = (value: T) => ValidationResult;

// ============================================================================
// TEMEL VALİDATÖRLER
// ============================================================================

/**
 * Boş değer kontrolü
 */
export function required(value: string, fieldName: string = 'Bu alan'): ValidationResult {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return { isValid: false, error: `${fieldName} zorunludur` };
  }
  return { isValid: true };
}

/**
 * Minimum uzunluk kontrolü
 */
export function minLength(
  value: string,
  min: number,
  fieldName: string = 'Bu alan'
): ValidationResult {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length < min) {
    return { isValid: false, error: `${fieldName} en az ${min} karakter olmalıdır` };
  }
  return { isValid: true };
}

/**
 * Maximum uzunluk kontrolü
 */
export function maxLength(
  value: string,
  max: number,
  fieldName: string = 'Bu alan'
): ValidationResult {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length > max) {
    return { isValid: false, error: `${fieldName} en fazla ${max} karakter olmalıdır` };
  }
  return { isValid: true };
}

// ============================================================================
// PARA/TUTAR VALİDATÖRLERİ
// ============================================================================

/**
 * Geçerli tutar kontrolü (0'dan büyük)
 */
export function validAmount(value: string): ValidationResult {
  if (!isValidAmount(value)) {
    return { isValid: false, error: 'Geçerli bir tutar girin' };
  }
  return { isValid: true };
}

/**
 * Geçerli bakiye kontrolü (0 veya negatif de olabilir)
 */
export function validBalance(value: string): ValidationResult {
  if (!isValidBalance(value)) {
    return { isValid: false, error: 'Geçerli bir bakiye girin' };
  }
  return { isValid: true };
}

/**
 * Minimum tutar kontrolü
 */
export function minAmount(value: string, min: number): ValidationResult {
  const amount = parseCurrency(value);
  if (isNaN(amount) || amount < min) {
    return { isValid: false, error: `Tutar en az ${min} olmalıdır` };
  }
  return { isValid: true };
}

// ============================================================================
// SEÇİM VALİDATÖRLERİ
// ============================================================================

/**
 * Seçim yapılmış mı kontrolü (dropdown, picker vb.)
 */
export function requiredSelection(
  value: string | null | undefined,
  fieldName: string = 'Bu alan'
): ValidationResult {
  if (!value) {
    return { isValid: false, error: `${fieldName} seçin` };
  }
  return { isValid: true };
}

// ============================================================================
// İLETİŞİM VALİDATÖRLERİ
// ============================================================================

/**
 * E-posta format kontrolü
 */
export function validEmail(value: string): ValidationResult {
  if (!value?.trim()) {
    return { isValid: true }; // Boş değer için required kullanın
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(value.trim())) {
    return { isValid: false, error: 'Geçerli bir e-posta adresi girin' };
  }
  return { isValid: true };
}

/**
 * Telefon format kontrolü (Türkiye formatı)
 */
export function validPhone(value: string): ValidationResult {
  if (!value?.trim()) {
    return { isValid: true }; // Boş değer için required kullanın
  }

  // Sadece rakamları al
  const cleaned = value.replace(/\D/g, '');

  // 10 veya 11 haneli olmalı (5xx veya 05xx)
  if (cleaned.length !== 10 && cleaned.length !== 11) {
    return { isValid: false, error: 'Geçerli bir telefon numarası girin' };
  }

  return { isValid: true };
}

// ============================================================================
// FORM VALİDASYON YARDIMCILARI
// ============================================================================

/**
 * Birden fazla validatörü birleştir
 *
 * @example
 * const result = validate(name, [
 *   (v) => required(v, 'Ad'),
 *   (v) => minLength(v, 2, 'Ad'),
 * ]);
 */
export function validate(value: string, validators: Validator[]): ValidationResult {
  for (const validator of validators) {
    const result = validator(value);
    if (!result.isValid) {
      return result;
    }
  }
  return { isValid: true };
}

/**
 * Form alanlarını topluca validate et
 *
 * @example
 * const errors = validateFields({
 *   name: { value: name, validators: [(v) => required(v, 'Ad')] },
 *   amount: { value: amount, validators: [validAmount] },
 * });
 *
 * if (Object.keys(errors).length > 0) {
 *   setErrors(errors);
 *   return false;
 * }
 */
export function validateFields<T extends string>(
  fields: Record<T, { value: string; validators: Validator[] }>
): Record<T, string> {
  const errors = {} as Record<T, string>;

  for (const [key, field] of Object.entries(fields) as [T, { value: string; validators: Validator[] }][]) {
    const result = validate(field.value, field.validators);
    if (!result.isValid && result.error) {
      errors[key] = result.error;
    }
  }

  return errors;
}

// ============================================================================
// HAZIR VALİDASYON ŞEMALARI
// ============================================================================

/**
 * Cari oluşturma formu validasyonu
 */
export const cariValidators = {
  name: (value: string) =>
    validate(value, [
      (v) => required(v, 'Cari adı'),
      (v) => minLength(v, 2, 'Cari adı'),
    ]),
  phone: validPhone,
  email: validEmail,
};

/**
 * Personel oluşturma formu validasyonu
 */
export const personelValidators = {
  firstName: (value: string) =>
    validate(value, [
      (v) => required(v, 'Ad'),
      (v) => minLength(v, 2, 'Ad'),
    ]),
  lastName: (value: string) => {
    // Soyad opsiyonel, ama girilmişse en az 2 karakter olmalı
    if (!value?.trim()) {
      return { isValid: true };
    }
    return minLength(value, 2, 'Soyad');
  },
  phone: validPhone,
};

/**
 * Hesap oluşturma formu validasyonu
 */
export const hesapValidators = {
  name: (value: string) =>
    validate(value, [
      (v) => required(v, 'Hesap adı'),
      (v) => minLength(v, 2, 'Hesap adı'),
    ]),
  balance: validBalance,
};

/**
 * Kategori oluşturma formu validasyonu
 */
export const kategoriValidators = {
  name: (value: string) =>
    validate(value, [
      (v) => required(v, 'Kategori adı'),
      (v) => minLength(v, 2, 'Kategori adı'),
    ]),
};

/**
 * İşlem formu validasyonu
 */
export const islemValidators = {
  amount: validAmount,
  hesap: (value: string | null) => requiredSelection(value, 'Hesap'),
  cari: (value: string | null) => requiredSelection(value, 'Cari'),
  personel: (value: string | null) => requiredSelection(value, 'Personel'),
};
