// Temel tipler
export type HesapType = 'nakit' | 'banka' | 'kredi_karti';
export type CariType = 'tedarikci' | 'musteri';
export type IslemType = 'gelir' | 'gider' | 'transfer' | 'odeme' | 'tahsilat' | 'alis' | 'satis';
export type KategoriType = 'gelir' | 'gider';

// Veritabanı modelleri
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

export interface Profile {
  id: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Hesap {
  id: string;
  restaurant_id: string;
  name: string;
  type: HesapType;
  currency: string;
  balance: number;
  is_active: boolean;
  include_in_total: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface Cari {
  id: string;
  restaurant_id: string;
  name: string;
  type: CariType;
  phone?: string;
  email?: string;
  address?: string;
  tax_number?: string;
  tax_office?: string;
  balance: number;
  is_active: boolean;
  include_in_total: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface Personel {
  id: string;
  restaurant_id: string;
  first_name: string;
  last_name: string;
  phone?: string;
  email?: string;
  position?: string;
  start_date?: string;
  salary?: number;
  balance: number;
  is_active: boolean;
  include_in_total: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface Kategori {
  id: string;
  restaurant_id: string;
  name: string;
  type: KategoriType;
  parent_id?: string;
  icon?: string;
  color?: string;
  sort_order: number;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface Islem {
  id: string;
  restaurant_id: string;
  type: IslemType;
  amount: number;
  date: string;
  description?: string;
  hesap_id?: string;
  hesap_hedef_id?: string;
  cari_id?: string;
  personel_id?: string;
  kategori_id?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  // İlişkili veriler (join ile gelir)
  hesap?: Hesap;
  hesap_hedef?: Hesap;
  cari?: Cari;
  personel?: Personel;
  kategori?: Kategori;
}

// Form input tipleri
export interface HesapInput {
  name: string;
  type: HesapType;
  balance?: number;
  currency?: string;
}

export interface CariInput {
  name: string;
  type: CariType;
  phone?: string;
  balance?: number;
  balance_type?: 'biz_borcluyuz' | 'o_bize_borclu';
}

export interface PersonelInput {
  first_name: string;
  last_name: string;
  phone?: string;
  position?: string;
  salary?: number;
}

export interface IslemInput {
  type: IslemType;
  amount: number;
  date: string;
  description?: string;
  hesap_id?: string;
  hesap_hedef_id?: string;
  cari_id?: string;
  personel_id?: string;
  kategori_id?: string;
}

export interface KategoriInput {
  name: string;
  type: KategoriType;
  icon?: string;
  color?: string;
}

// Dashboard özet tipleri
export interface DashboardSummary {
  totalBalance: number;
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  totalReceivables: number; // Alacaklar
  totalPayables: number; // Borçlar
}
