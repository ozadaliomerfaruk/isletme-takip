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

import { calculateFileHash } from '../excelImport';

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
