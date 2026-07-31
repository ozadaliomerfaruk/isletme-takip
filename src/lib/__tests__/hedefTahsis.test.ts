/**
 * Fatura-hedefli ödeme/tahsilat pointer kuralı — PARA YAZMA YOLU testleri.
 *
 * Neden test ediliyor: bu kural SESSİZ bozulma sınıfı. Pointer yanlış yazılırsa
 * (ör. düzenlemede) hiçbir hata çıkmaz — yalnız kullanıcının daha önce kurduğu
 * hedefleme kaybolur ya da ödeme başka bir borca kayar. Regresyon ancak "hangi
 * fatura kapandı?" diye bakıldığında fark edilir, o da genelde çok sonra.
 */

import { resolveHedefIslemId } from '../hedefTahsis';

const HEDEF = 'islem-42';

describe('resolveHedefIslemId — yazılan durumlar', () => {
  it('cari TAHSİLAT + create → pointer yazılır', () => {
    expect(
      resolveHedefIslemId({ isEditMode: false, hedefIslemId: HEDEF, type: 'tahsilat' })
    ).toBe(HEDEF);
  });

  it('TEDARİKÇİ ödemesi + create → pointer yazılır', () => {
    expect(
      resolveHedefIslemId({
        isEditMode: false,
        hedefIslemId: HEDEF,
        type: 'odeme',
        odemeHedefType: 'tedarikci',
      })
    ).toBe(HEDEF);
  });
});

describe('resolveHedefIslemId — yazılmayan durumlar', () => {
  it('DÜZENLEME: create-only kural — update_islem_atomik pointer bilmez, mevcut hedefleme korunmalı', () => {
    expect(
      resolveHedefIslemId({ isEditMode: true, hedefIslemId: HEDEF, type: 'tahsilat' })
    ).toBeNull();
    expect(
      resolveHedefIslemId({
        isEditMode: true,
        hedefIslemId: HEDEF,
        type: 'odeme',
        odemeHedefType: 'tedarikci',
      })
    ).toBeNull();
  });

  it('hedef yoksa (genel ödeme/tahsilat) → alan hiç eklenmez, SAF FIFO', () => {
    expect(resolveHedefIslemId({ isEditMode: false, type: 'tahsilat' })).toBeNull();
    expect(resolveHedefIslemId({ isEditMode: false, hedefIslemId: null, type: 'tahsilat' })).toBeNull();
    expect(resolveHedefIslemId({ isEditMode: false, hedefIslemId: '', type: 'tahsilat' })).toBeNull();
  });

  it('PERSONEL ödemesi → hedefleyebileceği cari faturası yok', () => {
    expect(
      resolveHedefIslemId({
        isEditMode: false,
        hedefIslemId: HEDEF,
        type: 'odeme',
        odemeHedefType: 'staff',
      })
    ).toBeNull();
  });

  it('personel tahsilati cari faturasi hedefleyemez', () => {
    expect(
      resolveHedefIslemId({
        isEditMode: false,
        hedefIslemId: HEDEF,
        type: 'tahsilat',
        tahsilatHedefType: 'personel',
      })
    ).toBeNull();
  });

  it('KREDİ KARTI ödemesi (API tarafında transfer) → pointer yazılmaz', () => {
    expect(
      resolveHedefIslemId({
        isEditMode: false,
        hedefIslemId: HEDEF,
        type: 'odeme',
        odemeHedefType: 'kredi_karti',
      })
    ).toBeNull();
  });

  it('odemeHedefType hiç verilmemiş "odeme" → yazılmaz (tedarikçi olduğu KANITLANMADI)', () => {
    expect(
      resolveHedefIslemId({ isEditMode: false, hedefIslemId: HEDEF, type: 'odeme' })
    ).toBeNull();
  });

  it('cari ödeme/tahsilat DIŞINDAKİ tipler → yazılmaz', () => {
    for (const type of ['gelir', 'gider', 'transfer', 'alis', 'satis', 'alis_iade', 'satis_iade', 'personel_odeme_tab', 'personel_tahsilat_tab']) {
      expect(
        resolveHedefIslemId({ isEditMode: false, hedefIslemId: HEDEF, type })
      ).toBeNull();
    }
  });
});
