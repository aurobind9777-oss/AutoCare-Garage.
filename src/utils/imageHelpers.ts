import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../lib/firebase';

import heroWorkshopImg from '../assets/images/hero_autocare_workshop_1795090555003.jpg';
import garageCentralImg from '../assets/images/garage_hub_central_1795090555315.jpg';
import garageWestImg from '../assets/images/garage_hub_west_1795090555283.jpg';
import garageEastImg from '../assets/images/garage_hub_east_1795090554790.jpg';
import garageSouthImg from '../assets/images/garage_hub_south_1795090554540.jpg';
import garageNorthImg from '../assets/images/garage_hub_north_1795090555534.jpg';
import garageMetroImg from '../assets/images/garage_hub_metro_1795090555722.jpg';

export const HERO_WORKSHOP_IMG = heroWorkshopImg;

export const GARAGE_DEFAULT_IMAGES: Record<string, string> = {
  'garage-1': garageCentralImg,
  'garage-2': garageWestImg,
  'garage-3': garageEastImg,
  'garage-4': garageSouthImg,
  'garage-5': garageNorthImg,
  'garage-6': garageMetroImg,
};

const BUNDLED_FILENAME_MAP: Record<string, string> = {
  'hero_autocare_workshop_1795090555003.jpg': heroWorkshopImg,
  'garage_hub_central_1795090555315.jpg': garageCentralImg,
  'garage_hub_west_1795090555283.jpg': garageWestImg,
  'garage_hub_east_1795090554790.jpg': garageEastImg,
  'garage_hub_south_1795090554540.jpg': garageSouthImg,
  'garage_hub_north_1795090555534.jpg': garageNorthImg,
  'garage_hub_metro_1795090555722.jpg': garageMetroImg,
};

const storageDownloadUrlCache = new Map<string, string>();

export function getFallbackGarageImage(garageId?: string): string {
  if (garageId && GARAGE_DEFAULT_IMAGES[garageId]) {
    return GARAGE_DEFAULT_IMAGES[garageId];
  }
  return heroWorkshopImg;
}

export function isFirebaseStoragePath(url?: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('gs://')) return true;
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('/assets/') ||
    trimmed.startsWith('/src/') ||
    trimmed.startsWith('src/')
  ) {
    return false;
  }
  // Storage relative object path (e.g., "garages/garage-1/cover.jpg")
  const fileKey = trimmed.toLowerCase().split('/').pop()?.split('?')[0] || '';
  if (BUNDLED_FILENAME_MAP[fileKey]) {
    return false;
  }
  return trimmed.includes('/') && !trimmed.startsWith('/');
}

/**
 * Resolves any garage photoUrl (bundled asset URL, legacy Firestore `/src/assets/images/...` path,
 * `https://firebasestorage.googleapis.com/...` URL, or fallback branch image) to a browser-safe src.
 * For `gs://` or storage object paths, returns null so GarageImage can resolve via getDownloadURL().
 */
export function resolveGarageImageSrc(photoUrl?: string, garageId?: string): string | null {
  const trimmed = (photoUrl || '').trim();
  if (!trimmed) {
    return getFallbackGarageImage(garageId);
  }

  // Intercept legacy unbundled `/src/assets/images/...` or relative asset paths stored in Firestore
  const cleanFilename = trimmed.toLowerCase().split('?')[0].split('#')[0].split('/').pop() || '';
  if (BUNDLED_FILENAME_MAP[cleanFilename]) {
    return BUNDLED_FILENAME_MAP[cleanFilename];
  }

  if (isFirebaseStoragePath(trimmed)) {
    return storageDownloadUrlCache.get(trimmed) || null;
  }

  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('/assets/')
  ) {
    return trimmed;
  }

  return getFallbackGarageImage(garageId);
}

export async function resolveStorageImageUrl(storagePath: string): Promise<string> {
  const key = storagePath.trim();
  const cached = storageDownloadUrlCache.get(key);
  if (cached) return cached;

  if (!storage) {
    throw new Error('Firebase Storage is not initialized.');
  }
  const storageRef = ref(storage, key);
  const url = await getDownloadURL(storageRef);
  storageDownloadUrlCache.set(key, url);
  return url;
}

export async function uploadGaragePhotoToStorage(garageId: string, file: File): Promise<string> {
  if (!storage) {
    throw new Error('Firebase Storage is not initialized.');
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (JPG, PNG, or WebP).');
  }
  const maxBytes = 5 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error('Image file must be 5 MB or smaller.');
  }

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const objectPath = `garages/${garageId}/cover_${Date.now()}.${ext}`;
  const storageRef = ref(storage, objectPath);

  await uploadBytes(storageRef, file, {
    contentType: file.type,
    cacheControl: 'public,max-age=31536000',
  });

  const downloadUrl = await getDownloadURL(storageRef);
  storageDownloadUrlCache.set(objectPath, downloadUrl);
  storageDownloadUrlCache.set(downloadUrl, downloadUrl);

  // firestore.rules enforces photoUrl length <= 500 characters; if the signed token URL exceeds 500 chars,
  // store the canonical storage object path instead (which GarageImage resolves via getDownloadURL).
  if (downloadUrl.length <= 500) {
    return downloadUrl;
  }
  return objectPath;
}
