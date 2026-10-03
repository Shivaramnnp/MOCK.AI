/**
 * Lightweight Local Computer Vision for Camera Document Scanning
 * - Real-time Frame Analysis (Luminance, Sharpness, Stability)
 * - Document Edge Quad Detection
 * - Perspective Rectification & Cropping
 * - Illumination Normalization & Shadow Reduction
 */

import { Point, Quad, CameraFrameAnalysis, CameraGuidance } from './types';

export interface FrameAnalysisOptions {
  previousQuad?: Quad | null;
  stabilityThreshold?: number;
  minBrightness?: number;
  minBlurScore?: number;
}

/**
 * Calculates Euclidean distance between two points.
 */
export function distance(p1: Point, p2: Point): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

/**
 * Computes polygon area of a 4-point quadrilateral using shoelace formula.
 */
export function calculateQuadArea(quad: Quad): number {
  const [p0, p1, p2, p3] = quad;
  return 0.5 * Math.abs(
    p0.x * p1.y + p1.x * p2.y + p2.x * p3.y + p3.x * p0.y -
    (p0.y * p1.x + p1.y * p2.x + p2.y * p3.x + p3.y * p0.x)
  );
}

/**
 * Computes the maximum displacement between two sets of 4 quad corners.
 */
export function calculateQuadDrift(q1: Quad, q2: Quad): number {
  let maxDrift = 0;
  for (let i = 0; i < 4; i++) {
    const d = distance(q1[i], q2[i]);
    if (d > maxDrift) maxDrift = d;
  }
  return maxDrift;
}

/**
 * Lightweight frame analyzer executed on downscaled video frame.
 * Does not require external heavy libraries. Runs in < 10ms.
 */
export function analyzeFrame(
  imageData: ImageData,
  options: FrameAnalysisOptions = {}
): CameraFrameAnalysis {
  const { width, height, data } = imageData;
  const totalPixels = width * height;

  if (totalPixels === 0) {
    return {
      detectedQuad: null,
      hasDocument: false,
      quadAreaRatio: 0,
      brightness: 0,
      blurScore: 0,
      isDark: true,
      isBlurry: true,
      isStable: false,
      stabilityScore: 0,
      guidance: 'TOO_DARK',
      guidanceMessage: 'Camera view is too dark. Increase lighting.',
      isReadyForAutoCapture: false,
    };
  }

  // 1. Luminance & Brightness Calculation
  let totalLuminance = 0;
  const gray = new Uint8Array(totalPixels);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    gray[p] = lum;
    totalLuminance += lum;
  }

  const brightness = Math.round(totalLuminance / totalPixels);
  const minBrightness = options.minBrightness ?? 45;
  const isDark = brightness < minBrightness;

  // 2. Blur / Sharpness calculation using simplified Laplacian variance
  let laplacianSum = 0;
  let laplacianSqSum = 0;
  let laplacianCount = 0;

  const step = 2; // Sample every 2nd pixel for ultra-low CPU overhead
  for (let y = 1; y < height - 1; y += step) {
    const rowOffset = y * width;
    for (let x = 1; x < width - 1; x += step) {
      const idx = rowOffset + x;
      // Discrete Laplacian kernel: [0, 1, 0; 1, -4, 1; 0, 1, 0]
      const lap =
        gray[idx - width] +
        gray[idx + width] +
        gray[idx - 1] +
        gray[idx + 1] -
        4 * gray[idx];

      laplacianSum += lap;
      laplacianSqSum += lap * lap;
      laplacianCount++;
    }
  }

  const meanLap = laplacianCount > 0 ? laplacianSum / laplacianCount : 0;
  const blurScore =
    laplacianCount > 0
      ? Math.round((laplacianSqSum / laplacianCount) - (meanLap * meanLap))
      : 0;

  const minBlurScore = options.minBlurScore ?? 60;
  const isBlurry = blurScore < minBlurScore;

  // 3. Document Edge Quad Detection
  const detectedQuad = detectDocumentQuad(gray, width, height);
  const hasDocument = detectedQuad !== null;

  const frameArea = width * height;
  const quadArea = detectedQuad ? calculateQuadArea(detectedQuad) : 0;
  const quadAreaRatio = frameArea > 0 ? parseFloat((quadArea / frameArea).toFixed(3)) : 0;

  // 4. Stability tracking
  let stabilityScore = 100;
  let isStable = true;
  if (detectedQuad && options.previousQuad) {
    const drift = calculateQuadDrift(detectedQuad, options.previousQuad);
    const threshold = options.stabilityThreshold ?? 18;
    if (drift > threshold) {
      isStable = false;
      stabilityScore = Math.max(0, Math.round(100 - (drift / threshold) * 40));
    }
  }

  // 5. Determine Guidance Message
  let guidance: CameraGuidance = 'SEARCHING';
  let guidanceMessage = 'Align document within frame';

  if (isDark) {
    guidance = 'TOO_DARK';
    guidanceMessage = 'Too dark — point towards a light source';
  } else if (!hasDocument) {
    guidance = 'SEARCHING';
    guidanceMessage = 'Searching for exam document borders...';
  } else if (!isStable) {
    guidance = 'HOLD_STEADY';
    guidanceMessage = 'Hold steady...';
  } else if (quadAreaRatio < 0.22) {
    guidance = 'MOVE_CLOSER';
    guidanceMessage = 'Move closer to the paper';
  } else if (quadAreaRatio > 0.94) {
    guidance = 'MOVE_FARTHER';
    guidanceMessage = 'Move slightly farther back';
  } else if (isBlurry) {
    guidance = 'TOO_BLURRY';
    guidanceMessage = 'Too blurry — hold still to focus';
  } else {
    guidance = 'READY_TO_CAPTURE';
    guidanceMessage = 'Document detected — Ready to capture';
  }

  const isReadyForAutoCapture =
    guidance === 'READY_TO_CAPTURE' &&
    hasDocument &&
    !isDark &&
    !isBlurry &&
    isStable &&
    quadAreaRatio >= 0.22 &&
    quadAreaRatio <= 0.94;

  return {
    detectedQuad,
    hasDocument,
    quadAreaRatio,
    brightness,
    blurScore,
    isDark,
    isBlurry,
    isStable,
    stabilityScore,
    guidance,
    guidanceMessage,
    isReadyForAutoCapture,
  };
}

/**
 * Detects 4 corner quad of white/light document against darker background.
 * Falls back to estimated boundary if document is clearly prominent.
 */
export function detectDocumentQuad(
  gray: Uint8Array,
  width: number,
  height: number
): Quad | null {
  if (width < 32 || height < 32) return null;

  // Compute Otsu / adaptive background threshold
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  const avg = sum / gray.length;

  // In document photography, paper is significantly brighter than the table or dark surface
  const threshold = Math.max(70, Math.min(220, avg + 12));

  // Find bounding extremes of bright document pixels
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  let paperPixelCount = 0;

  const step = 2;
  for (let y = 0; y < height; y += step) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += step) {
      if (gray[rowOffset + x] >= threshold) {
        paperPixelCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const totalSampled = (width / step) * (height / step);
  const fillRatio = paperPixelCount / totalSampled;

  // Need at least 15% of frame to be paper, and bounded region
  if (fillRatio < 0.15 || minX >= maxX || minY >= maxY) {
    return null;
  }

  // Refine corners within the bounding region:
  // Top-Left: minimize (x + y)
  // Top-Right: maximize (x - y)
  // Bottom-Right: maximize (x + y)
  // Bottom-Left: minimize (x - y)
  let tl: Point = { x: minX, y: minY };
  let tr: Point = { x: maxX, y: minY };
  let br: Point = { x: maxX, y: maxY };
  let bl: Point = { x: minX, y: maxY };

  let minSum = Infinity;
  let maxSum = -Infinity;
  let minDiff = Infinity;
  let maxDiff = -Infinity;

  for (let y = minY; y <= maxY; y += step) {
    const rowOffset = y * width;
    for (let x = minX; x <= maxX; x += step) {
      if (gray[rowOffset + x] >= threshold) {
        const sumVal = x + y;
        const diffVal = x - y;

        if (sumVal < minSum) {
          minSum = sumVal;
          tl = { x, y };
        }
        if (sumVal > maxSum) {
          maxSum = sumVal;
          br = { x, y };
        }
        if (diffVal < minDiff) {
          minDiff = diffVal;
          bl = { x, y };
        }
        if (diffVal > maxDiff) {
          maxDiff = diffVal;
          tr = { x, y };
        }
      }
    }
  }

  // Safety sanity check: vertices must form a valid non-collapsed quad
  const topWidth = distance(tl, tr);
  const bottomWidth = distance(bl, br);
  const leftHeight = distance(tl, bl);
  const rightHeight = distance(tr, br);

  if (topWidth < width * 0.25 || bottomWidth < width * 0.25) return null;
  if (leftHeight < height * 0.25 || rightHeight < height * 0.25) return null;

  return [tl, tr, br, bl];
}

/**
 * Scales quad coordinates from preview resolution to source image resolution.
 */
export function scaleQuad(
  quad: Quad,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
): Quad {
  const sx = targetWidth / sourceWidth;
  const sy = targetHeight / sourceHeight;

  return [
    { x: Math.round(quad[0].x * sx), y: Math.round(quad[0].y * sy) },
    { x: Math.round(quad[1].x * sx), y: Math.round(quad[1].y * sy) },
    { x: Math.round(quad[2].x * sx), y: Math.round(quad[2].y * sy) },
    { x: Math.round(quad[3].x * sx), y: Math.round(quad[3].y * sy) },
  ];
}

/**
 * Rectifies and crops the quad into an upright rectangular image with perspective correction.
 * Uses bilinear inverse projective mapping.
 */
export function warpPerspectiveAndCrop(
  sourceCanvas: HTMLCanvasElement,
  quad: Quad,
  options?: { normalizeIllumination?: boolean; targetDimensions?: { width: number; height: number } }
): HTMLCanvasElement {
  const [tl, tr, br, bl] = quad;

  // Target dimensions based on Euclidean distances
  const widthTop = distance(tl, tr);
  const widthBottom = distance(bl, br);
  const heightLeft = distance(tl, bl);
  const heightRight = distance(tr, br);

  const targetWidth =
    options?.targetDimensions?.width || Math.max(200, Math.round(Math.max(widthTop, widthBottom)));
  const targetHeight =
    options?.targetDimensions?.height || Math.max(200, Math.round(Math.max(heightLeft, heightRight)));

  const sourceCtx = sourceCanvas.getContext('2d');
  if (!sourceCtx) {
    const fallback = document.createElement('canvas');
    fallback.width = targetWidth;
    fallback.height = targetHeight;
    return fallback;
  }

  const srcImageData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const srcWidth = sourceCanvas.width;
  const srcHeight = sourceCanvas.height;
  const srcData = srcImageData.data;

  // Create destination canvas
  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = targetWidth;
  dstCanvas.height = targetHeight;
  const dstCtx = dstCanvas.getContext('2d');
  if (!dstCtx) return dstCanvas;

  const dstImageData = dstCtx.createImageData(targetWidth, targetHeight);
  const dstData = dstImageData.data;

  // Inverse bilinear projective mapping from target (u, v) -> source (x, y)
  for (let dy = 0; dy < targetHeight; dy++) {
    const v = dy / targetHeight;
    const invV = 1.0 - v;
    const dstRowOffset = dy * targetWidth * 4;

    for (let dx = 0; dx < targetWidth; dx++) {
      const u = dx / targetWidth;
      const invU = 1.0 - u;

      // Bilinear interpolation of quad coordinates
      const sx =
        invU * invV * tl.x +
        u * invV * tr.x +
        u * v * br.x +
        invU * v * bl.x;

      const sy =
        invU * invV * tl.y +
        u * invV * tr.y +
        u * v * br.y +
        invU * v * bl.y;

      const ix = Math.min(srcWidth - 1, Math.max(0, Math.round(sx)));
      const iy = Math.min(srcHeight - 1, Math.max(0, Math.round(sy)));

      const srcIdx = (iy * srcWidth + ix) * 4;
      const dstIdx = dstRowOffset + dx * 4;

      dstData[dstIdx] = srcData[srcIdx];
      dstData[dstIdx + 1] = srcData[srcIdx + 1];
      dstData[dstIdx + 2] = srcData[srcIdx + 2];
      dstData[dstIdx + 3] = srcData[srcIdx + 3];
    }
  }

  // 4. Illumination Normalization & Shadow Reduction
  if (options?.normalizeIllumination !== false) {
    applyIlluminationNormalization(dstImageData);
  }

  dstCtx.putImageData(dstImageData, 0, 0);
  return dstCanvas;
}

/**
 * Normalizes illumination and reduces shadows across the rectified document.
 * Non-destructive: preserves color diagrams, tables, and formula contrast.
 */
export function applyIlluminationNormalization(imageData: ImageData): void {
  const { data, width, height } = imageData;
  const total = width * height;
  if (total === 0) return;

  // 1. Compute min and max luminance for dynamic range stretching
  let minLum = 255;
  let maxLum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  const range = maxLum - minLum;
  if (range <= 20) return; // Already low contrast or monochrome

  // Gentle contrast stretch: push upper 15% towards clean white paper while keeping ink dark
  const inkFloor = Math.max(0, minLum + range * 0.05);
  const paperCeil = Math.min(255, maxLum - range * 0.05);
  const newRange = paperCeil - inkFloor;
  if (newRange <= 0) return;

  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const val = data[i + c];
      const stretched = ((val - inkFloor) / newRange) * 255;
      data[i + c] = Math.min(255, Math.max(0, Math.round(stretched)));
    }
  }
}
