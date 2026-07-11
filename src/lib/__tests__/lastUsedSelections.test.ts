import {
  applyRecord,
  getLastUsedSelections,
  recordLastUsed,
  clearLastUsedSelections,
  type LastUsedSelections,
} from '../lastUsedSelections';

// Stateful in-memory AsyncStorage mock (global setup mock is stateless → returns null).
// Değişken adı jest factory hoisting için "mock" ön ekli olmalı.
const mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((k: string) => Promise.resolve(mockStore[k] ?? null)),
  setItem: jest.fn((k: string, v: string) => {
    mockStore[k] = v;
    return Promise.resolve();
  }),
  removeItem: jest.fn((k: string) => {
    delete mockStore[k];
    return Promise.resolve();
  }),
}));

const EMPTY: LastUsedSelections = {
  hesapByType: {},
  recentKategoriByFamily: {},
};

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
});

describe('applyRecord (pure)', () => {
  it('hesabı RAW işlem tipine göre kaydeder', () => {
    const r = applyRecord(EMPTY, { type: 'gelir', family: 'gelir', hesapId: 'h1', kategoriId: null });
    expect(r.hesapByType.gelir).toBe('h1');
    expect(r.recentKategoriByFamily).toEqual({});
  });

  it('kategoriyi aileye göre recents listesine ekler', () => {
    const r = applyRecord(EMPTY, { type: 'gider', family: 'gider', hesapId: null, kategoriId: 'k1' });
    expect(r.recentKategoriByFamily.gider).toEqual(['k1']);
    expect(r.hesapByType).toEqual({});
  });

  it('recents listesini tekilleştirir (öne taşır) ve 8 ile sınırlar', () => {
    let s: LastUsedSelections = EMPTY;
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']) {
      s = applyRecord(s, { type: 'gider', family: 'gider', kategoriId: id });
    }
    // en yeni önce, cap 8 → en eski 'a','b' düşer
    expect(s.recentKategoriByFamily.gider).toEqual(['j', 'i', 'h', 'g', 'f', 'e', 'd', 'c']);

    // var olanı yeniden kaydet → öne taşınır, dup olmaz
    s = applyRecord(s, { type: 'gider', family: 'gider', kategoriId: 'e' });
    expect(s.recentKategoriByFamily.gider[0]).toBe('e');
    expect(s.recentKategoriByFamily.gider.filter((x) => x === 'e')).toHaveLength(1);
  });

  it('null hesapId/kategoriId mevcut belleği EZMEZ', () => {
    let s = applyRecord(EMPTY, { type: 'gelir', family: 'gelir', hesapId: 'h1', kategoriId: 'k1' });
    s = applyRecord(s, { type: 'gelir', family: 'gelir', hesapId: null, kategoriId: null });
    expect(s.hesapByType.gelir).toBe('h1');
    expect(s.recentKategoriByFamily.gelir).toEqual(['k1']);
  });

  it('hesap RAW tipe, kategori aileye göre anahtarlanır (aynı aile → son kazanır)', () => {
    // satis ve gelir ikisi de "gelir" ailesi; hesaplar tipe göre ayrı tutulur
    let s = applyRecord(EMPTY, { type: 'satis', family: 'gelir', hesapId: 'hSatis', kategoriId: 'kA' });
    s = applyRecord(s, { type: 'gelir', family: 'gelir', hesapId: 'hGelir', kategoriId: 'kB' });
    expect(s.hesapByType.satis).toBe('hSatis');
    expect(s.hesapByType.gelir).toBe('hGelir');
    // aile paylaşımlı → recents en yeni önce; "son kategori" = recents[0]
    expect(s.recentKategoriByFamily.gelir).toEqual(['kB', 'kA']);
  });

  it('girdi nesnesini mutate ETMEZ', () => {
    const base = applyRecord(EMPTY, { type: 'gelir', family: 'gelir', hesapId: 'h1', kategoriId: 'k1' });
    const snapshot = JSON.parse(JSON.stringify(base));
    applyRecord(base, { type: 'gelir', family: 'gelir', hesapId: 'h2', kategoriId: 'k2' });
    expect(base).toEqual(snapshot);
  });

  it('family undefined ise recents yazılmaz (hesap yine yazılır)', () => {
    const r = applyRecord(EMPTY, { type: 'transfer', family: undefined, hesapId: 'h1', kategoriId: 'k1' });
    expect(r.hesapByType.transfer).toBe('h1');
    expect(r.recentKategoriByFamily).toEqual({});
  });
});

describe('storage round-trip (isletme_id namespace)', () => {
  it('bir işletme için kaydeder ve geri okur', async () => {
    await recordLastUsed('isl-1', { type: 'gelir', family: 'gelir', hesapId: 'h1', kategoriId: 'k1' });
    const got = await getLastUsedSelections('isl-1');
    expect(got.hesapByType.gelir).toBe('h1');
    expect(got.recentKategoriByFamily.gelir).toEqual(['k1']);
  });

  it('işletmeler arası veriyi izole eder (çapraz-kiracı sızıntı yok)', async () => {
    await recordLastUsed('isl-1', { type: 'gider', family: 'gider', hesapId: 'hA', kategoriId: 'kA' });
    await recordLastUsed('isl-2', { type: 'gider', family: 'gider', hesapId: 'hB', kategoriId: 'kB' });
    const a = await getLastUsedSelections('isl-1');
    const b = await getLastUsedSelections('isl-2');
    expect(a.hesapByType.gider).toBe('hA');
    expect(b.hesapByType.gider).toBe('hB');
  });

  it('null/undefined isletme için boş şekil döner', async () => {
    expect(await getLastUsedSelections(null)).toEqual(EMPTY);
    expect(await getLastUsedSelections(undefined)).toEqual(EMPTY);
  });

  it('isletme yoksa recordLastUsed no-op', async () => {
    await recordLastUsed(null, { type: 'gelir', family: 'gelir', hesapId: 'h1', kategoriId: 'k1' });
    expect(Object.keys(mockStore)).toHaveLength(0);
  });

  it('kaydedilecek anlamlı değer yoksa diske yazmaz', async () => {
    await recordLastUsed('isl-1', { type: 'gelir', family: 'gelir', hesapId: null, kategoriId: null });
    expect(Object.keys(mockStore)).toHaveLength(0);
  });

  it('clearLastUsedSelections işletme anahtarını siler', async () => {
    await recordLastUsed('isl-1', { type: 'gelir', family: 'gelir', hesapId: 'h1', kategoriId: 'k1' });
    expect(Object.keys(mockStore)).toHaveLength(1);
    await clearLastUsedSelections('isl-1');
    expect(await getLastUsedSelections('isl-1')).toEqual(EMPTY);
  });

  it('bozuk JSON’a karşı dayanıklı (boş şekil döner, throw etmez)', async () => {
    mockStore['@defter_last_used_isl-1'] = '{bozuk json';
    expect(await getLastUsedSelections('isl-1')).toEqual(EMPTY);
  });

  it('birden çok kayıt recents birikimini korur', async () => {
    await recordLastUsed('isl-1', { type: 'gider', family: 'gider', hesapId: 'h1', kategoriId: 'k1' });
    await recordLastUsed('isl-1', { type: 'gider', family: 'gider', hesapId: 'h2', kategoriId: 'k2' });
    const got = await getLastUsedSelections('isl-1');
    expect(got.hesapByType.gider).toBe('h2'); // son hesap
    expect(got.recentKategoriByFamily.gider).toEqual(['k2', 'k1']); // en yeni önce
  });
});
