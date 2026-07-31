import { classifyMutationError } from '@/lib/errors';

type RemovePhoto = (photoPath: string) => Promise<unknown>;

interface ReplaceIslemPhotoOptions {
  /** DB'deki eski yol; yalnız çağıran bunu işlem/işletme bağlamında doğruladıysa verilir. */
  oldPhotoPath: string | null;
  uploadPhoto: () => Promise<string>;
  updatePhotoPointer: (photoPath: string) => Promise<unknown>;
  removePhoto: RemovePhoto;
}

interface ClearIslemPhotoOptions {
  /** DB'deki eski yol; yalnız çağıran bunu işlem/işletme bağlamında doğruladıysa verilir. */
  oldPhotoPath: string | null;
  clearPhotoPointer: () => Promise<unknown>;
  removePhoto: RemovePhoto;
}

/**
 * Storage silme kararını yalnız bu uygulamanın ürettiği işlem-fotoğrafı yoluna sınırlar.
 * Not fotoğrafları ve başka işlem/işletme yolları bu guard'dan geçmez.
 */
export function getValidatedIslemPhotoPath(
  photoPath: string | null | undefined,
  isletmeId: string | null | undefined,
  islemId: string | null | undefined,
): string | null {
  if (!photoPath || !isletmeId || !islemId) return null;
  if (isletmeId.includes('/') || islemId.includes('/')) return null;

  const expectedPrefix = `${isletmeId}/${islemId}_`;
  if (!photoPath.startsWith(expectedPrefix)) return null;

  const suffix = photoPath.slice(expectedPrefix.length);
  return /^\d{10,20}\.webp$/.test(suffix) ? photoPath : null;
}

/** Storage temizliği finansal/DB mutation sonucunu geriye çevirmemelidir. */
export async function removeIslemPhotoBestEffort(
  photoPath: string | null | undefined,
  removePhoto: RemovePhoto,
): Promise<boolean> {
  if (!photoPath) return false;

  try {
    await removePhoto(photoPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copy-on-write fotoğraf değişimi:
 * yeni obje -> DB pointer -> eski obje.
 *
 * Pointer yazımı kesin reddedildiyse yeni obje temizlenir. Ağ sonucu belirsizse pointer
 * sunucuda değişmiş olabileceğinden yeni obje bilerek korunur.
 */
export async function replaceIslemPhotoCopyOnWrite({
  oldPhotoPath,
  uploadPhoto,
  updatePhotoPointer,
  removePhoto,
}: ReplaceIslemPhotoOptions): Promise<string> {
  let newPhotoPath: string | null = null;

  try {
    newPhotoPath = await uploadPhoto();
    await updatePhotoPointer(newPhotoPath);
  } catch (error) {
    if (
      newPhotoPath
      && classifyMutationError(error) !== 'network_unknown'
    ) {
      await removeIslemPhotoBestEffort(newPhotoPath, removePhoto);
    }
    throw error;
  }

  if (oldPhotoPath && oldPhotoPath !== newPhotoPath) {
    await removeIslemPhotoBestEffort(oldPhotoPath, removePhoto);
  }

  return newPhotoPath;
}

/**
 * Fotoğraf kaldırma:
 * önce DB pointer temizlenir, yalnız kesin başarıdan sonra eski obje silinir.
 */
export async function clearIslemPhotoCopyOnWrite({
  oldPhotoPath,
  clearPhotoPointer,
  removePhoto,
}: ClearIslemPhotoOptions): Promise<void> {
  await clearPhotoPointer();
  await removeIslemPhotoBestEffort(oldPhotoPath, removePhoto);
}
