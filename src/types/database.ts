// Supabase veritabanı şeması tipleri

// 'diger' eski değer, 'birikim' yeni değer - backward compatibility için ikisi de destekleniyor
export type HesapType = 'nakit' | 'banka' | 'kredi_karti' | 'birikim' | 'diger';
export type CariType = 'musteri' | 'tedarikci';
export type KategoriType = 'gelir' | 'gider';
export type Currency = 'TRY' | 'USD' | 'EUR' | 'GBP' | 'XAU' | 'XAG';
export type IslemType =
  | 'gelir'
  | 'gider'
  | 'transfer'
  | 'cari_alis'
  | 'cari_satis'
  | 'cari_odeme'
  | 'cari_tahsilat'
  | 'cari_alis_iade'
  | 'cari_satis_iade'
  | 'personel_gider'
  | 'personel_odeme'
  | 'personel_tahsilat'
  | 'personel_satis'
  | 'nakit_avans_taksit';

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
  scheduled_deletion_at: string | null;
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
  scheduled_deletion_at?: string | null;
}

// Hesap
export interface Hesap {
  id: string;
  isletme_id: string;
  name: string;
  type: HesapType;
  currency: Currency; // Para birimi (default: TRY)
  balance: number;
  initial_balance: number; // Hesap açılış bakiyesi
  description: string | null;
  credit_limit: number | null;
  is_active: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface HesapInsert {
  id?: string;
  isletme_id: string;
  name: string;
  type: HesapType;
  currency?: Currency; // Opsiyonel, verilmezse Supabase TRY atar
  balance?: number;
  initial_balance?: number; // Hesap açılış bakiyesi
  description?: string | null;
  credit_limit?: number | null;
  is_active?: boolean;
  is_archived?: boolean;
}

export interface HesapUpdate {
  name?: string;
  type?: HesapType;
  currency?: Currency;
  balance?: number;
  description?: string | null;
  credit_limit?: number | null;
  is_active?: boolean;
  is_archived?: boolean;
}

// Kategori
export interface Kategori {
  id: string;
  isletme_id: string;
  name: string;
  type: KategoriType;
  icon: string | null;
  color: string | null;
  parent_id: string | null;
  is_active: boolean;
  created_at: string;
}

// Kategori with children (for hierarchical display)
export interface KategoriWithChildren extends Kategori {
  children?: KategoriWithChildren[];
  parent?: Kategori | null;
}

export interface KategoriInsert {
  id?: string;
  isletme_id: string;
  name: string;
  type: KategoriType;
  icon?: string | null;
  color?: string | null;
  parent_id?: string | null;
  is_active?: boolean;
}

export interface KategoriUpdate {
  name?: string;
  type?: KategoriType;
  icon?: string | null;
  color?: string | null;
  parent_id?: string | null;
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
  currency: Currency;
  notes: string | null;
  is_active: boolean;
  is_archived: boolean;
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
  currency?: Currency;
  notes?: string | null;
  is_active?: boolean;
  is_archived?: boolean;
}

export interface CariUpdate {
  name?: string;
  type?: CariType;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  tax_number?: string | null;
  balance?: number;
  currency?: Currency;
  notes?: string | null;
  is_active?: boolean;
  is_archived?: boolean;
}

// Personel
export interface Personel {
  id: string;
  isletme_id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  position: string | null;
  salary: number | null;
  balance: number;
  currency: Currency;
  start_date: string | null;
  is_active: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface PersonelInsert {
  id?: string;
  isletme_id: string;
  first_name: string;
  last_name?: string | null;
  phone?: string | null;
  position?: string | null;
  salary?: number | null;
  balance?: number;
  currency?: Currency;
  start_date?: string | null;
  is_active?: boolean;
  is_archived?: boolean;
}

export interface PersonelUpdate {
  first_name?: string;
  last_name?: string | null;
  phone?: string | null;
  position?: string | null;
  salary?: number | null;
  balance?: number;
  currency?: Currency;
  start_date?: string | null;
  is_active?: boolean;
  is_archived?: boolean;
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
  // Çoklu para birimi desteği
  source_currency: string | null;  // Kaynak para birimi
  target_currency: string | null;  // Hedef para birimi
  exchange_rate: number | null;    // Dönüşüm kuru
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
  // Çoklu para birimi desteği
  source_currency?: string | null;
  target_currency?: string | null;
  exchange_rate?: number | null;
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
  // Çoklu para birimi desteği
  source_currency?: string | null;
  target_currency?: string | null;
  exchange_rate?: number | null;
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

// İleri Tarihli İşlem
export type IleriTarihliIslemStatus = 'pending' | 'completed' | 'cancelled';

export interface IleriTarihliIslem {
  id: string;
  isletme_id: string;
  type: IslemType;
  amount: number;
  description: string | null;
  scheduled_date: string;
  hesap_id: string | null;
  hedef_hesap_id: string | null;
  kategori_id: string | null;
  cari_id: string | null;
  personel_id: string | null;
  status: IleriTarihliIslemStatus;
  notified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IleriTarihliIslemInsert {
  id?: string;
  isletme_id: string;
  type: IslemType;
  amount: number;
  description?: string | null;
  scheduled_date: string;
  hesap_id?: string | null;
  hedef_hesap_id?: string | null;
  kategori_id?: string | null;
  cari_id?: string | null;
  personel_id?: string | null;
  status?: IleriTarihliIslemStatus;
}

export interface IleriTarihliIslemUpdate {
  type?: IslemType;
  amount?: number;
  description?: string | null;
  scheduled_date?: string;
  hesap_id?: string | null;
  hedef_hesap_id?: string | null;
  kategori_id?: string | null;
  cari_id?: string | null;
  personel_id?: string | null;
  status?: IleriTarihliIslemStatus;
}

export interface IleriTarihliIslemWithRelations extends IleriTarihliIslem {
  hesap?: Hesap | null;
  hedef_hesap?: Hesap | null;
  kategori?: Kategori | null;
  cari?: Cari | null;
  personel?: Personel | null;
}

// Nakit Avans
export type NakitAvansStatus = 'active' | 'completed' | 'cancelled';
export type TaksitStatus = 'pending' | 'paid' | 'overdue';

export interface NakitAvans {
  id: string;
  isletme_id: string;
  kredi_karti_id: string;
  hedef_hesap_id: string;
  tutar: number;
  geri_odeme_tutari: number;
  kategori_id: string | null;
  aciklama: string | null;
  tarih: string;
  is_taksitli: boolean;
  taksit_sayisi: number;
  status: NakitAvansStatus;
  created_at: string;
  updated_at: string;
}

export interface NakitAvansInsert {
  id?: string;
  isletme_id: string;
  kredi_karti_id: string;
  hedef_hesap_id: string;
  tutar: number;
  geri_odeme_tutari: number;
  kategori_id?: string | null;
  aciklama?: string | null;
  tarih?: string;
  is_taksitli?: boolean;
  taksit_sayisi?: number;
  status?: NakitAvansStatus;
}

export interface NakitAvansUpdate {
  tutar?: number;
  geri_odeme_tutari?: number;
  kategori_id?: string | null;
  aciklama?: string | null;
  tarih?: string;
  is_taksitli?: boolean;
  taksit_sayisi?: number;
  status?: NakitAvansStatus;
}

// Nakit Avans Taksit
export interface NakitAvansTaksit {
  id: string;
  nakit_avans_id: string;
  sira_no: number;
  tutar: number;
  odeme_tarihi: string;
  odenen_tarih: string | null;
  reminder_enabled: boolean;
  reminder_days_before: number;
  reminder_time: string;
  status: TaksitStatus;
  created_at: string;
  updated_at: string;
}

export interface NakitAvansTaksitInsert {
  id?: string;
  nakit_avans_id: string;
  sira_no: number;
  tutar: number;
  odeme_tarihi: string;
  odenen_tarih?: string | null;
  reminder_enabled?: boolean;
  reminder_days_before?: number;
  reminder_time?: string;
  status?: TaksitStatus;
}

export interface NakitAvansTaksitUpdate {
  tutar?: number;
  odeme_tarihi?: string;
  odenen_tarih?: string | null;
  reminder_enabled?: boolean;
  reminder_days_before?: number;
  reminder_time?: string;
  status?: TaksitStatus;
}

// İlişkili verilerle birlikte Nakit Avans
export interface NakitAvansWithRelations extends NakitAvans {
  kredi_karti?: Hesap | null;
  hedef_hesap?: Hesap | null;
  kategori?: Kategori | null;
  taksitler?: NakitAvansTaksit[];
}

// Çek (Verilen Çekler)
export type CekDurum = 'beklemede' | 'odendi' | 'iptal';

export interface Cek {
  id: string;
  isletme_id: string;
  hesap_id: string;
  cari_id: string;
  cek_no: string;
  tutar: number;
  kesim_tarihi: string;
  vade_tarihi: string;
  durum: CekDurum;
  odeme_tarihi: string | null;
  kategori_id: string | null;
  aciklama: string | null;
  notification_id: string | null;
  islem_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CekInsert {
  id?: string;
  isletme_id: string;
  hesap_id: string;
  cari_id: string;
  cek_no: string;
  tutar: number;
  kesim_tarihi?: string;
  vade_tarihi: string;
  durum?: CekDurum;
  odeme_tarihi?: string | null;
  kategori_id?: string | null;
  aciklama?: string | null;
  notification_id?: string | null;
  islem_id?: string | null;
}

export interface CekUpdate {
  cek_no?: string;
  tutar?: number;
  kesim_tarihi?: string;
  vade_tarihi?: string;
  durum?: CekDurum;
  odeme_tarihi?: string | null;
  kategori_id?: string | null;
  aciklama?: string | null;
  notification_id?: string | null;
  islem_id?: string | null;
}

export interface CekWithRelations extends Cek {
  hesap: Hesap;
  cari: Cari;
  kategori?: Kategori | null;
}

// Bekleyen İşlem (Import'tan atlanan işlemler)
export type PendingIslemStatus = 'pending' | 'saved' | 'dismissed';

/**
 * Raw data from Excel import - original parsed values
 */
export interface PendingIslemRawData {
  date: string;
  type: string;
  mappedType: string;
  description: string | null;
  category: string | null;
  account: string;
  personel: string | null;
  tedarikci: string | null;
  musteri: string | null;
  karsiHesap: string | null;
  amount: number;
  isExpense: boolean;
  rowNumber: number;
}

/**
 * User corrections for pending transaction
 */
export interface PendingIslemCorrections {
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

export interface PendingIslem {
  id: string;
  isletme_id: string;
  import_batch_id: string;
  row_number: number;
  skip_reason: string;
  raw_data: PendingIslemRawData;
  corrections: PendingIslemCorrections;
  status: PendingIslemStatus;
  created_at: string;
  updated_at: string;
}

export interface PendingIslemInsert {
  id?: string;
  isletme_id: string;
  import_batch_id: string;
  row_number: number;
  skip_reason: string;
  raw_data: PendingIslemRawData;
  corrections?: PendingIslemCorrections;
  status?: PendingIslemStatus;
}

export interface PendingIslemUpdate {
  corrections?: PendingIslemCorrections;
  status?: PendingIslemStatus;
}

// Döviz Kurları
export interface ExchangeRates {
  id: string;
  base_currency: string;
  rates: Record<string, number>; // {"USD": 32.5, "EUR": 35.2, ...} - 1 birim = X TRY
  updated_at: string;
  source: string;
  created_at: string;
}
