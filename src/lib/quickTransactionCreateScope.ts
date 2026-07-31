import type { TransactionType } from '@/components/transaction/TransactionTypeTabs';
import type { CariType, IslemType } from '@/types/database';
import { getTransactionSourceModules } from '@/lib/transactionSourceModules';

export type QuickTransactionCreateScope = 'hesap' | 'cari' | 'personel';
export type QuickTransactionMinimalAccountScope = Exclude<
  QuickTransactionCreateScope,
  'hesap'
>;

export function getCariTypeForApiTransactionType(
  type: unknown,
): CariType | null {
  switch (type) {
    case 'cari_odeme':
    case 'cari_alis_iade':
      return 'tedarikci';
    case 'cari_tahsilat':
    case 'cari_satis_iade':
      return 'musteri';
    default:
      return null;
  }
}

export function getQuickTransactionScopeForApiType(
  type: unknown,
): QuickTransactionCreateScope | null {
  const modules = getTransactionSourceModules(type);
  if (!modules || modules.length !== 1) return null;
  switch (modules[0]) {
    case 'hesaplar':
      return 'hesap';
    case 'cariler':
      return 'cari';
    case 'personel':
      return 'personel';
    default:
      return null;
  }
}

export function canUseMinimalAccountRefs({
  requestedScope,
  mode,
  transactionId,
  copySourceId,
  defaultCariId,
  defaultPersonelId,
  isViewer,
  isScheduledTransaction,
}: {
  requestedScope?: QuickTransactionMinimalAccountScope;
  mode: 'create' | 'edit';
  transactionId?: string;
  copySourceId?: string;
  defaultCariId?: string;
  defaultPersonelId?: string;
  isViewer?: boolean;
  isScheduledTransaction?: boolean;
}): boolean {
  const hasFixedEntity =
    requestedScope === 'cari'
      ? !!defaultCariId
      : requestedScope === 'personel'
        ? !!defaultPersonelId
        : false;

  return !!requestedScope
    && !copySourceId
    && hasFixedEntity
    && !isViewer
    && (
      (mode === 'create' && !transactionId)
      || (
        mode === 'edit'
        && !!transactionId
        && !isScheduledTransaction
      )
    );
}

/**
 * Geriye dönük uyumluluk: eski Cariler çağrıları yeni ortak bakiye-siz hesap
 * referansı kararına yönlendirilir.
 */
export function canUseCariMinimalAccountRefs({
  requested,
  ...options
}: Omit<
  Parameters<typeof canUseMinimalAccountRefs>[0],
  'requestedScope' | 'defaultPersonelId'
> & {
  requested: boolean;
}): boolean {
  return canUseMinimalAccountRefs({
    ...options,
    requestedScope: requested ? 'cari' : undefined,
  });
}

const TEDARIKCI_CREATE_TYPES = [
  'alis',
  'satis',
  'odeme',
  'alis_iade',
] as const satisfies readonly TransactionType[];

const MUSTERI_CREATE_TYPES = [
  'satis',
  'alis',
  'tahsilat',
  'satis_iade',
] as const satisfies readonly TransactionType[];

const PERSONEL_CREATE_TYPES = [
  'personel_gider_tab',
  'personel_satis_tab',
  'personel_odeme_tab',
  'personel_tahsilat_tab',
  'personel_izin_hakki_tab',
  'personel_izin_kullanimi_tab',
] as const satisfies readonly TransactionType[];

const HESAP_CREATE_TYPES = [
  'gelir',
  'gider',
  'transfer',
] as const satisfies readonly TransactionType[];

const SCOPED_API_TYPE_BY_UI_TYPE: Readonly<
  Partial<Record<TransactionType, IslemType>>
> = {
  gelir: 'gelir',
  gider: 'gider',
  transfer: 'transfer',
  alis: 'cari_alis',
  satis: 'cari_satis',
  odeme: 'cari_odeme',
  tahsilat: 'cari_tahsilat',
  alis_iade: 'cari_alis_iade',
  satis_iade: 'cari_satis_iade',
  personel_gider_tab: 'personel_gider',
  personel_satis_tab: 'personel_satis',
  personel_odeme_tab: 'personel_odeme',
  personel_tahsilat_tab: 'personel_tahsilat',
  personel_izin_hakki_tab: 'personel_izin_hakki',
  personel_izin_kullanimi_tab: 'personel_izin_kullanimi',
};

export function getScopedQuickTransactionApiType(
  type: TransactionType,
): IslemType | null {
  return SCOPED_API_TYPE_BY_UI_TYPE[type] ?? null;
}

export function getScopedQuickTransactionCandidateTypes({
  scope,
  cariType,
}: {
  scope: QuickTransactionCreateScope;
  cariType?: CariType;
}): readonly TransactionType[] {
  if (scope === 'hesap') return HESAP_CREATE_TYPES;
  if (scope === 'personel') return PERSONEL_CREATE_TYPES;
  return cariType === 'tedarikci'
    ? TEDARIKCI_CREATE_TYPES
    : MUSTERI_CREATE_TYPES;
}

export function resolveScopedQuickTransactionDefaultType({
  scope,
  cariType,
  requestedType,
}: {
  scope: QuickTransactionCreateScope;
  cariType?: CariType;
  requestedType: TransactionType;
}): TransactionType {
  const candidates = getScopedQuickTransactionCandidateTypes({
    scope,
    cariType,
  });
  return candidates.includes(requestedType)
    ? requestedType
    : candidates[0];
}

/**
 * Returns only the tabs whose exact transaction source contract can be created.
 * Unknown/new UI types stay fail-closed until the UI-to-API map is extended.
 */
export function getAllowedScopedQuickTransactionTypes({
  scope,
  cariType,
  canCreateTransactionType,
}: {
  scope: QuickTransactionCreateScope;
  cariType?: CariType;
  canCreateTransactionType: (type: IslemType) => boolean;
}): TransactionType[] {
  const candidates = getScopedQuickTransactionCandidateTypes({
    scope,
    cariType,
  });

  return candidates.filter((type) => {
    const apiType = getScopedQuickTransactionApiType(type);
    return apiType !== null && canCreateTransactionType(apiType);
  });
}
