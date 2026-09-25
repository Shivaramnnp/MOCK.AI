import React, { useState } from 'react';
import { ZoomIn } from 'lucide-react';
import { resolveAssetUrl } from '../lib/supabaseContent';

export interface ExamAssetProps {
  url: string | null | undefined;
  alt: string;
  variant?: 'diagram' | 'option';
  onZoom?: (resolvedUrl: string) => void;
  className?: string;
}

export const ExamAsset: React.FC<ExamAssetProps> = ({
  url,
  alt,
  variant = 'diagram',
  onZoom,
  className = '',
}) => {
  const [hasError, setHasError] = useState(false);
  const resolved = resolveAssetUrl(url) ?? (url || null);

  // Reset error when URL changes
  React.useEffect(() => {
    setHasError(false);
  }, [resolved]);

  if (!resolved) {
    return null;
  }

  if (hasError) {
    if (variant === 'option') {
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
          onClick={() => setHasError(false)}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white dark:bg-darkSurface-elev2 border border-surface-border text-xs font-semibold text-surface-text hover:bg-surface-elev1 transition-colors cursor-pointer shadow-xs"
        >
          Retry Loading
        </button>
      </div>
    );
  }

  if (variant === 'option') {
    return (
      <div className={`inline-block p-1.5 sm:p-2 bg-white dark:bg-darkSurface-elev1 rounded-lg border border-surface-border/70 dark:border-darkSurface-border/70 shadow-2xs max-w-full ${className}`}>
        <img
          src={resolved}
          alt={alt}
          loading="lazy"
          className="max-h-24 sm:max-h-28 max-w-full object-contain cursor-zoom-in rounded hover:opacity-95 transition-opacity"
          onError={() => setHasError(true)}
          onClick={(e) => {
            e.stopPropagation();
            onZoom?.(resolved);
          }}
        />
      </div>
    );
  }

  // Diagram variant
  return (
    <div
      className={`p-3 bg-white dark:bg-darkSurface-elev1 rounded-xl border border-surface-border dark:border-darkSurface-border shadow-xs max-w-xl mx-auto flex flex-col items-center group relative ${className}`}
    >
      <img
        src={resolved}
        alt={alt}
        loading="lazy"
        className="rounded-lg max-h-72 max-w-full object-contain mx-auto cursor-zoom-in hover:opacity-95 transition-opacity"
        onError={() => setHasError(true)}
        onClick={() => onZoom?.(resolved)}
      />
      <button
        type="button"
        onClick={() => onZoom?.(resolved)}
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-surface-muted hover:text-brand-primary transition-colors cursor-pointer"
      >
        <ZoomIn className="w-3.5 h-3.5" />
        <span>Click to enlarge figure</span>
      </button>
    </div>
  );
};
