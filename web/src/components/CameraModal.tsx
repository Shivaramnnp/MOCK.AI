import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Camera,
  X,
  RefreshCw,
  Check,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Sun,
  Zap,
  Eye,
  Scan,
  Maximize2,
  Sliders,
  ShieldCheck,
} from 'lucide-react';
import {
  analyzeFrame,
  scaleQuad,
  warpPerspectiveAndCrop,
} from '../services/ingestion/camera/documentDetector';
import { cameraManager } from '../services/ingestion/camera/cameraManager';
import { MultiPageSessionManager } from '../services/ingestion/camera/multiPageScanner';
import { CameraFrameAnalysis, Quad, ScannedPage } from '../services/ingestion/camera/types';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (payload: { pages: Array<{ base64Data: string; pageNumber: number }> } | string) => void;
}

export const CameraModal: React.FC<CameraModalProps> = ({ isOpen, onClose, onCapture }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement>(null);

  const [session] = useState(() => new MultiPageSessionManager());
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [activePageIndex, setActivePageIndex] = useState<number | null>(null);
  const [retakeTargetIndex, setRetakeTargetIndex] = useState<number | null>(null);

  const [analysis, setAnalysis] = useState<CameraFrameAnalysis | null>(null);
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(true);
  const [isShutterFlashing, setIsShutterFlashing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previousQuadRef = useRef<Quad | null>(null);
  const autoCaptureStreakRef = useRef(0);
  const isCapturingRef = useRef(false);

  // Stop camera tracks cleanly
  const stopAndResetCamera = useCallback(() => {
    cameraManager.stopCamera(videoRef.current);
    setAnalysis(null);
    previousQuadRef.current = null;
    autoCaptureStreakRef.current = 0;
  }, []);

  // Start camera when modal opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
      cameraManager
        .startCamera(videoRef.current, 'environment')
        .catch((err: any) => {
          console.error('Camera init error:', err);
          setError(err.message || 'Unable to access camera.');
        });
    } else {
      stopAndResetCamera();
      session.clear();
      setPages([]);
      setActivePageIndex(null);
      setRetakeTargetIndex(null);
    }

    return () => {
      stopAndResetCamera();
    };
  }, [isOpen, session, stopAndResetCamera]);

  // Frame Analysis Loop (Lightweight local CV running every 120ms)
  useEffect(() => {
    if (!isOpen || !videoRef.current) return;

    let isSubscribed = true;
    const interval = setInterval(() => {
      if (!isSubscribed || !videoRef.current || isCapturingRef.current) return;
      const video = videoRef.current;

      if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        return;
      }

      // Sample onto downscaled 320x240 canvas for ultra-low CPU load (< 5ms execution)
      const sampleCanvas = sampleCanvasRef.current || document.createElement('canvas');
      const sampleWidth = 320;
      const sampleHeight = 240;
      sampleCanvas.width = sampleWidth;
      sampleCanvas.height = sampleHeight;

      const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      try {
        ctx.drawImage(video, 0, 0, sampleWidth, sampleHeight);
        const imgData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);

        const result = analyzeFrame(imgData, {
          previousQuad: previousQuadRef.current,
        });

        if (result.detectedQuad) {
          previousQuadRef.current = result.detectedQuad;
        }

        setAnalysis(result);

        // Auto-Capture logic: requires 3 consecutive stable frames
        if (autoCaptureEnabled && result.isReadyForAutoCapture) {
          autoCaptureStreakRef.current += 1;
          if (autoCaptureStreakRef.current >= 3) {
            autoCaptureStreakRef.current = 0;
            triggerCapture();
          }
        } else {
          autoCaptureStreakRef.current = 0;
        }
      } catch (e) {
        // Fallback silently if canvas context is not ready
      }
    }, 120);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [isOpen, autoCaptureEnabled]);

  // Performs capture, quad scaling, perspective rectification, and illumination normalization
  const triggerCapture = useCallback(() => {
    if (!videoRef.current || isCapturingRef.current) return;
    isCapturingRef.current = true;

    // Trigger visual shutter flash
    setIsShutterFlashing(true);
    setTimeout(() => setIsShutterFlashing(false), 200);

    const video = videoRef.current;
    const fullWidth = video.videoWidth || 1280;
    const fullHeight = video.videoHeight || 720;

    // Grab full resolution frame
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = fullWidth;
    fullCanvas.height = fullHeight;
    const fullCtx = fullCanvas.getContext('2d');

    if (!fullCtx) {
      isCapturingRef.current = false;
      return;
    }

    fullCtx.drawImage(video, 0, 0, fullWidth, fullHeight);
    const rawDataUrl = fullCanvas.toDataURL('image/jpeg', 0.95);

    let processedDataUrl = rawDataUrl;
    let finalQuad: Quad | undefined = undefined;

    // If quad detected on sample canvas, scale and rectify
    if (analysis?.detectedQuad) {
      const scaledQuad = scaleQuad(
        analysis.detectedQuad,
        320,
        240,
        fullWidth,
        fullHeight
      );
      finalQuad = scaledQuad;

      try {
        const rectifiedCanvas = warpPerspectiveAndCrop(fullCanvas, scaledQuad, {
          normalizeIllumination: true,
        });
        processedDataUrl = rectifiedCanvas.toDataURL('image/jpeg', 0.95);
      } catch (err) {
        console.warn('Warp failed, falling back to full frame:', err);
        processedDataUrl = rawDataUrl;
      }
    }

    if (retakeTargetIndex !== null) {
      // Retaking specific page
      session.retakePage(retakeTargetIndex, {
        base64Data: processedDataUrl,
        rawBase64Data: rawDataUrl,
        detectedQuad: finalQuad,
        width: fullWidth,
        height: fullHeight,
      });
      setRetakeTargetIndex(null);
    } else {
      // Adding new page
      session.addPage({
        base64Data: processedDataUrl,
        rawBase64Data: rawDataUrl,
        detectedQuad: finalQuad,
        width: fullWidth,
        height: fullHeight,
      });
    }

    const updatedPages = session.getPages();
    setPages(updatedPages);
    setActivePageIndex(updatedPages.length - 1);

    setTimeout(() => {
      isCapturingRef.current = false;
    }, 500);
  }, [analysis, retakeTargetIndex, session]);

  // Page Management Handlers
  const handleDeletePage = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    session.deletePage(index);
    const updated = session.getPages();
    setPages(updated);
    if (updated.length === 0) {
      setActivePageIndex(null);
    } else if (activePageIndex !== null && activePageIndex >= updated.length) {
      setActivePageIndex(updated.length - 1);
    }
  };

  const handleRetakePage = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setRetakeTargetIndex(index);
    setActivePageIndex(null); // Switch view back to camera
  };

  const handleMovePage = (index: number, direction: 'left' | 'right', e: React.MouseEvent) => {
    e.stopPropagation();
    const targetIdx = direction === 'left' ? index - 1 : index + 1;
    if (session.reorderPages(index, targetIdx)) {
      const updated = session.getPages();
      setPages(updated);
      setActivePageIndex(targetIdx);
    }
  };

  // Submit all scanned pages
  const handleConfirmScan = () => {
    if (pages.length === 0) return;

    stopAndResetCamera();
    onCapture({
      pages: pages.map((p) => ({
        base64Data: p.base64Data,
        pageNumber: p.pageNumber,
      })),
    });
    onClose();
  };

  if (!isOpen) return null;

  const currentPreviewPage =
    activePageIndex !== null && pages[activePageIndex] ? pages[activePageIndex] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-darkSurface-elev1 rounded-3xl border border-darkSurface-border shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-darkSurface-border bg-darkSurface-elev2/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-white">Physical Document Scanner</h3>
                <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <ShieldCheck className="w-3 h-3" /> Hardware Isolated
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Lightweight edge detection & perspective warp • Multi-page support
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Auto Capture Toggle */}
            <button
              onClick={() => setAutoCaptureEnabled(!autoCaptureEnabled)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                autoCaptureEnabled
                  ? 'bg-brand-primary/20 border-brand-primary text-brand-primary'
                  : 'bg-darkSurface-elev3 border-darkSurface-border text-gray-400 hover:text-white'
              }`}
              title="Automatically snaps when document is steady and in focus"
            >
              <Zap className={`w-3.5 h-3.5 ${autoCaptureEnabled ? 'fill-brand-primary' : ''}`} />
              <span>Auto-Snap: {autoCaptureEnabled ? 'ON' : 'OFF'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Viewport */}
        <div className="relative flex-1 min-h-[380px] sm:min-h-[440px] bg-black flex items-center justify-center overflow-hidden">
          {/* Shutter Flash Animation */}
          {isShutterFlashing && (
            <div className="absolute inset-0 bg-white z-40 animate-out fade-out duration-200 pointer-events-none" />
          )}

          {error ? (
            <div className="p-8 text-center max-w-md">
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-brand-red border border-red-500/20 flex items-center justify-center mx-auto mb-3">
                <Camera className="w-6 h-6" />
              </div>
              <p className="text-white font-semibold text-sm mb-1">Camera Access Issue</p>
              <p className="text-xs text-gray-400">{error}</p>
            </div>
          ) : currentPreviewPage ? (
            /* Page Preview Mode */
            <div className="relative w-full h-full flex flex-col items-center justify-center p-4">
              <img
                src={currentPreviewPage.base64Data}
                alt={`Scanned Page ${currentPreviewPage.pageNumber}`}
                className="max-h-[380px] w-auto object-contain rounded-xl border border-white/20 shadow-2xl"
              />
              <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-white text-xs font-mono">
                Viewing Page {currentPreviewPage.pageNumber} of {pages.length} (Rectified & Normalized)
              </div>
            </div>
          ) : (
            /* Live Camera Mode with CV Overlay */
            <div className="relative w-full h-full flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Edge Detection Quad Overlay */}
              {analysis?.detectedQuad && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 320 240" preserveAspectRatio="none">
                  <polygon
                    points={`${analysis.detectedQuad[0].x},${analysis.detectedQuad[0].y} ${analysis.detectedQuad[1].x},${analysis.detectedQuad[1].y} ${analysis.detectedQuad[2].x},${analysis.detectedQuad[2].y} ${analysis.detectedQuad[3].x},${analysis.detectedQuad[3].y}`}
                    className={`stroke-2 transition-all duration-150 ${
                      analysis.isReadyForAutoCapture
                        ? 'fill-emerald-500/20 stroke-emerald-400'
                        : 'fill-cyan-500/15 stroke-cyan-400'
                    }`}
                  />
                  {/* Targeting corner crosshairs */}
                  {analysis.detectedQuad.map((pt, idx) => (
                    <circle
                      key={idx}
                      cx={pt.x}
                      cy={pt.y}
                      r="4"
                      className="fill-white stroke-2 stroke-emerald-400"
                    />
                  ))}
                </svg>
              )}

              {/* Viewfinder Target Framing Guidelines (Fallback) */}
              {!analysis?.detectedQuad && (
                <div className="absolute inset-10 sm:inset-14 border-2 border-dashed border-white/30 rounded-2xl pointer-events-none flex items-center justify-center">
                  <div className="text-center p-3 bg-black/50 backdrop-blur-sm rounded-xl">
                    <Scan className="w-6 h-6 text-white/70 mx-auto mb-1 animate-pulse" />
                    <span className="text-white/80 text-xs font-medium">
                      Position physical paper inside frame
                    </span>
                  </div>
                </div>
              )}

              {/* Live Guidance HUD Chip */}
              {analysis && (
                <div className="absolute top-4 inset-x-0 flex justify-center pointer-events-none">
                  <div
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold shadow-lg backdrop-blur-md transition-all ${
                      analysis.guidance === 'READY_TO_CAPTURE'
                        ? 'bg-emerald-600/90 text-white border border-emerald-400/50 shadow-emerald-900/30'
                        : analysis.guidance === 'TOO_DARK'
                        ? 'bg-amber-600/90 text-white border border-amber-400/50'
                        : analysis.guidance === 'TOO_BLURRY'
                        ? 'bg-red-600/90 text-white border border-red-400/50'
                        : analysis.guidance === 'HOLD_STEADY'
                        ? 'bg-blue-600/90 text-white border border-blue-400/50'
                        : 'bg-black/75 text-gray-200 border border-white/20'
                    }`}
                  >
                    {analysis.guidance === 'READY_TO_CAPTURE' && <Check className="w-4 h-4 text-white" />}
                    {analysis.guidance === 'TOO_DARK' && <Sun className="w-4 h-4 text-amber-200" />}
                    {analysis.guidance === 'TOO_BLURRY' && <Eye className="w-4 h-4 text-red-200" />}
                    {analysis.guidance === 'HOLD_STEADY' && <Sliders className="w-4 h-4 text-blue-200" />}
                    {analysis.guidance === 'SEARCHING' && <Scan className="w-4 h-4 text-gray-400" />}
                    <span>{analysis.guidanceMessage}</span>
                  </div>
                </div>
              )}

              {retakeTargetIndex !== null && (
                <div className="absolute bottom-4 left-4 bg-amber-500/90 text-black px-3 py-1.5 rounded-full text-xs font-bold shadow-md">
                  Retaking Page {retakeTargetIndex + 1}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Multi-Page Carousel Tray & Action Bar */}
        <div className="border-t border-darkSurface-border bg-darkSurface-elev2 p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Scanned Pages Thumbnails Strip */}
            <div className="flex items-center gap-3 overflow-x-auto w-full sm:w-auto py-1 max-w-full">
              {pages.map((p, idx) => {
                const isSelected = activePageIndex === idx;
                return (
                  <div
                    key={p.id}
                    onClick={() => setActivePageIndex(isSelected ? null : idx)}
                    className={`group relative flex-shrink-0 w-16 h-20 rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${
                      isSelected
                        ? 'border-brand-primary ring-2 ring-brand-primary/40 shadow-glow'
                        : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    <img
                      src={p.base64Data}
                      alt={`Page ${p.pageNumber}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-1 left-1 bg-black/75 px-1.5 py-0.5 rounded text-[10px] font-bold text-white">
                      P{p.pageNumber}
                    </div>

                    {/* Quick page actions overlay */}
                    <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 transition-opacity">
                      <div className="flex items-center gap-1">
                        {idx > 0 && (
                          <button
                            onClick={(e) => handleMovePage(idx, 'left', e)}
                            className="p-1 rounded bg-white/20 text-white hover:bg-white/40"
                            title="Move page left"
                          >
                            <ChevronLeft className="w-3 h-3" />
                          </button>
                        )}
                        {idx < pages.length - 1 && (
                          <button
                            onClick={(e) => handleMovePage(idx, 'right', e)}
                            className="p-1 rounded bg-white/20 text-white hover:bg-white/40"
                            title="Move page right"
                          >
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <button
                          onClick={(e) => handleRetakePage(idx, e)}
                          className="p-1 rounded bg-blue-500/80 text-white hover:bg-blue-600"
                          title="Retake this page"
                        >
                          <RefreshCw className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => handleDeletePage(idx, e)}
                          className="p-1 rounded bg-red-500/80 text-white hover:bg-red-600"
                          title="Delete page"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Add Page Button */}
              {pages.length > 0 && (
                <button
                  onClick={() => {
                    setActivePageIndex(null);
                    setRetakeTargetIndex(null);
                  }}
                  className={`flex flex-col items-center justify-center flex-shrink-0 w-16 h-20 rounded-xl border border-dashed text-xs font-medium transition-all ${
                    activePageIndex === null
                      ? 'border-brand-primary/60 bg-brand-primary/10 text-brand-primary'
                      : 'border-white/20 text-gray-400 hover:text-white hover:border-white/40'
                  }`}
                  title="Scan next page"
                >
                  <Plus className="w-5 h-5 mb-1" />
                  <span className="text-[10px]">Add Page</span>
                </button>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 flex-shrink-0 w-full sm:w-auto justify-end">
              {currentPreviewPage ? (
                <>
                  <button
                    onClick={() => handleRetakePage(activePageIndex!, {} as any)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-darkSurface-border text-white text-xs font-semibold hover:bg-darkSurface-elev3 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4 text-blue-400" />
                    <span>Retake Page {currentPreviewPage.pageNumber}</span>
                  </button>
                  <button
                    onClick={() => setActivePageIndex(null)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-darkSurface-elev3 text-white text-xs font-semibold hover:bg-white/10 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Scan Next Page</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={triggerCapture}
                  disabled={!!error}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white text-black font-bold text-xs shadow-lg hover:bg-gray-100 active:scale-95 transition-all disabled:opacity-50"
                >
                  <Camera className="w-4 h-4 text-brand-primary" />
                  <span>
                    {retakeTargetIndex !== null
                      ? `Retake Page ${retakeTargetIndex + 1}`
                      : pages.length === 0
                      ? 'Capture Page 1'
                      : `Capture Page ${pages.length + 1}`}
                  </span>
                </button>
              )}

              {pages.length > 0 && (
                <button
                  onClick={handleConfirmScan}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant text-white text-xs font-bold shadow-glow hover:brightness-110 active:scale-95 transition-all"
                >
                  <Check className="w-4 h-4" />
                  <span>Extract MCQs ({pages.length} {pages.length === 1 ? 'Page' : 'Pages'})</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
