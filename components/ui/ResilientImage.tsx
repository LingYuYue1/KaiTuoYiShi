// 静态图片引用解析：保留调用方对失败呈现的领域决定权。
import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import {
  isRemoteStaticAssetUrl,
  resolveStaticAssetReference,
  STATIC_ASSET_FALLBACK_AVATAR,
} from '@/utils/staticAssets';
import { devLog, devLogError } from '@/utils/devLog';

export interface ResilientImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string;
  fallbackSrc?: string;
}

function isRemoteImageUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function ResilientImage({
  src,
  fallbackSrc = STATIC_ASSET_FALLBACK_AVATAR,
  onError,
  ...props
}: ResilientImageProps) {
  const resolvedSrc = resolveStaticAssetReference(src) ?? src;
  const [displaySrc, setDisplaySrc] = useState(() => (
    isRemoteImageUrl(resolvedSrc) ? fallbackSrc : resolvedSrc
  ));

  useEffect(() => {
    if (!isRemoteImageUrl(resolvedSrc)) {
      setDisplaySrc(resolvedSrc);
      return;
    }

    let disposed = false;
    setDisplaySrc(fallbackSrc);
    devLog('ui', 'remote-image-preload-started', {
      source: isRemoteStaticAssetUrl(resolvedSrc) ? 'static-remote' : 'remote',
    });
    const image = new Image();
    image.onload = () => {
      if (disposed) return;
      devLog('ui', 'remote-image-preload-succeeded', {
        source: isRemoteStaticAssetUrl(resolvedSrc) ? 'static-remote' : 'remote',
      });
      setDisplaySrc(resolvedSrc);
    };
    image.onerror = () => {
      if (disposed) return;
      devLogError('ui', 'remote-image-preload-failed', new Error('Image resource failed to load.'), {
        source: isRemoteStaticAssetUrl(resolvedSrc) ? 'static-remote' : 'remote',
        applyingFallback: true,
      });
    };
    image.src = resolvedSrc;

    return () => {
      disposed = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [fallbackSrc, resolvedSrc]);

  return (
    <img
      {...props}
      src={displaySrc}
      data-static-asset={isRemoteStaticAssetUrl(resolvedSrc) ? 'remote' : 'local'}
      data-static-asset-fallback={displaySrc === fallbackSrc ? 'true' : 'false'}
      onError={(event) => {
        const applyingFallback = displaySrc !== fallbackSrc;
        devLogError('ui', 'image-load-failed', new Error('Image resource failed to load.'), {
          source: isRemoteStaticAssetUrl(displaySrc) ? 'static-remote' : 'other',
          applyingFallback,
        });
        if (applyingFallback) {
          setDisplaySrc(fallbackSrc);
          return;
        }
        onError?.(event);
      }}
    />
  );
}

export function AvatarImage(props: Omit<ResilientImageProps, 'fallbackSrc'>) {
  return <ResilientImage {...props} fallbackSrc={STATIC_ASSET_FALLBACK_AVATAR} />;
}
