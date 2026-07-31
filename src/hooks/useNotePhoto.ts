import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import { processImageForUpload, readImageAsBase64 } from '@/lib/imageUtils';
import { usePermissions } from '@/hooks/usePermissions';
import type { ContextNoteParentModule } from '@/hooks/useNotlar';

const BUCKET_NAME = 'islem-photos';

/**
 * Yeni yüklenmiş ama DB satırına bağlanamamış not fotoğraflarını temizler.
 * Temizlik ana mutation hatasını gölgelememeli; sonuç çağıran tarafından
 * yalnız gözlem/telemetri amacıyla kullanılabilir.
 */
export async function removeNotePhotoBestEffort(
  photoPath: string,
): Promise<boolean> {
  try {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([photoPath]);

    if (error) {
      console.warn('[NotePhoto] cleanup failed:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.warn('[NotePhoto] cleanup failed:', error);
    return false;
  }
}

export function useUploadNotePhoto() {
  const {
    canCreate,
    canUpdate,
    canCreateContextNote,
    canUpdateContextNote,
  } = usePermissions();

  return useMutation({
    mutationFn: async ({
      uri,
      isletmeId,
      noteId,
      contextModule,
      action = 'create',
      createdBy = null,
    }: {
      uri: string;
      isletmeId: string;
      noteId: string;
      contextModule?: ContextNoteParentModule;
      action?: 'create' | 'update';
      createdBy?: string | null;
    }): Promise<string> => {
      const allowed = contextModule
        ? action === 'create'
          ? canCreateContextNote(contextModule)
          : canUpdateContextNote(contextModule, createdBy)
        : action === 'create'
          ? canCreate('notlar')
          : canUpdate('notlar', createdBy);
      if (!allowed) throw new Error('PERMISSION_DENIED');

      const processed = await processImageForUpload(uri);
      const base64 = await readImageAsBase64(processed.uri);
      const timestamp = Date.now();
      const path = `${isletmeId}/notlar/${noteId}_${timestamp}.webp`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(path, decode(base64), {
          contentType: 'image/webp',
          upsert: false,
        });

      if (uploadError) {
        // Upload yanıtı kaybolmuş olsa bile fotoğraf henüz hiçbir not satırına
        // bağlanmadı; aynı kesin yolu silmeyi denemek güvenlidir.
        await removeNotePhotoBestEffort(path);
        throw uploadError;
      }

      return path;
    },
  });
}

export function useDeleteNotePhoto() {
  return useMutation({
    mutationFn: async (photoPath: string): Promise<void> => {
      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([photoPath]);

      if (error) {
        throw error;
      }
    },
  });
}

export function useGetNotePhotoUrl() {
  return useMutation({
    mutationFn: async (photoPath: string): Promise<string> => {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(photoPath, 3600);

      if (error) throw error;
      return data.signedUrl;
    },
  });
}

export function useNotePhotoField() {
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);

  const handlePickImage = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error('PERMISSION_DENIED');

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: false,
      });

      if (result.canceled) return null;
      const uri = result.assets[0].uri;
      setLocalPhotoUri(uri);
      return uri;
    } catch (e) {
      console.warn('[NotePhoto] pickImage error:', e);
      throw e;
    }
  }, []);

  const handleTakePhoto = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) throw new Error('CAMERA_PERMISSION_DENIED');

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        allowsEditing: false,
      });

      if (result.canceled) return null;
      const uri = result.assets[0].uri;
      setLocalPhotoUri(uri);
      return uri;
    } catch (e) {
      console.warn('[NotePhoto] takePhoto error:', e);
      throw e;
    }
  }, []);

  const clearPhoto = useCallback(() => {
    setLocalPhotoUri(null);
  }, []);

  return {
    localPhotoUri,
    setLocalPhotoUri,
    handlePickImage,
    handleTakePhoto,
    clearPhoto,
  };
}
