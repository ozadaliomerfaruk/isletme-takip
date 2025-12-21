// Supabase veritabanı şeması tipleri

export type HesapType = 'nakit' | 'banka' | 'kredi_karti' | 'diger';
export type CariType = 'musteri' | 'tedarikci';
export type KategoriType = 'gelir' | 'gider';
export type IslemType =
  | 'gelir'
  | 'gider'
  | 'transfer'
  | 'cari_alis'
  | 'cari_satis'
  | 'cari_odeme'
  | 'cari_tahsilat'
  | 'personel_gider'
  | 'personel_odeme';

// Veritabanı tabloları
export interface Database {
  public: {
    Tables: {
      isletmeler: {
        Row: Isletme;
        Insert: IsletmeInsert;
        Update: IsletmeUpdate;
      };
      hesaplar: {
        Row: Hesap;
        Insert: HesapInsert;
        Update: HesapUpdate;
      };
      kategoriler: {
        Row: Kategori;
        Insert: KategoriInsert;
        Update: KategoriUpdate;
      };
      cariler: {
        Row: Cari;
        Insert: CariInsert;
        Update: CariUpdate;
      };
      personel: {
        Row: Personel;
        Insert: PersonelInsert;
        Update: PersonelUpdate;
      };
      islemler: {
        Row: Islem;
        Insert: IslemInsert;
        Update: IslemUpdate;
      };
    };
  };
}

// İşletme
export interface Isletme {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  address: string | null;
  tax_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface IsletmeInsert {
  id?: string;
  user_id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  tax_number?: string | null;
}

export interface IsletmeUpdate {
  name?: string;
  phone?: string | null;
  address?: string | null;
  tax_number?: string | null;
}

// Hesap
export interface Hesap {
  id: string;
  isletme_id: string;
  name: string;
  type: HesapType;
  balance: number;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HesapInsert {
  id?: string;
  isletme_id: string;
  name: string;
  type: HesapType;
  balance?: number;
  description?: string | null;
  is_active?: boolean;
}

export interface HesapUpdate {
  name?: string;
  type?: HesapType;
  balance?: number;
  description?: string | null;
  is_active?: boolean;
}

// Kategori
export interface Kategori {
  id: string;
  isletme_id: string;
  name: string;
  type: KategoriType;
  icon: string | null;
  color: string | null;
  is_active: boolean;
  created_at: string;
}

export interface KategoriInsert {
  id?: string;
  isletme_id: string;
  name: string;
  type: KategoriType;
  icon?: string | null;
  color?: string | null;
  is_active?: boolean;
}

export interface KategoriUpdate {
  name?: string;
  type?: KategoriType;
  icon?: string | null;
  color?: string | null;
  is_active?: boolean;
}

// Cari
export interface Cari {
  id: string;
  isletme_id: string;
  name: string;
  type: CariType;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_number: string | null;
  balance: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CariInsert {
  id?: string;
  isletme_id: string;
  name: string;
  type: CariType;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  tax_number?: string | null;
  balance?: number;
  notes?: string | null;
  is_active?: boolean;
}

export interface CariUpdate {
  name?: string;
  type?: CariType;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  tax_number?: string | null;
  balance?: number;
  notes?: string | null;
  is_active?: boolean;
}

// Personel
export interface Personel {
  id: string;
  isletme_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  position: string | null;
  salary: number | null;
  balance: number;
  start_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PersonelInsert {
  id?: string;
  isletme_id: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  position?: string | null;
  salary?: number | null;
  balance?: number;
  start_date?: string | null;
  is_active?: boolean;
}

export interface PersonelUpdate {
  first_name?: string;
  last_name?: string;
  phone?: string | null;
  position?: string | null;
  salary?: number | null;
  balance?: number;
  start_date?: string | null;
  is_active?: boolean;
}

// İşlem
export interface Islem {
  id: string;
  isletme_id: string;
  type: IslemType;
  amount: number;
  description: string | null;
  date: string;
  hesap_id: string | null;
  hedef_hesap_id: string | null;
  kategori_id: string | null;
  cari_id: string | null;
  personel_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface IslemInsert {
  id?: string;
  isletme_id: string;
  type: IslemType;
  amount: number;
  description?: string | null;
  date?: string;
  hesap_id?: string | null;
  hedef_hesap_id?: string | null;
  kategori_id?: string | null;
  cari_id?: string | null;
  personel_id?: string | null;
}

export interface IslemUpdate {
  type?: IslemType;
  amount?: number;
  description?: string | null;
  date?: string;
  hesap_id?: string | null;
  hedef_hesap_id?: string | null;
  kategori_id?: string | null;
  cari_id?: string | null;
  personel_id?: string | null;
}

// İlişkili verilerle birlikte işlem
export interface IslemWithRelations extends Islem {
  hesap?: Hesap | null;
  hedef_hesap?: Hesap | null;
  kategori?: Kategori | null;
  cari?: Cari | null;
  personel?: Personel | null;
}

// Dashboard özet
export interface DashboardSummary {
  totalBalance: number;
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  totalReceivables: number;
  totalPayables: number;
}
