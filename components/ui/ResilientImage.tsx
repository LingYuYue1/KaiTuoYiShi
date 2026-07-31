import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import {
  isRemoteStaticAssetUrl,
  resolveStaticAssetReference,
  STATIC_ASSET_FALLBACK_AVATAR,
} from '@/utils/staticAssets';

interface ResilientImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string;
  fallbackSrc?: string;
}

export function ResilientImage({
  src,
  fallbackSrc = STATIC_ASSET_FALLBACK_AVATAR,
  onError,
  ...props
}: ResilientImageProps) {
  const resolvedSrc = resolveStaticAssetReference(src) ?? src;
  const [displaySrc, setDisplaySrc] = useState(resolvedSrc);

  useEffect(() => {
    setDisplaySrc(resolvedSrc);
  }, [resolvedSrc]);

  return (
    <img
      {...props}
      src={displaySrc}
      data-static-asset={isRemoteStaticAssetUrl(resolvedSrc) ? 'remote' : 'local'}
      data-static-asset-fallback={displaySrc === fallbackSrc ? 'true' : 'false'}
      onError={(event) => {
        if (displaySrc !== fallbackSrc) {
          setDisplaySrc(fallbackSrc);
          return;
        }
        onError?.(event);
      }}
    />
  );
}
