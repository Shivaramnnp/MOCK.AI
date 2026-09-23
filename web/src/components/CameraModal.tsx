import React, { useRef, useState, useEffect } from 'react';
import { Camera, X, RefreshCw, Check } from 'lucide-react';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (base64Data: string) => void;
}

export const CameraModal: React.FC<CameraModalProps> = ({ isOpen, onClose, onCapture }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && !capturedImage) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, capturedImage]);

  const startCamera = async () => {
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setError('Camera access denied or unavailable. Please check browser permissions.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const takePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setCapturedImage(dataUrl);
      stopCamera();
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
  };

  const confirmPhoto = () => {
    if (capturedImage) {
      onCapture(capturedImage);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-darkSurface-elev1 rounded-3xl border border-darkSurface-border shadow-2xl p-5 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-darkSurface-border">
          <div className="flex items-center gap-2 text-white">
            <Camera className="w-5 h-5 text-brand-primary" />
            <h3 className="font-bold text-lg">Scan Physical Exam / Page</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewport */}
        <div className="relative mt-4 aspect-[4/3] rounded-2xl bg-black overflow-hidden flex items-center justify-center border border-darkSurface-border">
          {error ? (
            <div className="p-6 text-center text-brand-red text-sm">
              <p>{error}</p>
            </div>
          ) : capturedImage ? (
            <img src={capturedImage} alt="Captured" className="w-full h-full object-contain" />
          ) : (
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          )}

          {/* Guidelines Overlay */}
          {!capturedImage && !error && (
            <div className="absolute inset-8 border-2 border-dashed border-white/40 rounded-xl pointer-events-none flex items-center justify-center">
              <span className="text-white/60 text-xs font-mono bg-black/40 px-2 py-1 rounded">
                Align exam paper inside frame
              </span>
            </div>
          )}
        </div>
        <canvas ref={canvasRef} className="hidden" />

        {/* Action Controls */}
        <div className="flex items-center justify-center gap-4 mt-5">
          {capturedImage ? (
            <>
              <button
                onClick={retakePhoto}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-darkSurface-border text-white text-sm font-semibold hover:bg-darkSurface-elev2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retake</span>
              </button>
              <button
                onClick={confirmPhoto}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant text-white text-sm font-semibold shadow-glow hover:brightness-110"
              >
                <Check className="w-4 h-4" />
                <span>Extract MCQs</span>
              </button>
            </>
          ) : (
            <button
              onClick={takePhoto}
              disabled={!!error}
              className="flex items-center gap-2 px-8 py-3 rounded-full bg-gradient-to-r from-brand-primary to-brand-variant text-white font-bold text-sm shadow-glow hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
            >
              <Camera className="w-5 h-5" />
              <span>Capture Page</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
