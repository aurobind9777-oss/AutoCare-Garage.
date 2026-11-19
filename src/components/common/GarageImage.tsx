import { useEffect, useState } from 'react';
import {
  getFallbackGarageImage,
  HERO_WORKSHOP_IMG,
  isFirebaseStoragePath,
  resolveGarageImageSrc,
  resolveStorageImageUrl,
} from '../../utils/imageHelpers';

interface GarageImageProps {
  garageId?: string;
  photoUrl?: string;
  alt: string;
  className?: string;
  isHero?: boolean;
}

export function GarageImage({
  garageId,
  photoUrl,
  alt,
  className = 'w-full h-full object-cover',
  isHero = false,
}: GarageImageProps) {
  const fallbackSrc = isHero ? HERO_WORKSHOP_IMG : getFallbackGarageImage(garageId);
  const [src, setSrc] = useState<string>(() => resolveGarageImageSrc(photoUrl, garageId) || fallbackSrc);
  const [loaded, setLoaded] = useState<boolean>(false);
  const [resolvingStorage, setResolvingStorage] = useState<boolean>(false);
  const [fallbackApplied, setFallbackApplied] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    const trimmed = (photoUrl || '').trim();
    const syncSrc = resolveGarageImageSrc(trimmed, garageId);

    setLoaded(false);
    setFallbackApplied(false);

    if (syncSrc) {
      setSrc(syncSrc);
      setResolvingStorage(false);
      return;
    }

    if (trimmed && isFirebaseStoragePath(trimmed)) {
      setResolvingStorage(true);
      resolveStorageImageUrl(trimmed)
        .then((downloadUrl) => {
          if (!active) return;
          setSrc(downloadUrl);
          setResolvingStorage(false);
        })
        .catch(() => {
          if (!active) return;
          setSrc(fallbackSrc);
          setFallbackApplied(true);
          setResolvingStorage(false);
        });
    } else {
      setSrc(fallbackSrc);
      setResolvingStorage(false);
    }

    return () => {
      active = false;
    };
  }, [photoUrl, garageId, fallbackSrc]);

  return (
    <div className="relative w-full h-full bg-slate-200 overflow-hidden">
      {(!loaded || resolvingStorage) && (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 animate-pulse"
        />
      )}
      <img
        src={src}
        alt={alt}
        loading={isHero ? 'eager' : 'lazy'}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (!fallbackApplied && src !== fallbackSrc) {
            setFallbackApplied(true);
            setSrc(fallbackSrc);
          } else {
            setLoaded(true);
          }
        }}
        className={`${className} transition-opacity duration-300 ${loaded && !resolvingStorage ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}
