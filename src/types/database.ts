// Supabase veritabanı şeması tipleri

// 'diger' eski değer, 'birikim' yeni değer - backward compatibility için ikisi de destekleniyor
export type HesapType = 'nakit' | 'banka' | 'kredi_karti' | 'birikim' | 'diger';
export type CariType = 'musteri' | 'tedarikci';
export type KategoriType = 'gelir' | 'gider' | 'urun';
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
  | 'personel_izin_hakki'
  | 'personel_izin_kullanimi';

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

// İşletme sektörleri (onboarding'de seçilir; null = seçilmedi / eski kullanıcı)
export type IsletmeSector =
  | 'market_bakkal'
  | 'kafe_restoran'
  | 'berber_kuafor'
  | 'giyim_tekstil'
  | 'oto'
  | 'nalbur_insaat'
  | 'toptan_dagitim'
  | 'eczane'
  | 'serbest_meslek'
  | 'fotografci'
  | 'emlak'
  | 'diger';

// İşletme onboarding tercihleri (isletmeler.onboarding_prefs jsonb). PII-siz.
// NULL = eski kullanıcı / atlandı. (V2 anket alanları + adaptif modül katmanı
// geri alındı; sade akışta yalnızca sektör "Diğer" serbest metni saklanır.)
export interface OnboardingPrefs {
  sector_other?: string | null; // "Diğer" seçilince yazılan serbest metin
}

// İşletme
export interface Isletme {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  address: string | null;
  tax_number: string | null;
  sector: IsletmeSector | null;
  onboarding_prefs: OnboardingPrefs | null;
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
  sector?: IsletmeSector | null;
}

export interface IsletmeUpdate {
  name?: string;
  phone?: string | null;
  address?: string | null;
  tax_number?: string | null;
  sector?: IsletmeSector | null;
  onboarding_prefs?: OnboardingPrefs | null;
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
  card_last_four: string | null;
  card_network: string | null;
  payment_due_day: number | null; // Kredi kartı son ödeme günü (1-31)
  is_auto_created: boolean; // Sistem tarafından otomatik açıldı (onboarding Kasa'sı) — aktivasyon metriklerinde sayılmaz
  created_by: string | null;
  updated_by: string | null;
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
  card_last_four?: string | null;
  card_network?: string | null;
  payment_due_day?: number | null;
  is_auto_created?: boolean;
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
  card_last_four?: string | null;
  card_network?: string | null;
  payment_due_day?: number | null;
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
  mapped_gelir_kategori_id: string | null;
  mapped_gider_kategori_id: string | null;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
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
  mapped_gelir_kategori_id?: string | null;
  mapped_gider_kategori_id?: string | null;
  is_active?: boolean;
}

export interface KategoriUpdate {
  name?: string;
  type?: KategoriType;
  icon?: string | null;
  color?: string | null;
  parent_id?: string | null;
  mapped_gelir_kategori_id?: string | null;
  mapped_gider_kategori_id?: string | null;
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
  created_by: string | null;
  updated_by: string | null;
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
  end_date: string | null; // İşten çıkış tarihi
  is_active: boolean;
  is_archived: boolean;
  created_by: string | null;
  updated_by: string | null;
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
  end_date?: string | null;
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
  end_date?: string | null;
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
  // Fotoğraf
  photo_path: string | null;       // Storage path for receipt/document photo
  // İzin tarih aralığı
  date_end: string | null;         // İzin kullanımında bitiş tarihi (YYYY-MM-DD)
  // İleri tarihli işlem kaynağı (çift kayıt koruması)
  source_ileri_id: string | null;  // Bu işlem bir ileri tarihli işlemden oluştuysa kaynak satırın id'si
  created_by: string | null;
  updated_by: string | null;
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
  // Fotoğraf
  photo_path?: string | null;
  // İzin tarih aralığı
  date_end?: string | null;
  // İleri tarihli işlem kaynağı (çift kayıt koruması)
  source_ileri_id?: string | null;
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
  // Fotoğraf
  photo_path?: string | null;
  // İzin tarih aralığı
  date_end?: string | null;
}

// İlişkili verilerle birlikte işlem
export interface IslemWithRelations extends Islem {
  hesap?: Hesap | null;
  hedef_hesap?: Hesap | null;
  kategori?: Kategori | null;
  cari?: Cari | null;
  personel?: Personel | null;
  creator?: { display_name: string | null; email: string } | null;
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
// 'notified': edge function (process-scheduled-transactions) hatırlatma bildirimi
// gönderdikten sonra atadığı durum. Kullanıcı henüz tamamlamamıştır.
export type IleriTarihliIslemStatus = 'pending' | 'notified' | 'completed' | 'cancelled';

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
  created_by: string | null;
  updated_by: string | null;
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
  created_by: string | null;
  updated_by: string | null;
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

// ============ STOK YÖNETİMİ ============

export type BirimType =
  // Adet/Parça
  | 'adet' | 'parca' | 'cift' | 'takim'
  // Ağırlık
  | 'gram' | 'kg' | 'ton'
  // Hacim
  | 'ml' | 'lt'
  // Uzunluk/Alan/Hacim
  | 'cm' | 'm' | 'm2' | 'm3'
  // Ambalaj
  | 'paket' | 'kutu' | 'koli'
  // Tüketim
  | 'porsiyon';
export type UrunHareketTipi = 'giris' | 'cikis' | 'duzeltme';
export type KdvOrani = 0 | 1 | 10 | 20;

// Ürün
export interface Urun {
  id: string;
  isletme_id: string;
  ad: string;
  kod: string | null;
  birim: BirimType;
  miktar: number;
  alis_fiyati: number;
  satis_fiyati: number;
  kdv_orani: KdvOrani;
  currency: Currency;
  kategori_id: string | null;
  aciklama: string | null;
  is_active: boolean;
  is_archived: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UrunInsert {
  ad: string;
  kod?: string | null;
  birim?: BirimType;
  miktar?: number;
  alis_fiyati?: number;
  satis_fiyati?: number;
  kdv_orani?: KdvOrani;
  currency?: Currency;
  kategori_id?: string | null;
  aciklama?: string | null;
}

export interface UrunUpdate {
  ad?: string;
  kod?: string | null;
  birim?: BirimType;
  alis_fiyati?: number;
  satis_fiyati?: number;
  kdv_orani?: KdvOrani;
  currency?: Currency;
  kategori_id?: string | null;
  aciklama?: string | null;
  is_active?: boolean;
  is_archived?: boolean;
}

// Urun Hareket
export interface UrunHareket {
  id: string;
  isletme_id: string;
  urun_id: string;
  islem_id: string | null;
  hareket_tipi: UrunHareketTipi;
  miktar: number;
  birim_fiyat: number | null;
  kdv_orani: number | null;
  onceki_miktar: number | null;
  yeni_miktar: number | null;
  aciklama: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
}

export interface UrunHareketInsert {
  urun_id: string;
  islem_id?: string | null;
  hareket_tipi: UrunHareketTipi;
  miktar: number;
  birim_fiyat?: number | null;
  kdv_orani?: number | null;
  aciklama?: string | null;
  /** İş tarihi (geçmiş/ileri tarihli hareket). Verilmezse DB now() uygular.
   *  formatDateTimeForDB ile yerel tarih+offset olarak yazılmalı (aylık özet substring + görüntü doğru olsun). */
  created_at?: string;
}

export interface UrunHareketWithUrun extends UrunHareket {
  urun?: Urun;
}

// ============ ALIAS SİSTEMİ ============

export interface UrunAlias {
  id: string;
  isletme_id: string;
  urun_id: string;
  alias_name: string;
  alias_normalized: string;
  supplier_cari_id: string | null;
  usage_count: number;
  last_seen_at: string;
  status: 'confirmed' | 'pending';
  created_at: string;
}

export interface UrunAliasInsert {
  urun_id: string;
  alias_name: string;
  alias_normalized: string;
  supplier_cari_id?: string | null;
  status?: 'confirmed' | 'pending';
}

export interface CariAlias {
  id: string;
  isletme_id: string;
  cari_id: string;
  alias_name: string;
  alias_normalized: string;
  usage_count: number;
  last_seen_at: string;
  status: 'confirmed' | 'pending';
  created_at: string;
}

export interface CariAliasInsert {
  cari_id: string;
  alias_name: string;
  alias_normalized: string;
  status?: 'confirmed' | 'pending';
}

// ============ İRSALİYE BEKLEME SİSTEMİ ============

export type IrsaliyeStatus = 'pending' | 'linked' | 'cancelled';

export interface IrsaliyeRecord {
  id: string;
  isletme_id: string;
  cari_id: string | null;
  tarih: string;
  toplam_tutar: number;
  status: IrsaliyeStatus;
  linked_islem_id: string | null;
  belge_no: string | null;
  items: unknown; // JSONB - saved item snapshots
  photo_path: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface IrsaliyeRecordInsert {
  cari_id?: string | null;
  tarih?: string;
  toplam_tutar?: number;
  status?: IrsaliyeStatus;
  belge_no?: string | null;
  items?: unknown;
  photo_path?: string | null;
  notes?: string | null;
}

export interface IrsaliyeRecordUpdate {
  cari_id?: string | null;
  toplam_tutar?: number;
  status?: IrsaliyeStatus;
  linked_islem_id?: string | null;
  belge_no?: string | null;
  items?: unknown;
  notes?: string | null;
}

// Notlar (Notes)
export type NotEntityType = 'hesap' | 'cari' | 'personel' | 'personel_izin' | 'urun' | 'genel';

export interface Not {
  id: string;
  isletme_id: string;
  entity_type: NotEntityType;
  entity_id: string | null;
  content: string;
  is_completed: boolean;
  completed_at: string | null;
  reminder_date: string | null;
  photo_path: string | null;
  assigned_to_user: string | null;
  assigned_to_cari: string | null;
  assigned_to_personel: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export interface NotInsert {
  isletme_id: string;
  entity_type: NotEntityType;
  entity_id?: string | null;
  content: string;
  created_by?: string | null;
  is_completed?: boolean;
  reminder_date?: string | null;
  photo_path?: string | null;
  assigned_to_user?: string | null;
  assigned_to_cari?: string | null;
  assigned_to_personel?: string | null;
}

export interface NotUpdate {
  content?: string;
  updated_at?: string;
  is_completed?: boolean;
  completed_at?: string | null;
  reminder_date?: string | null;
  photo_path?: string | null;
  assigned_to_user?: string | null;
  assigned_to_cari?: string | null;
  assigned_to_personel?: string | null;
}
