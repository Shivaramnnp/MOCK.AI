import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ZoomIn } from 'lucide-react';
import { resolveAssetUrl } from '../lib/supabaseContent';

export interface ExamAssetProps {
  url: string | null | undefined;
  alt: string;
  variant?: 'diagram' | 'option' | 'formula';
  onZoom?: (resolvedUrl: string) => void;
  className?: string;
  allowZoom?: boolean;
  minZoomDimensions?: { width: number; height: number };
  fallbackText?: string;
}

export const ExamAsset: React.FC<ExamAssetProps> = ({
  url,
  alt,
  variant = 'diagram',
  onZoom,
  className = '',
  allowZoom = true,
  minZoomDimensions,
  fallbackText,
}) => {
  const [hasError, setHasError] = useState(false);
  const [fallbackAttempted, setFallbackAttempted] = useState(false);
  const [isZoomable, setIsZoomable] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const initialSrc = useMemo(() => resolveAssetUrl(url) ?? (url || null), [url]);
  const [currentSrc, setCurrentSrc] = useState<string | null>(initialSrc);

  // Derive local static fallback path if url is a local path or Supabase CDN URL
  const localFallbackSrc = useMemo(() => {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const storagePrefix = 'storage/v1/object/public/exam-assets/';
      const idx = url.indexOf(storagePrefix);
      if (idx !== -1) {
        return `/exam-assets/${url.substring(idx + storagePrefix.length)}`;
      }
      return null;
    }
    return url.startsWith('/') ? url : `/${url}`;
  }, [url]);

  // Synchronize state when url changes
  useEffect(() => {
    const nextSrc = resolveAssetUrl(url) ?? (url || null);
    setCurrentSrc(nextSrc);
    setFallbackAttempted(false);
    setHasError(false);
    setIsZoomable(false);
  }, [url]);

  const checkDimensions = (nw: number, nh: number) => {
    const minW = minZoomDimensions?.width ?? 120;
    const minH = minZoomDimensions?.height ?? 75;
    const aspectRatio = nh > 0 ? nw / nh : 0;
    // Figure magnification criteria:
    // 1. Genuine visual diagrams have substantial height (nh >= 75px) and width (nw >= 120px)
    // 2. Aspect ratio < 3.5 (prevents plain-text ribbons, formula strips, and wide prompt banners from triggering zoom)
    // 3. Minimum vertical dimension of 60px
    const meetsDims = nh >= minH && nw >= minW && aspectRatio < 3.5 && nh >= 60;
    setIsZoomable(meetsDims);
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    checkDimensions(img.naturalWidth, img.naturalHeight);
  };

  // Inspect cached image on mount / src change
  useEffect(() => {
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      checkDimensions(imgRef.current.naturalWidth, imgRef.current.naturalHeight);
    }
  }, [currentSrc]);

  const handleError = () => {
    // If the remote CDN URL failed and a local static path exists and hasn't been tried yet, fall back
    if (!fallbackAttempted && localFallbackSrc && currentSrc !== localFallbackSrc) {
      setFallbackAttempted(true);
      setCurrentSrc(localFallbackSrc);
      return;
    }
    setHasError(true);
  };

  if (!currentSrc) {
    return null;
  }

  if (hasError) {
    if (variant === 'option') {
      if (fallbackText) {
        return (
          <span className={`text-xs text-surface-muted dark:text-darkSurface-muted italic ${className}`}>
            {fallbackText}
          </span>
        );
      }
      return (
        <div
          className={`inline-flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded-md text-[11px] text-amber-700 dark:text-amber-400 ${className}`}
        >
          <span>Image load error</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setHasError(false);
              setFallbackAttempted(false);
              setCurrentSrc(initialSrc);
            }}
            className="underline font-bold hover:text-amber-800 cursor-pointer ml-1"
          >
            Retry
          </button>
        </div>
      );
    }

    return (
      <div
        className={`p-4 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-xl text-center flex flex-col items-center justify-center gap-2 max-w-md mx-auto ${className}`}
      >
        <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
          Figure failed to load: {alt}
        </p>
        <button
          type="button"
          onClick={() => {
            setHasError(false);
            setFallbackAttempted(false);
            setCurrentSrc(initialSrc);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white dark:bg-darkSurface-elev2 border border-surface-border text-xs font-semibold text-surface-text hover:bg-surface-elev1 transition-colors cursor-pointer shadow-xs"
        >
          Retry Loading
        </button>
      </div>
    );
  }

  if (variant === 'formula') {
    return (
      <span className={`inline-block align-middle my-0.5 max-w-full ${className}`}>
        <img
          ref={imgRef}
          src={currentSrc}
          alt={alt}
          loading="lazy"
          className="max-h-16 max-w-full object-contain cursor-default"
          onLoad={handleImageLoad}
          onError={handleError}
        />
      </span>
    );
  }

  if (variant === 'option') {
    const canZoomOption = Boolean(onZoom && allowZoom !== false);
    return (
      <div className={`inline-block p-1.5 sm:p-2 bg-white dark:bg-darkSurface-elev1 rounded-lg border border-surface-border/70 dark:border-darkSurface-border/70 shadow-2xs max-w-full ${className}`}>
        <img
          ref={imgRef}
          src={currentSrc}
          alt={alt}
          loading="lazy"
          className={`max-h-24 sm:max-h-28 max-w-full object-contain rounded transition-opacity ${
            canZoomOption ? 'cursor-zoom-in hover:opacity-95' : 'cursor-default'
          }`}
          onLoad={handleImageLoad}
          onError={handleError}
          onClick={(e) => {
            if (canZoomOption) {
              e.stopPropagation();
              onZoom?.(currentSrc);
            }
          }}
        />
      </div>
    );
  }

  // Diagram variant
  const canZoom = Boolean(onZoom && allowZoom !== false && variant === 'diagram' && isZoomable);

  return (
    <div
      className={`p-3 bg-white dark:bg-darkSurface-elev1 rounded-xl border border-surface-border dark:border-darkSurface-border shadow-xs max-w-xl mx-auto flex flex-col items-center group relative ${className}`}
    >
      <img
        ref={imgRef}
        src={currentSrc}
        alt={alt}
        loading="lazy"
        className={`rounded-lg max-h-72 max-w-full object-contain mx-auto transition-opacity ${
          canZoom ? 'cursor-zoom-in hover:opacity-95' : 'cursor-default'
        }`}
        onLoad={handleImageLoad}
        onError={handleError}
        onClick={() => {
          if (canZoom) {
            onZoom?.(currentSrc);
          }
        }}
      />
      {canZoom && (
        <button
          type="button"
          onClick={() => onZoom?.(currentSrc)}
          aria-label="Click to enlarge figure"
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-surface-muted hover:text-brand-primary transition-colors cursor-pointer"
        >
          <ZoomIn className="w-3.5 h-3.5" />
          <span>Click to enlarge figure</span>
        </button>
      )}
    </div>
  );
};
