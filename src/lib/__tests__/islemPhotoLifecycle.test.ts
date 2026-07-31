import {
  clearIslemPhotoCopyOnWrite,
  getValidatedIslemPhotoPath,
  removeIslemPhotoBestEffort,
  replaceIslemPhotoCopyOnWrite,
} from '@/lib/islemPhotoLifecycle';

const ISLETME_ID = '11111111-1111-4111-8111-111111111111';
const ISLEM_ID = '22222222-2222-4222-8222-222222222222';
const OLD_PATH = `${ISLETME_ID}/${ISLEM_ID}_1722240000000.webp`;
const NEW_PATH = `${ISLETME_ID}/${ISLEM_ID}_1722240000001.webp`;

describe('islem fotoğrafı yaşam döngüsü', () => {
  it('yalnız beklenen işletme + işlem + timestamp webp yolunu silinebilir kabul eder', () => {
    expect(getValidatedIslemPhotoPath(OLD_PATH, ISLETME_ID, ISLEM_ID)).toBe(OLD_PATH);
    expect(
      getValidatedIslemPhotoPath(
        `33333333-3333-4333-8333-333333333333/${ISLEM_ID}_1722240000000.webp`,
        ISLETME_ID,
        ISLEM_ID,
      ),
    ).toBeNull();
    expect(
      getValidatedIslemPhotoPath(
        `${ISLETME_ID}/33333333-3333-4333-8333-333333333333_1722240000000.webp`,
        ISLETME_ID,
        ISLEM_ID,
      ),
    ).toBeNull();
    expect(
      getValidatedIslemPhotoPath(
        `${ISLETME_ID}/notlar/${ISLEM_ID}_1722240000000.webp`,
        ISLETME_ID,
        ISLEM_ID,
      ),
    ).toBeNull();
    expect(
      getValidatedIslemPhotoPath(
        `${ISLETME_ID}/${ISLEM_ID}_receipt.webp`,
        ISLETME_ID,
        ISLEM_ID,
      ),
    ).toBeNull();
  });

  it('değiştirmede yeni upload ve pointer başarısından sonra eski objeyi temizler', async () => {
    const events: string[] = [];

    await expect(
      replaceIslemPhotoCopyOnWrite({
        oldPhotoPath: OLD_PATH,
        uploadPhoto: async () => {
          events.push('upload:new');
          return NEW_PATH;
        },
        updatePhotoPointer: async (photoPath) => {
          events.push(`pointer:${photoPath}`);
        },
        removePhoto: async (photoPath) => {
          events.push(`remove:${photoPath}`);
        },
      }),
    ).resolves.toBe(NEW_PATH);

    expect(events).toEqual([
      'upload:new',
      `pointer:${NEW_PATH}`,
      `remove:${OLD_PATH}`,
    ]);
  });

  it('pointer kesin reddedilirse yeni objeyi temizler ve asıl hatayı korur', async () => {
    const pointerError = Object.assign(new Error('invalid mutation'), { code: '23514' });
    const removePhoto = jest.fn(async () => undefined);

    await expect(
      replaceIslemPhotoCopyOnWrite({
        oldPhotoPath: OLD_PATH,
        uploadPhoto: async () => NEW_PATH,
        updatePhotoPointer: async () => {
          throw pointerError;
        },
        removePhoto,
      }),
    ).rejects.toBe(pointerError);

    expect(removePhoto).toHaveBeenCalledTimes(1);
    expect(removePhoto).toHaveBeenCalledWith(NEW_PATH);
    expect(removePhoto).not.toHaveBeenCalledWith(OLD_PATH);
  });

  it('pointer sonucu ağ yüzünden belirsizse yeni objeyi silmez', async () => {
    const outcomeUnknown = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
    const removePhoto = jest.fn(async () => undefined);

    await expect(
      replaceIslemPhotoCopyOnWrite({
        oldPhotoPath: OLD_PATH,
        uploadPhoto: async () => NEW_PATH,
        updatePhotoPointer: async () => {
          throw outcomeUnknown;
        },
        removePhoto,
      }),
    ).rejects.toBe(outcomeUnknown);

    expect(removePhoto).not.toHaveBeenCalled();
  });

  it('kaldırmada önce pointerı temizler; DB hatasında storage objesine dokunmaz', async () => {
    const successEvents: string[] = [];
    await clearIslemPhotoCopyOnWrite({
      oldPhotoPath: OLD_PATH,
      clearPhotoPointer: async () => {
        successEvents.push('pointer:null');
      },
      removePhoto: async (photoPath) => {
        successEvents.push(`remove:${photoPath}`);
      },
    });
    expect(successEvents).toEqual(['pointer:null', `remove:${OLD_PATH}`]);

    const removePhoto = jest.fn(async () => undefined);
    await expect(
      clearIslemPhotoCopyOnWrite({
        oldPhotoPath: OLD_PATH,
        clearPhotoPointer: async () => {
          throw new Error('DB rejected');
        },
        removePhoto,
      }),
    ).rejects.toThrow('DB rejected');
    expect(removePhoto).not.toHaveBeenCalled();
  });

  it('başarı sonrası storage temizliği hata verse de DB işlemini başarısız göstermez', async () => {
    await expect(
      removeIslemPhotoBestEffort(OLD_PATH, async () => {
        throw new Error('storage unavailable');
      }),
    ).resolves.toBe(false);
  });
});
