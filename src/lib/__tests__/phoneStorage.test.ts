import {
  findPhoneDuplicateMatches,
  getPhoneDuplicateWarningCopy,
  MAX_STORED_PHONE_LENGTH,
  normalizePhoneForStorage,
  preparePhoneForSave,
} from '../phone';

describe('phone storage normalization', () => {
  it.each([
    ['+90 (532) 123 45 67', '+905321234567'],
    ['0532 123 45 67', '05321234567'],
    ['(555) 123-4567', '5551234567'],
    ['0044 20 7123 4567', '00442071234567'],
    ['  +1.415.555.0100  ', '+14155550100'],
  ])('normalizes visual separators without guessing a country code: %s', (input, expected) => {
    expect(normalizePhoneForStorage(input)).toEqual({ ok: true, value: expected });
  });

  it.each([null, undefined, '', '   '])('keeps an empty optional phone as null', (input) => {
    expect(normalizePhoneForStorage(input)).toEqual({ ok: true, value: null });
  });

  it.each([
    '0555 123 45 67 x12',
    '+90 555 123 45 67 ext 12',
    '0555 123 45 67 dahili 9',
    '05551234567#12',
    '05551234567,12',
    '05551234567;12',
  ])('does not silently discard an extension or pause: %s', (input) => {
    expect(normalizePhoneForStorage(input)).toEqual({ ok: false, reason: 'extension' });
  });

  it.each([
    'telefon yok',
    '++905551234567',
    '90+5551234567',
    '+',
    '() - .',
  ])('rejects malformed input: %s', (input) => {
    expect(normalizePhoneForStorage(input)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('accepts exactly VARCHAR(20) and rejects 21 normalized characters', () => {
    const exact = '1'.repeat(MAX_STORED_PHONE_LENGTH);
    const tooLong = '1'.repeat(MAX_STORED_PHONE_LENGTH + 1);

    expect(normalizePhoneForStorage(exact)).toEqual({ ok: true, value: exact });
    expect(normalizePhoneForStorage(tooLong)).toEqual({ ok: false, reason: 'tooLong' });
  });

  it('counts a leading plus toward the 20-character database limit', () => {
    const exact = `+${'1'.repeat(MAX_STORED_PHONE_LENGTH - 1)}`;
    const tooLong = `+${'1'.repeat(MAX_STORED_PHONE_LENGTH)}`;

    expect(normalizePhoneForStorage(exact)).toEqual({ ok: true, value: exact });
    expect(normalizePhoneForStorage(tooLong)).toEqual({ ok: false, reason: 'tooLong' });
  });

  it('preserves an untouched legacy value during unrelated edits', () => {
    const legacy = '0555 123 45 67 x12';
    expect(preparePhoneForSave(legacy, legacy)).toEqual({ ok: true, value: legacy });
  });

  it('validates and normalizes a changed edit value', () => {
    expect(preparePhoneForSave('+90 (532) 123 45 67', '0532 000 00 00')).toEqual({
      ok: true,
      value: '+905321234567',
    });
  });
});

describe('visible phone duplicate warning', () => {
  const visibleRecords = {
    cariler: [
      { id: 'cari-1', name: 'Ada Market', phone: '0555 123 45 67' },
      { id: 'cari-invalid', name: 'Legacy Cari', phone: '0555 123 45 67 x12' },
    ],
    personeller: [
      {
        id: 'personel-1',
        first_name: 'Ayşe',
        last_name: 'Yılmaz',
        phone: '05551234567',
      },
      {
        id: 'shared-id',
        first_name: 'Aynı',
        last_name: 'Kimlik',
        phone: '05551234567',
      },
    ],
  };

  it('matches formatted visible cari/personel phones and skips unnormalizable legacy values', () => {
    expect(findPhoneDuplicateMatches('0555-123-45-67', visibleRecords)).toEqual([
      { id: 'cari-1', entityType: 'cari', displayName: 'Ada Market' },
      { id: 'personel-1', entityType: 'personel', displayName: 'Ayşe Yılmaz' },
      { id: 'shared-id', entityType: 'personel', displayName: 'Aynı Kimlik' },
    ]);
  });

  it('excludes only the current entity while keeping a different entity with the same id', () => {
    const matches = findPhoneDuplicateMatches('05551234567', {
      ...visibleRecords,
      cariler: [
        ...visibleRecords.cariler,
        { id: 'shared-id', name: 'Aynı Kimlikli Cari', phone: '05551234567' },
      ],
      exclude: { entityType: 'cari', id: 'shared-id' },
    });

    expect(matches).not.toContainEqual(expect.objectContaining({
      entityType: 'cari',
      id: 'shared-id',
    }));
    expect(matches).toContainEqual(expect.objectContaining({
      entityType: 'personel',
      id: 'shared-id',
    }));
  });

  it.each([null, '', '0555 123 45 67 x12'])(
    'does not warn for empty or unnormalizable input: %s',
    (phone) => {
      expect(findPhoneDuplicateMatches(phone, visibleRecords)).toEqual([]);
    },
  );

  it('builds non-blocking Turkish and English confirmation copy', () => {
    const matches = findPhoneDuplicateMatches('05551234567', visibleRecords);

    expect(getPhoneDuplicateWarningCopy(matches, 'tr-TR')).toMatchObject({
      title: 'Telefon numarası zaten kullanılıyor',
      confirmLabel: 'Yine de kaydet',
    });
    expect(getPhoneDuplicateWarningCopy(matches, 'tr-TR').message).toContain('Ada Market (cari)');
    expect(getPhoneDuplicateWarningCopy(matches, 'en-US')).toMatchObject({
      title: 'Phone number already in use',
      confirmLabel: 'Save anyway',
    });
  });
});
