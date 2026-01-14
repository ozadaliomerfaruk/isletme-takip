/**
 * Tip Tanımları - Merkezi Export
 *
 * TÜM TİPLER database.ts'DEN GELİR
 * Bu dosya sadece geriye dönük uyumluluk için re-export yapar.
 *
 * YENİ KODLARDA DOĞRUDAN @/types/database KULLANIN
 *
 * @deprecated Doğrudan @/types/database import edin
 */

// ============================================================================
// ANA TİPLER - database.ts'den re-export
// ============================================================================

export type {
  // Temel tipler
  HesapType,
  CariType,
  IslemType,
  KategoriType,
  Currency,

  // İşletme
  Isletme,
  IsletmeInsert,
  IsletmeUpdate,

  // Hesap
  Hesap,
  HesapInsert,
  HesapUpdate,

  // Kategori
  Kategori,
  KategoriInsert,
  KategoriUpdate,
  KategoriWithChildren,

  // Cari
  Cari,
  CariInsert,
  CariUpdate,

  // Personel
  Personel,
  PersonelInsert,
  PersonelUpdate,

  // İşlem
  Islem,
  IslemInsert,
  IslemUpdate,
  IslemWithRelations,

  // İleri Tarihli İşlem
  IleriTarihliIslem,
  IleriTarihliIslemInsert,
  IleriTarihliIslemUpdate,
  IleriTarihliIslemWithRelations,
  IleriTarihliIslemStatus,

  // Nakit Avans
  NakitAvans,
  NakitAvansInsert,
  NakitAvansUpdate,
  NakitAvansWithRelations,
  NakitAvansStatus,
  NakitAvansTaksit,
  NakitAvansTaksitInsert,
  NakitAvansTaksitUpdate,
  TaksitStatus,

  // Çek
  Cek,
  CekInsert,
  CekUpdate,
  CekWithRelations,
  CekDurum,

  // Pending İşlem (Import)
  PendingIslem,
  PendingIslemInsert,
  PendingIslemUpdate,
  PendingIslemRawData,
  PendingIslemCorrections,
  PendingIslemStatus,

  // Dashboard
  DashboardSummary,

  // Database
  Database,
} from './database';

// ============================================================================
// DEPRECATED - Eski Form Input Tipleri
// Bunlar artık kullanılmıyor, *Insert tipleri kullanılmalı
// ============================================================================

/** @deprecated HesapInsert kullanın */
export interface HesapInput {
  name: string;
  type: 'nakit' | 'banka' | 'kredi_karti';
  balance?: number;
  currency?: string;
}

/** @deprecated CariInsert kullanın */
export interface CariInput {
  name: string;
  type: 'tedarikci' | 'musteri';
  phone?: string;
  balance?: number;
  balance_type?: 'biz_borcluyuz' | 'o_bize_borclu';
}

/** @deprecated PersonelInsert kullanın */
export interface PersonelInput {
  first_name: string;
  last_name: string;
  phone?: string;
  position?: string;
  salary?: number;
}

/** @deprecated IslemInsert kullanın */
export interface IslemInput {
  type: 'gelir' | 'gider' | 'transfer' | 'odeme' | 'tahsilat' | 'alis' | 'satis';
  amount: number;
  date: string;
  description?: string;
  hesap_id?: string;
  hesap_hedef_id?: string;
  cari_id?: string;
  personel_id?: string;
  kategori_id?: string;
}

/** @deprecated KategoriInsert kullanın */
export interface KategoriInput {
  name: string;
  type: 'gelir' | 'gider';
  icon?: string;
  color?: string;
}

// ============================================================================
// DEPRECATED - Eski Modeller (geriye dönük uyumluluk)
// ============================================================================

/** @deprecated Isletme kullanın */
export interface Restaurant {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  tax_number?: string;
  tax_office?: string;
  owner_id: string;
  settings?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

/** @deprecated Kullanılmıyor */
export interface Profile {
  id: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}
