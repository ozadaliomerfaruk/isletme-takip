import { parseQuantity, roundQuantity } from '@/lib/currency';

/**
 * Boş miktar hızlı giriş kolaylığı için 1'dir; açıkça yazılan 0 ise geçersizdir.
 * `parseQuantity(value) || 1` kullanmak 0'ı yanlışlıkla 1'e dönüştürür.
 */
export function resolveProductQuantityInput(value: string): number | null {
  const parsed = parseQuantity(value.trim() || '1');
  if (!Number.isFinite(parsed)) return null;

  const rounded = roundQuantity(parsed);
  return rounded > 0 ? rounded : null;
}
