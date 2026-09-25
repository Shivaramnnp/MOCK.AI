import React, { useEffect, useRef, useState } from 'react';
import { useAdContext } from '../../lib/ads/AdContext';
import { AdPlacementId, AdFormat } from '../../lib/ads/types';
import { adAnalytics } from '../../lib/ads/adAnalytics';
import { Sparkles } from 'lucide-react';

export interface AdSlotProps {
  placement: AdPlacementId;
  format?: AdFormat;
  className?: string;
  slotId?: string;
}

export const AdSlot: React.FC<AdSlotProps> = ({
  placement,
  format: propFormat,
  className = '',
  slotId: propSlotId,
}) => {
  const { config, currentRoute, canShow } = useAdContext();
  const [isVisible, setIsVisible] = useState(false);
  const [isRendered, setIsRendered] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 1. Evaluate AdPolicy invariant: ACTIVE MOCK TEST = STRICTLY AD-FREE
  const policyResult = canShow(placement);
  if (!policyResult.allowed) {
    return null;
  }

  const slotConfig = config.slots[placement] || {
    format: propFormat || 'responsive',
    dimensions: { minHeight: 90 },
    description: 'Sponsored Learning Space',
  };

  const format = propFormat || slotConfig.format;
  const slotId = propSlotId || slotConfig.slotId;
  const minHeight = slotConfig.dimensions.minHeight || 90;

  // 2. IntersectionObserver for lazy loading (starts loading when within 200px of viewport)
  useEffect(() => {
    if (!containerRef.current) return;

    // Check if IntersectionObserver is available (e.g. In standard browser or mocked test)
    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  // 3. Render and Push AdSense when visible
  useEffect(() => {
    if (!isVisible || isRendered) return;

    adAnalytics.trackSlotRequested({
      placement,
      format,
      route: currentRoute,
      clientId: config.clientId,
    });

    if (!config.testMode && typeof window !== 'undefined') {
      try {
        const adsbygoogle = (window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle || [];
        adsbygoogle.push({});
        (window as unknown as { adsbygoogle: unknown[] }).adsbygoogle = adsbygoogle;
      } catch (err) {
        adAnalytics.trackFailed({
          placement,
          format,
          route: currentRoute,
          clientId: config.clientId,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    }

    setIsRendered(true);
    adAnalytics.trackSlotRendered({
      placement,
      format,
      route: currentRoute,
      clientId: config.clientId,
    });
    adAnalytics.trackImpression({
      placement,
      format,
      route: currentRoute,
      clientId: config.clientId,
    });
  }, [isVisible, isRendered, placement, format, currentRoute, config.clientId, config.testMode]);

  return (
    <div
      ref={containerRef}
      data-testid="ad-slot"
      data-placement={placement}
      data-format={format}
      style={{ minHeight: `${minHeight}px` }}
      className={`w-full my-4 flex flex-col items-center justify-center transition-all duration-200 overflow-hidden ${className}`}
    >
      {/* Subtle, standard-compliant advertisement label to distinguish from exam/learning content */}
      <div className="w-full flex items-center justify-between px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-surface-muted/60 dark:text-darkSurface-muted/60 select-none">
        <span className="flex items-center gap-1">
          <Sparkles className="w-2.5 h-2.5 opacity-60" />
          Advertisement
        </span>
        <span className="text-[9px] opacity-40 font-mono">MOCK.AI Sponsor</span>
      </div>

      <div
        className="w-full rounded-xl border border-darkSurface-border/60 bg-darkSurface-elev1/40 p-2 sm:p-3 flex items-center justify-center relative overflow-hidden"
        style={{ minHeight: `${minHeight - 24}px` }}
      >
        {config.testMode || !config.clientId || config.clientId === 'ca-pub-0000000000000000' ? (
          // Development / Test placeholder card to verify CLS, layout, and placement
          <div className="flex flex-col sm:flex-row items-center justify-between w-full px-3 py-2 text-center sm:text-left gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-xs font-medium text-surface-text/80 dark:text-darkSurface-text/80">
                  {slotConfig.description || 'Verified Preparation Partners & Resources'}
                </p>
                <p className="text-[10px] text-surface-muted dark:text-darkSurface-muted">
                  Support MOCK.AI Free Tier · Verified Ad Slot: <code className="font-mono text-[9px] text-brand-primary">{placement}</code>
                </p>
              </div>
            </div>
            <span className="text-[10px] px-2.5 py-1 rounded-full bg-darkSurface-elev2 border border-darkSurface-border font-medium text-surface-muted dark:text-darkSurface-muted shrink-0">
              Sponsored
            </span>
          </div>
        ) : (
          // Production Google AdSense ad element
          <ins
            className="adsbygoogle"
            style={{ display: 'block', width: '100%', minHeight: `${minHeight - 24}px` }}
            data-ad-client={config.clientId}
            data-ad-slot={slotId || '1234567890'}
            data-ad-format={format === 'responsive' ? 'auto' : format}
            data-full-width-responsive="true"
          />
        )}
      </div>
    </div>
  );
};
