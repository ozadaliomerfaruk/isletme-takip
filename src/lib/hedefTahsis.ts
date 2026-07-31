/**
 * FATURA-HEDEFLİ ÖDEME/TAHSİLAT — pointer yazma kuralı (TEK KAYNAK).
 *
 * Satır-swipe "öde / tahsil et" jesti, dokunulan faturanın id'sini QTB'ye
 * `hedefIslemId` olarak geçiriyor; kayıt anında bu id `islemler.hedef_islem_id`
 * pointer'ı olarak yazılıyor ve sunucu tahsisi O faturanın en erken açık
 * taksitinden başlatıyor (yoksa SAF FIFO).
 *
 * NİYET SAKLANIR, TUTAR SAKLANMAZ: pointer yalnızca "kullanıcı bu faturayı
 * kastetti" bilgisidir; ne kadarının kapandığını her zaman net-bakiye motoru
 * hesaplar. Bu yüzden pointer'ın YAZILDIĞI durumlar dar tutulmalı:
 *
 *  1. YALNIZ CREATE. Düzenlemede yazılmaz — update_islem_atomik hedef_islem_id
 *     bilmiyor; patch'e eklenirse mevcut pointer'ın üzerine yazılır ya da (alan
 *     tanınmadığı için) kayıt reddedilir. Edit'te pointer'a DOKUNULMAZ.
 *  2. YALNIZ cari tahsilat, ya da cari (tedarikçi) ödemesi. Personele/kredi
 *     kartına yapılan ödemenin hedefleyebileceği bir cari faturası yoktur;
 *     pointer oraya yazılırsa sunucu doğrulaması onu NULL'a düşürür (sessiz
 *     degrade) — yani yazmak en iyi hâlde gürültü, en kötü hâlde yanlış hedef.
 *
 * Kural buraya taşındı çünkü sessiz bozulma sınıfı: yanlışlıkla edit'te de
 * yazılsa hiçbir hata çıkmaz, yalnız eski hedefleme kaybolur. Saf fonksiyon →
 * jest ile kilitlenebilir.
 */

/** buildTransactionData'nın gördüğü UI tipi (alt küme; tam liste ../types). */
export type HedefTahsisIslemTipi = string;

export interface HedefTahsisKarari {
  isEditMode: boolean;
  /** Swipe jestinden gelen hedef fatura id'si (yoksa null/undefined). */
  hedefIslemId?: string | null;
  /** QTB'nin UI tipi ('tahsilat' | 'odeme' | 'transfer' | ...). */
  type: HedefTahsisIslemTipi;
  /** 'odeme' tipinde ödemenin kime yapıldığı ('tedarikci' | 'staff' | 'kredi_karti' | null). */
  odemeHedefType?: string | null;
  /** Personel tahsilati bir cari faturasi hedefleyemez. */
  tahsilatHedefType?: string | null;
}

/**
 * `hedef_islem_id` DB'ye yazılmalı mı?
 *
 * @returns yazılacaksa pointer id'si, yazılmayacaksa null (alan hiç eklenmez).
 */
export function resolveHedefIslemId(karar: HedefTahsisKarari): string | null {
  const {
    isEditMode,
    hedefIslemId,
    type,
    odemeHedefType,
    tahsilatHedefType,
  } = karar;

  if (isEditMode) return null;
  if (!hedefIslemId) return null;

  const cariTahsilat = type === 'tahsilat' && tahsilatHedefType !== 'personel';
  const cariOdemesi = type === 'odeme' && odemeHedefType === 'tedarikci';
  if (!cariTahsilat && !cariOdemesi) return null;

  return hedefIslemId;
}
