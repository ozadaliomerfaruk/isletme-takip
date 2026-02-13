/**
 * Cari Sharing (Cari Paylasim) Tip Tanimlari - v2
 *
 * Tek yonlu paylasim modeli:
 * Bir isletme (owner) bir carisini baska bir isletmeye (viewer) paylasir.
 * Viewer, paylasilan cari'yi kendi listesinde gorur.
 */

import { Cari, CariType, Currency, Isletme } from '@/types/database';

// ============================================================================
// ERISIM SEVIYESI
// ============================================================================

export type SharingPermission = 'view' | 'full';

// ============================================================================
// CARI SHARE CODE - Paylasim Kodu
// ============================================================================

export interface CariShareCode {
  id: string;
  cari_id: string;
  isletme_id: string;
  code: string;
  permission: SharingPermission;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_by_isletme_id: string | null;
}

// ============================================================================
// CARI LINK - Tek Yonlu Paylasim
// ============================================================================

export interface CariLink {
  id: string;
  cari_id: string;
  owner_isletme_id: string;
  viewer_isletme_id: string;
  viewer_type: CariType;
  permission: SharingPermission;
  created_at: string;
}

/**
 * Iliskili verilerle birlikte cari eslesmesi
 */
export interface CariLinkWithDetails extends CariLink {
  cari?: Pick<Cari, 'id' | 'name' | 'balance' | 'currency' | 'type'>;
  owner_isletme?: Pick<Isletme, 'id' | 'name'>;
  viewer_isletme?: Pick<Isletme, 'id' | 'name'>;
}

// ============================================================================
// MUTATION INPUT TIPLERI
// ============================================================================

export interface GenerateShareCodeInput {
  cari_id: string;
  permission: SharingPermission;
}

export interface AcceptShareCodeInput {
  code: string;
  viewer_type: CariType;
}

export interface RemoveCariLinkInput {
  link_id: string;
}

// ============================================================================
// RPC YANIT TIPLERI
// ============================================================================

export interface GenerateShareCodeResponse {
  code: string;
  expires_at: string;
}

export interface AcceptShareCodeResponse {
  link_id: string;
}

/**
 * Cari link durumu kontrolu icin
 */
export interface CariLinkStatus {
  is_linked: boolean;
  link: CariLinkWithDetails | null;
  permission: SharingPermission | null;
  is_owner: boolean;
}
