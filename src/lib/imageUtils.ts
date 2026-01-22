/**
 * Image utility functions for processing and compressing images
 * before uploading to Supabase Storage
 */

import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

export interface ProcessedImage {
  uri: string;
  width: number;
  height: number;
  fileSize: number;
}

/**
 * Target size for compressed images (in bytes)
 * 200KB is a good balance between quality and storage
 */
const TARGET_SIZE_BYTES = 200 * 1024; // 200KB

/**
 * Minimum quality to prevent over-compression
 */
const MIN_QUALITY = 0.3;

/**
 * Minimum width to prevent images from becoming too small
 */
const MIN_WIDTH = 640;

/**
 * Process an image for upload by resizing and compressing it
 * Uses recursive compression if the file is still too large
 *
 * @param uri - Local URI of the image to process
 * @param maxWidth - Maximum width for the resized image (default: 1280px)
 * @param quality - Compression quality 0-1 (default: 0.7)
 * @returns ProcessedImage with uri, dimensions and file size
 */
export async function processImageForUpload(
  uri: string,
  maxWidth: number = 1280,
  quality: number = 0.7
): Promise<ProcessedImage> {
  // 1. Resize and compress to WebP
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxWidth } }],
    {
      compress: quality,
      format: ImageManipulator.SaveFormat.WEBP,
    }
  );

  // 2. Check file size
  const fileInfo = await FileSystem.getInfoAsync(result.uri);
  const fileSize = fileInfo.exists && 'size' in fileInfo ? (fileInfo.size ?? 0) : 0;

  // 3. If still too large and we can compress more, do recursive compression
  if (fileSize > TARGET_SIZE_BYTES) {
    const newWidth = Math.max(Math.floor(maxWidth * 0.8), MIN_WIDTH);
    const newQuality = Math.max(quality * 0.85, MIN_QUALITY);

    // Stop if we've reached minimum settings
    if (newWidth <= MIN_WIDTH && newQuality <= MIN_QUALITY) {
      return {
        uri: result.uri,
        width: result.width,
        height: result.height,
        fileSize,
      };
    }

    // Recursive compression with reduced settings
    return processImageForUpload(uri, newWidth, newQuality);
  }

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
    fileSize,
  };
}

/**
 * Read image as base64 string for upload
 *
 * @param uri - Local URI of the image
 * @returns Base64 encoded string
 */
export async function readImageAsBase64(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, {
    encoding: 'base64',
  });
}

/**
 * Get file size of an image
 *
 * @param uri - Local URI of the image
 * @returns File size in bytes
 */
export async function getImageFileSize(uri: string): Promise<number> {
  const fileInfo = await FileSystem.getInfoAsync(uri);
  return fileInfo.exists && 'size' in fileInfo ? (fileInfo.size ?? 0) : 0;
}

/**
 * Format file size for display (e.g., "150 KB")
 *
 * @param bytes - File size in bytes
 * @returns Formatted string
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
