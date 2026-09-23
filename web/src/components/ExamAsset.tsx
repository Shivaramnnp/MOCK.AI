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

  // If no URL or image failed to load, do not render a broken placeholder box
  if (!resolved || hasError) {
    return null;
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
