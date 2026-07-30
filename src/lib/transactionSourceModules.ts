import type { IslemType } from '@/types/database';
import type { ModuleName } from '@/types/multiUser';

export type TransactionSourceModule = Extract<
  ModuleName,
  'hesaplar' | 'cariler' | 'personel' | 'urunler'
>;

const TYPE_SOURCE_MODULES: Readonly<Record<IslemType, readonly TransactionSourceModule[]>> = {
  gelir: ['hesaplar'],
  gider: ['hesaplar'],
  transfer: ['hesaplar'],
  cari_alis: ['cariler'],
  cari_satis: ['cariler'],
  cari_odeme: ['cariler'],
  cari_tahsilat: ['cariler'],
  cari_alis_iade: ['cariler'],
  cari_satis_iade: ['cariler'],
  personel_gider: ['personel'],
  // Hesap, personel ödeme/tahsilatında para kaynağıdır; Personel modülü
  // açıkken bakiye içermeyen hesap referansı seçilebilmesi bilinçli istisnadır.
  // Hesaplar açıksa picker bakiyeyi de gösterir, fakat mutation için ikinci bir
  // modül şartı oluşturmaz.
  personel_odeme: ['personel'],
  personel_tahsilat: ['personel'],
  personel_satis: ['personel'],
  personel_izin_hakki: ['personel'],
  personel_izin_kullanimi: ['personel'],
};

const PRODUCT_TRANSACTION_TYPES = new Set<IslemType>([
  'gelir',
  'gider',
  'cari_alis',
  'cari_satis',
  'cari_alis_iade',
  'cari_satis_iade',
]);

/**
 * Returns the source modules touched by a transaction type.
 *
 * The input is intentionally `unknown`: values ultimately originate outside
 * TypeScript. Unknown/new types stay fail-closed until this allowlist and its
 * tests are updated together.
 */
export function getTransactionSourceModules(
  type: unknown,
): readonly TransactionSourceModule[] | null {
  if (
    typeof type !== 'string'
    || !Object.prototype.hasOwnProperty.call(TYPE_SOURCE_MODULES, type)
  ) {
    return null;
  }

  return TYPE_SOURCE_MODULES[type as IslemType];
}

/** Product payloads are valid only for the explicitly supported financial families. */
export function isProductTransactionType(type: unknown): type is IslemType {
  return typeof type === 'string'
    && PRODUCT_TRANSACTION_TYPES.has(type as IslemType);
}

/** Combines old/new transaction types without weakening either type's gate. */
export function mergeTransactionSourceModules(
  types: readonly unknown[],
  additionalModules: readonly TransactionSourceModule[] = [],
): readonly TransactionSourceModule[] | null {
  const modules = new Set<TransactionSourceModule>(additionalModules);

  for (const type of types) {
    const required = getTransactionSourceModules(type);
    if (!required) return null;
    for (const module of required) modules.add(module);
  }

  return [...modules];
}

/**
 * Checks only source-module visibility. Mutation action/ownership belongs to
 * the `islemler` capability and must be evaluated separately.
 */
export function canAccessTransactionSources(
  types: readonly unknown[],
  canAccessModule: (module: TransactionSourceModule) => boolean,
  additionalModules: readonly TransactionSourceModule[] = [],
): boolean {
  const modules = mergeTransactionSourceModules(types, additionalModules);
  return !!modules && modules.every((module) => canAccessModule(module));
}
