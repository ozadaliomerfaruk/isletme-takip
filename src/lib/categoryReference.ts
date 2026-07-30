import type { KategoriType } from '@/types/database';

const CATEGORY_TYPES = new Set<KategoriType>(['gelir', 'gider', 'urun']);

/**
 * Shared kategori secicisinin sunucudan alabildigi dar DTO.
 *
 * Icon/hiyerarsi/sahiplik/esleme/audit alanlari bilerek bu tipe dahil degildir.
 */
export interface KategoriSecimReferansi {
  id: string;
  name: string;
  type: KategoriType;
  color: string | null;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseKategoriSecimReferanslari(
  value: unknown,
): KategoriSecimReferansi[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid category picker reference response');
  }

  return value.map((row) => {
    if (!isRecord(row)) {
      throw new Error('Invalid category picker reference row');
    }

    const { id, name, type, color } = row;
    if (
      typeof id !== 'string'
      || id.length === 0
      || typeof name !== 'string'
      || name.length === 0
      || typeof type !== 'string'
      || !CATEGORY_TYPES.has(type as KategoriType)
      || (color !== null && typeof color !== 'string')
    ) {
      throw new Error('Invalid category picker reference row');
    }

    return {
      id,
      name,
      type: type as KategoriType,
      color,
    };
  });
}
