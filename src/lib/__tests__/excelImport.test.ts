/**
 * Excel import tests - Bug #4
 */

// Mock all heavy dependencies that excelImport.ts imports
jest.mock('@/hooks/useSettings', () => ({
  getCurrentCurrency: () => ({ code: 'TRY', symbol: '₺', locale: 'tr-TR' }),
  getCurrentDateFormat: () => ({ code: 'DMY', example: '31/12/2024', separator: '/' }),
}));

jest.mock('@/constants/currencies', () => ({
  getCurrencySymbol: (code: string) => code,
  isPreciousMetal: () => false,
  CURRENCIES: [],
}));

// Mock expo-crypto
const mockDigestStringAsync = jest.fn();
jest.mock('expo-crypto', () => ({
  digestStringAsync: mockDigestStringAsync,
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

import { calculateFileHash, parseKarsiHesap } from '../excelImport';

// ============================================================================
// Bug #4: File hash fallback collision riski
// ============================================================================
describe('Bug #4: calculateFileHash', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should produce consistent hash for same content', async () => {
    mockDigestStringAsync.mockResolvedValue('abc123def456');
    const buffer = new Uint8Array([1, 2, 3, 4, 5]).buffer;

    const hash1 = await calculateFileHash(buffer);
    const hash2 = await calculateFileHash(buffer);

    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different content', async () => {
    mockDigestStringAsync
      .mockResolvedValueOnce('hash-for-content-1')
      .mockResolvedValueOnce('hash-for-content-2');

    const buffer1 = new Uint8Array([1, 2, 3, 4, 5]).buffer;
    const buffer2 = new Uint8Array([1, 2, 3, 4, 6]).buffer;

    const hash1 = await calculateFileHash(buffer1);
    const hash2 = await calculateFileHash(buffer2);

    expect(hash1).not.toBe(hash2);
  });

  it('should return a non-empty string', async () => {
    mockDigestStringAsync.mockResolvedValue('abc123');
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    const hash = await calculateFileHash(buffer);

    expect(hash).toBeTruthy();
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('should handle empty buffer', async () => {
    mockDigestStringAsync.mockResolvedValue('e3b0c44298fc1c149afb');
    const buffer = new ArrayBuffer(0);
    const hash = await calculateFileHash(buffer);

    expect(hash).toBeTruthy();
  });

  it('should not return timestamp-based fallback on success', async () => {
    mockDigestStringAsync.mockResolvedValue('proper-sha256-hash');
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    const hash = await calculateFileHash(buffer);

    expect(hash).not.toMatch(/^fallback-/);
  });
});

// ============================================================================
// A2b: Köşeli parantez tutarı — kur TÜRETİMİNİN girdisi (para yazma yolu)
//
// useDataImport bu tutarı ana tutarla oranlayarak exchange_rate ÜRETİYOR. Yani
// buradaki ayraç hatası doğrudan DB'ye yanlış kur, dolayısıyla yanlış bakiye yazar.
// Testler tr-TR locale mock'u altında koşuyor (dosyanın başındaki getCurrentCurrency).
// ============================================================================
describe('A2b: parseKarsiHesap tutar ayrıştırması', () => {
  it('Türk biçimi: binlik nokta + ondalık virgül', () => {
    expect(parseKarsiHesap('Nakit (Kasa) [58.750,00 TRY]')).toEqual({
      name: 'Nakit (Kasa)',
      amount: 58750,
      currency: 'TRY',
    });
  });

  it('İngiliz biçimi ARTIK eşleşiyor: eski desen tek ayraç grubu istediği için "1,234.56" hiç yakalanmıyordu', () => {
    expect(parseKarsiHesap('Vadesiz USD [1,234.56 USD]')).toEqual({
      name: 'Vadesiz USD',
      amount: 1234.56,
      currency: 'USD',
    });
  });

  it('binlikli tam sayı ondalığa düşmüyor ("1.234" → 1234, eski hâlde 1,234)', () => {
    expect(parseKarsiHesap('Kasa [1.234 TRY]').amount).toBe(1234);
  });

  it('negatif bracket tutarı mutlak değere çevrilir (yön tipten geliyor)', () => {
    expect(parseKarsiHesap('Nakit (Kasa) [-58750 TRY]')).toEqual({
      name: 'Nakit (Kasa)',
      amount: 58750,
      currency: 'TRY',
    });
  });

  it('yalın ondalık: virgül de nokta da ondalık olarak okunur', () => {
    expect(parseKarsiHesap('X [12,50 TRY]').amount).toBe(12.5);
    expect(parseKarsiHesap('X [12.50 TRY]').amount).toBe(12.5);
  });

  it('birim yoksa TRY varsayılır', () => {
    expect(parseKarsiHesap('Kasa [100]')).toEqual({ name: 'Kasa', amount: 100, currency: 'TRY' });
  });

  it('okunamayan tutar 0 DEĞİL: amount hiç dönmez (0 "bedelsiz işlem" gibi görünürdü)', () => {
    const parsed = parseKarsiHesap('Kasa [,. TRY]');
    expect(parsed.name).toBe('Kasa');
    expect(parsed.amount).toBeUndefined();
    // Tüketici `parsed.amount ? ...` ile kontrol ediyor → bracket yok sayılır, satır
    // yine içe aktarılır (yalnız çapraz-kur bilgisi olmadan).
  });

  it('parantez yoksa yalnız ad döner', () => {
    expect(parseKarsiHesap('Ziraat Bankası')).toEqual({ name: 'Ziraat Bankası' });
    expect(parseKarsiHesap('')).toEqual({ name: '' });
  });
});
