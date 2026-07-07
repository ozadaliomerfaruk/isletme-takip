import {
  urunHareketYon,
  isAlisAilesi,
  isSatisAilesi,
  isIadeYon,
  aileNetIsaret,
} from '../urunHareket';

describe('urunHareketYon', () => {
  it('normal alış: cari_alis + giriş → alis', () => {
    expect(urunHareketYon('giris', 'cari_alis')).toBe('alis');
  });

  it('normal satış: cari_satis + çıkış → satis', () => {
    expect(urunHareketYon('cikis', 'cari_satis')).toBe('satis');
  });

  it('personel satışı: personel_satis + çıkış → satis', () => {
    expect(urunHareketYon('cikis', 'personel_satis')).toBe('satis');
  });

  // Kullanıcının bildirdiği bug: alış iadesi (stok ÇIKIŞI) yanlışça "satış" görünüyordu
  it('ALIŞ İADESİ: cari_alis_iade stok çıkışıdır ama satış DEĞİL → alis_iade', () => {
    expect(urunHareketYon('cikis', 'cari_alis_iade')).toBe('alis_iade');
  });

  it('SATIŞ İADESİ: cari_satis_iade stok girişidir ama alış DEĞİL → satis_iade', () => {
    expect(urunHareketYon('giris', 'cari_satis_iade')).toBe('satis_iade');
  });

  it('düzeltme her zaman duzeltme (islemType ne olursa olsun)', () => {
    expect(urunHareketYon('duzeltme', null)).toBe('duzeltme');
    expect(urunHareketYon('duzeltme', 'cari_alis')).toBe('duzeltme');
  });

  it('manuel stok (islemType yok) → stok yönüne düşer: giriş=alis, çıkış=satis', () => {
    expect(urunHareketYon('giris', null)).toBe('alis');
    expect(urunHareketYon('cikis', null)).toBe('satis');
    expect(urunHareketYon('giris', undefined)).toBe('alis');
  });

  it('ürünle ilgisiz bir tip (ör. gider/gelir) → stok yönüne düşer', () => {
    expect(urunHareketYon('giris', 'gider')).toBe('alis');
    expect(urunHareketYon('cikis', 'gelir')).toBe('satis');
  });
});

describe('aile yardımcıları', () => {
  it('isAlisAilesi: alış ve alış iadesi ALIŞ ailesindedir', () => {
    expect(isAlisAilesi('alis')).toBe(true);
    expect(isAlisAilesi('alis_iade')).toBe(true);
    expect(isAlisAilesi('satis')).toBe(false);
    expect(isAlisAilesi('satis_iade')).toBe(false);
  });

  it('isSatisAilesi: satış ve satış iadesi SATIŞ ailesindedir', () => {
    expect(isSatisAilesi('satis')).toBe(true);
    expect(isSatisAilesi('satis_iade')).toBe(true);
    expect(isSatisAilesi('alis')).toBe(false);
  });

  it('isIadeYon: yalnız iadeler', () => {
    expect(isIadeYon('alis_iade')).toBe(true);
    expect(isIadeYon('satis_iade')).toBe(true);
    expect(isIadeYon('alis')).toBe(false);
    expect(isIadeYon('duzeltme')).toBe(false);
  });
});

describe('aileNetIsaret', () => {
  it('alış/satış aileyi artırır (+1)', () => {
    expect(aileNetIsaret('alis')).toBe(1);
    expect(aileNetIsaret('satis')).toBe(1);
  });

  it('iadeler aileyi azaltır (-1) — alış iadesi ALIŞ, satış iadesi SATIŞ tarafından düşer', () => {
    expect(aileNetIsaret('alis_iade')).toBe(-1);
    expect(aileNetIsaret('satis_iade')).toBe(-1);
  });

  it('düzeltme aileye yazılmaz (0)', () => {
    expect(aileNetIsaret('duzeltme')).toBe(0);
  });
});
