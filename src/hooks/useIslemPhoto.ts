/**
 * Hooks for managing transaction (islem) photos
 * Handles image picking, camera capture, upload, delete, and URL generation
 */

import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import { processImageForUpload, readImageAsBase64 } from '@/lib/imageUtils';

const BUCKET_NAME = 'islem-photos';

/**
 * Error types for photo operations
 */
export type PhotoErrorType =
  | 'PERMISSION_DENIED'
  | 'CAMERA_PERMISSION_DENIED'
  | 'UPLOAD_FAILED'
  | 'DELETE_FAILED'
  | 'CANCELLED';

/**
 * Hook for picking an image from the gallery
 */
export function usePickImage() {
  return useMutation({
    mutationFn: async (): Promise<string | null> => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error('PERMISSION_DENIED');
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1, // Get original, we'll process it ourselves
        allowsEditing: false,
      });

      if (result.canceled) {
        return null;
      }

      return result.assets[0].uri;
    },
  });
}

/**
 * Hook for taking a photo with the camera
 */
export function useTakePhoto() {
  return useMutation({
    mutationFn: async (): Promise<string | null> => {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        throw new Error('CAMERA_PERMISSION_DENIED');
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 1, // Get original, we'll process it ourselves
        allowsEditing: false,
      });

      if (result.canceled) {
        return null;
      }

      return result.assets[0].uri;
    },
  });
}

/**
 * Hook for picking multiple images from the gallery (for batch OCR import)
 */
export function usePickMultipleImages() {
  return useMutation({
    mutationFn: async (): Promise<string[]> => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error('PERMISSION_DENIED');
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 20,
      });

      if (result.canceled || !result.assets?.length) {
        return [];
      }

      return result.assets.map(a => a.uri);
    },
  });
}

/**
 * Hook for uploading a photo to Supabase Storage
 */
export function useUploadIslemPhoto() {
  return useMutation({
    mutationFn: async ({
      uri,
      isletmeId,
      islemId,
    }: {
      uri: string;
      isletmeId: string;
      islemId: string;
    }): Promise<string> => {
      // 1. Process image (resize, compress, convert to WebP)
      const processed = await processImageForUpload(uri);

      // 2. Read as base64
      const base64 = await readImageAsBase64(processed.uri);

      // 3. Generate storage path
      const timestamp = Date.now();
      const path = `${isletmeId}/${islemId}_${timestamp}.webp`;

      // 4. Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(path, decode(base64), {
          contentType: 'image/webp',
          upsert: false,
        });

      if (uploadError) {
        console.error('Photo upload error:', uploadError);
        throw new Error('UPLOAD_FAILED');
      }

      return path;
    },
  });
}

/**
 * Hook for deleting a photo from Supabase Storage
 */
export function useDeleteIslemPhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (photoPath: string): Promise<void> => {
      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([photoPath]);

      if (error) {
        console.error('Photo delete error:', error);
        throw new Error('DELETE_FAILED');
      }
    },
    onSuccess: () => {
      // Invalidate islemler queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['islemler'] });
    },
  });
}

/**
 * Hook for getting a signed URL for a photo
 * Returns a URL valid for 1 hour
 */
export function useGetPhotoUrl() {
  return useMutation({
    mutationFn: async (photoPath: string): Promise<string> => {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(photoPath, 3600); // 1 hour

      if (error) {
        console.error('Get photo URL error:', error);
        throw error;
      }

      return data.signedUrl;
    },
  });
}

/**
 * Combined hook for photo state management in forms
 * Handles local preview, upload, and cleanup
 */
export function usePhotoField() {
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const pickImage = usePickImage();
  const takePhoto = useTakePhoto();

  const handlePickImage = useCallback(async () => {
    const uri = await pickImage.mutateAsync();
    if (uri) {
      setLocalPhotoUri(uri);
    }
    return uri;
  }, [pickImage]);

  const handleTakePhoto = useCallback(async () => {
    const uri = await takePhoto.mutateAsync();
    if (uri) {
      setLocalPhotoUri(uri);
    }
    return uri;
  }, [takePhoto]);

  const clearPhoto = useCallback(() => {
    setLocalPhotoUri(null);
  }, []);

  return {
    localPhotoUri,
    setLocalPhotoUri,
    handlePickImage,
    handleTakePhoto,
    clearPhoto,
    isPickingImage: pickImage.isPending,
    isTakingPhoto: takePhoto.isPending,
    pickError: pickImage.error,
    takeError: takePhoto.error,
  };
}
