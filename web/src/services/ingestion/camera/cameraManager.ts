/**
 * WebRTC Camera Lifecycle & Stream Manager
 * Mock.AI Production Ingestion Engine - Prompt 7/10
 *
 * Enforces strict privacy guarantees:
 * - Permission requested ONLY when user opens camera scanner
 * - All tracks stopped immediately upon close, navigation, or processing completion
 */

export class CameraStreamManager {
  private activeStream: MediaStream | null = null;
  private currentFacingMode: 'environment' | 'user' = 'environment';

  /**
   * Checks if camera API is supported in the current browser environment.
   */
  isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function'
    );
  }

  /**
   * Starts camera stream and attaches to provided HTMLVideoElement.
   */
  async startCamera(
    videoElement?: HTMLVideoElement | null,
    facingMode: 'environment' | 'user' = 'environment'
  ): Promise<MediaStream> {
    this.stopCamera(); // Clean up existing stream if any
    this.currentFacingMode = facingMode;

    if (!this.isSupported()) {
      throw new Error(
        'Camera API is not supported in this browser or environment.'
      );
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.activeStream = stream;

      if (videoElement) {
        videoElement.srcObject = stream;
        try {
          await videoElement.play();
        } catch {
          // In some browsers play() may reject if user has not interacted yet
        }
      }

      return stream;
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('Camera access permission was denied. Please allow camera access in your browser settings.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        throw new Error('No camera hardware found on this device.');
      }
      throw new Error(err.message || 'Failed to initialize camera.');
    }
  }

  /**
   * Halts all media tracks immediately and detaches video source.
   */
  stopCamera(videoElement?: HTMLVideoElement | null): void {
    if (this.activeStream) {
      this.activeStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore track stop errors
        }
      });
      this.activeStream = null;
    }

    if (videoElement && videoElement.srcObject) {
      videoElement.srcObject = null;
    }
  }

  /**
   * Switches between back (environment) and front (user) facing cameras.
   */
  async toggleCamera(videoElement?: HTMLVideoElement | null): Promise<MediaStream> {
    const nextMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
    return this.startCamera(videoElement, nextMode);
  }

  /**
   * Grabs a high-resolution snapshot from the active video element.
   */
  captureFrame(videoElement: HTMLVideoElement): { canvas: HTMLCanvasElement; dataUrl: string } | null {
    if (!videoElement) return null;

    const width = videoElement.videoWidth || 1280;
    const height = videoElement.videoHeight || 720;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(videoElement, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

    return { canvas, dataUrl };
  }

  getActiveStream(): MediaStream | null {
    return this.activeStream;
  }

  getFacingMode(): 'environment' | 'user' {
    return this.currentFacingMode;
  }
}

export const cameraManager = new CameraStreamManager();
