import React, { useEffect, useState } from 'react';
import { Sparkles, Loader2, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';

interface ProcessingScreenProps {
  statusMessage: string;
  onCancel: () => void;
  error?: string | null;
  onRetry?: () => void;
}

export const ProcessingScreen: React.FC<ProcessingScreenProps> = ({
  statusMessage,
  onCancel,
  error,
  onRetry,
}) => {
  const [currentStage, setCurrentStage] = useState(0);

  const stages = [
    'Parsing & chunking input source...',
    'Extracting core principles & concepts...',
    'Generating 4 plausible options with LaTeX...',
    'Verifying answer keys & trust scores...',
  ];

  useEffect(() => {
    if (error) return;
    const interval = setInterval(() => {
      setCurrentStage((prev) => (prev < 3 ? prev + 1 : prev));
    }, 1800);
    return () => clearInterval(interval);
  }, [error]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border shadow-2xl p-8 text-center overflow-hidden">
        {/* Ambient Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-brand-primary/10 rounded-full blur-3xl pointer-events-none" />

        {/* Pulsing Visualizer Circle */}
        <div className="relative mx-auto w-28 h-28 flex items-center justify-center mb-6">
          {!error ? (
            <>
              <div className="absolute inset-0 rounded-full border-4 border-dashed border-brand-primary/40 animate-spin" />
              <div className="absolute inset-2 rounded-full border-2 border-brand-variant/30 animate-ping" />
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-tr from-brand-primary to-brand-variant flex items-center justify-center text-white shadow-glow">
                <Sparkles className="w-8 h-8 animate-pulse" />
              </div>
            </>
          ) : (
            <div className="w-20 h-20 rounded-full bg-red-500/10 border-2 border-brand-red flex items-center justify-center text-brand-red shadow-lg">
              <AlertTriangle className="w-8 h-8" />
            </div>
          )}
        </div>

        {/* Title & Message */}
        <h2 className="text-xl sm:text-2xl font-display font-extrabold text-surface-text dark:text-darkSurface-text">
          {error ? 'Processing Failed' : 'Crafting Your Mock Test'}
        </h2>
        <p className="text-sm text-brand-primary font-semibold mt-1">
          {error ? error : statusMessage || stages[currentStage]}
        </p>

        {/* 4-Stage Progress Stepper */}
        {!error && (
          <div className="space-y-2.5 mt-8 text-left max-w-xs mx-auto">
            {stages.map((stg, idx) => {
              const isDone = currentStage > idx;
              const isCurrent = currentStage === idx;

              return (
                <div key={stg} className="flex items-center gap-3 text-xs">
                  {isDone ? (
                    <CheckCircle2 className="w-4 h-4 text-brand-green shrink-0" />
                  ) : isCurrent ? (
                    <Loader2 className="w-4 h-4 text-brand-primary animate-spin shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-surface-border dark:border-darkSurface-border shrink-0" />
                  )}
                  <span
                    className={
                      isDone
                        ? 'text-surface-muted line-through font-medium'
                        : isCurrent
                        ? 'text-surface-text dark:text-darkSurface-text font-bold'
                        : 'text-surface-muted/60'
                    }
                  >
                    {stg}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Buttons */}
        <div className="mt-8 flex items-center justify-center gap-3">
          {error ? (
            <>
              <button
                onClick={onCancel}
                className="px-5 py-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border text-xs font-semibold text-surface-muted hover:text-surface-text"
              >
                Cancel
              </button>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-primary text-white text-xs font-bold shadow-md hover:brightness-110"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Retry with AI</span>
                </button>
              )}
            </>
          ) : (
            <button
              onClick={onCancel}
              className="px-6 py-2 rounded-xl border border-surface-border dark:border-darkSurface-border text-xs font-semibold text-surface-muted hover:text-surface-text transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
