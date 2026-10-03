import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateQuadArea,
  calculateQuadDrift,
  analyzeFrame,
  detectDocumentQuad,
  scaleQuad,
  warpPerspectiveAndCrop,
  applyIlluminationNormalization,
} from './documentDetector';
import { CameraStreamManager } from './cameraManager';
import { MultiPageSessionManager, processMultiPageScan } from './multiPageScanner';
import { CameraSourceAdapter } from '../adapters/CameraSourceAdapter';
import { Quad, Point } from './types';
import * as imageEngineModule from '../image/imageEngine';

// Sample helper to build mock ImageData
function createMockImageData(
  width: number,
  height: number,
  fillR = 255,
  fillG = 255,
  fillB = 255
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fillR;
    data[i + 1] = fillG;
    data[i + 2] = fillB;
    data[i + 3] = 255;
  }
  return {
    width,
    height,
    data,
    colorSpace: 'srgb',
  } as ImageData;
}

// Sample helper to create pattern with a bright document on dark table
function createDocumentPatternImageData(
  width: number,
  height: number,
  docBox: { x0: number; y0: number; x1: number; y1: number }
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const isInsideDoc =
        x >= docBox.x0 && x <= docBox.x1 && y >= docBox.y0 && y <= docBox.y1;

      // Dark desk = 30, Bright document = 220 with slight texture
      const val = isInsideDoc ? (200 + ((x + y) % 30)) : 30;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }
  return {
    width,
    height,
    data,
    colorSpace: 'srgb',
  } as ImageData;
}

describe('Camera Document Scanner Engine (Prompt 7/10)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Lightweight Local CV & Document Detection', () => {
    it('should compute exact polygon area of a 4-point quadrilateral using shoelace formula', () => {
      const quad: Quad = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 80 },
        { x: 0, y: 80 },
      ];
      const area = calculateQuadArea(quad);
      expect(area).toBe(8000);
    });

    it('should calculate corner drift between consecutive frames', () => {
      const q1: Quad = [
        { x: 10, y: 10 },
        { x: 100, y: 10 },
        { x: 100, y: 80 },
        { x: 10, y: 80 },
      ];
      const q2: Quad = [
        { x: 15, y: 10 }, // 5px drift
        { x: 100, y: 10 },
        { x: 100, y: 80 },
        { x: 10, y: 80 },
      ];
      expect(calculateQuadDrift(q1, q2)).toBe(5);
    });

    it('should detect TOO_DARK when camera frame luminance is below threshold', () => {
      const darkFrame = createMockImageData(100, 100, 20, 20, 20); // Brightness ~20
      const analysis = analyzeFrame(darkFrame);

      expect(analysis.isDark).toBe(true);
      expect(analysis.guidance).toBe('TOO_DARK');
      expect(analysis.isReadyForAutoCapture).toBe(false);
      expect(analysis.guidanceMessage).toContain('Too dark');
    });

    it('should detect TOO_BLURRY when frame has no edge contrast / high frequency detail', () => {
      // Solid gray image: zero gradients, zero Laplacian variance
      const flatFrame = createMockImageData(100, 100, 150, 150, 150);
      const analysis = analyzeFrame(flatFrame);

      expect(analysis.isBlurry).toBe(true);
      // Because it has no document contrast either, it will search or flag blur
      expect(analysis.isReadyForAutoCapture).toBe(false);
    });

    it('should detect document boundary quad on contrasting background and prompt READY_TO_CAPTURE', () => {
      // Frame 200x200 with document occupying 100x120 (area = 12000 / 40000 = 30%)
      const frame = createDocumentPatternImageData(200, 200, {
        x0: 40,
        y0: 30,
        x1: 160,
        y1: 170,
      });

      const analysis = analyzeFrame(frame);
      expect(analysis.hasDocument).toBe(true);
      expect(analysis.detectedQuad).not.toBeNull();
      expect(analysis.quadAreaRatio).toBeGreaterThan(0.2);
      expect(analysis.isDark).toBe(false);
      expect(analysis.guidance).toBe('READY_TO_CAPTURE');
      expect(analysis.isReadyForAutoCapture).toBe(true);
    });

    it('should prompt MOVE_CLOSER when detected quad area is too small (< 22%)', () => {
      // Tiny document in center: 30x30 on 200x200 (area ratio = 900 / 40000 = 0.0225)
      // Because detectDocumentQuad requires min 15% fill, let's create a 16% document
      // 16% of 40000 = 6400 -> 80x80 = 6400 (ratio = 0.16)
      const frame = createDocumentPatternImageData(200, 200, {
        x0: 60,
        y0: 60,
        x1: 140,
        y1: 140,
      });

      const analysis = analyzeFrame(frame);
      expect(analysis.hasDocument).toBe(true);
      expect(analysis.quadAreaRatio).toBeLessThan(0.22);
      expect(analysis.guidance).toBe('MOVE_CLOSER');
      expect(analysis.isReadyForAutoCapture).toBe(false);
    });

    it('should prompt HOLD_STEADY when camera movement produces significant corner drift', () => {
      const frame = createDocumentPatternImageData(200, 200, {
        x0: 40,
        y0: 30,
        x1: 160,
        y1: 170,
      });

      // Previous frame had quad far away (drift > 20px)
      const previousQuad: Quad = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];

      const analysis = analyzeFrame(frame, { previousQuad });
      expect(analysis.isStable).toBe(false);
      expect(analysis.guidance).toBe('HOLD_STEADY');
      expect(analysis.isReadyForAutoCapture).toBe(false);
    });

    it('should scale quad coordinates accurately from preview to full resolution', () => {
      const previewQuad: Quad = [
        { x: 10, y: 20 },
        { x: 90, y: 20 },
        { x: 90, y: 80 },
        { x: 10, y: 80 },
      ];

      const fullQuad = scaleQuad(previewQuad, 100, 100, 1920, 1080);
      expect(fullQuad[0]).toEqual({ x: 192, y: 216 });
      expect(fullQuad[2]).toEqual({ x: 1728, y: 864 });
    });

    it('should rectify quad and perform perspective crop on canvas', () => {
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = 200;
      srcCanvas.height = 200;
      const ctx = srcCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 200, 200);
      }

      const quad: Quad = [
        { x: 20, y: 20 },
        { x: 180, y: 25 },
        { x: 175, y: 180 },
        { x: 25, y: 175 },
      ];

      const rectified = warpPerspectiveAndCrop(srcCanvas, quad, {
        targetDimensions: { width: 160, height: 160 },
      });

      expect(rectified).toBeDefined();
      expect(rectified.width).toBe(160);
      expect(rectified.height).toBe(160);
    });

    it('should normalize illumination non-destructively to reduce shadows', () => {
      const imgData = createMockImageData(10, 10, 80, 80, 80);
      // Give some variation
      imgData.data[0] = 40; // min
      imgData.data[4] = 200; // max

      applyIlluminationNormalization(imgData);
      // Should have stretched the contrast
      expect(imgData.data[4]).toBeGreaterThanOrEqual(200);
    });
  });

  describe('2. WebRTC Camera Lifecycle & Privacy Management', () => {
    it('should verify camera support and manage tracks', () => {
      const manager = new CameraStreamManager();
      expect(typeof manager.isSupported()).toBe('boolean');
    });

    it('should safely stop media tracks and clear active stream', () => {
      const manager = new CameraStreamManager();
      const mockStop = vi.fn();
      const mockTrack = { stop: mockStop, kind: 'video' } as unknown as MediaStreamTrack;
      const mockStream = {
        getTracks: () => [mockTrack],
      } as unknown as MediaStream;

      (manager as any).activeStream = mockStream;
      manager.stopCamera();

      expect(mockStop).toHaveBeenCalled();
      expect(manager.getActiveStream()).toBeNull();
    });
  });

  describe('3. Multi-Page Scanner Session Management', () => {
    it('should add pages with contiguous 1-indexed numbering', () => {
      const session = new MultiPageSessionManager();
      expect(session.getPageCount()).toBe(0);

      const p1 = session.addPage({
        base64Data: 'data:image/jpeg;base64,page1Data',
        width: 1280,
        height: 720,
      });
      const p2 = session.addPage({
        base64Data: 'data:image/jpeg;base64,page2Data',
        width: 1280,
        height: 720,
      });

      expect(session.getPageCount()).toBe(2);
      expect(p1.pageNumber).toBe(1);
      expect(p2.pageNumber).toBe(2);
    });

    it('should retake an existing page without altering page numbers', () => {
      const session = new MultiPageSessionManager();
      session.addPage({ base64Data: 'data:image/jpeg;base64,p1', width: 800, height: 600 });
      session.addPage({ base64Data: 'data:image/jpeg;base64,p2', width: 800, height: 600 });

      const updated = session.retakePage(0, {
        base64Data: 'data:image/jpeg;base64,p1Retaken',
        width: 800,
        height: 600,
      });

      expect(updated).not.toBeNull();
      expect(updated?.pageNumber).toBe(1);
      expect(updated?.base64Data).toContain('p1Retaken');
      expect(session.getPage(1)?.pageNumber).toBe(2);
    });

    it('should delete a page and maintain contiguous 1..N re-indexing', () => {
      const session = new MultiPageSessionManager();
      session.addPage({ base64Data: 'data:image/jpeg;base64,p1', width: 800, height: 600 });
      session.addPage({ base64Data: 'data:image/jpeg;base64,p2', width: 800, height: 600 });
      session.addPage({ base64Data: 'data:image/jpeg;base64,p3', width: 800, height: 600 });

      expect(session.getPageCount()).toBe(3);

      // Delete Page 2
      const deleted = session.deletePage(1);
      expect(deleted).toBe(true);
      expect(session.getPageCount()).toBe(2);

      const pages = session.getPages();
      expect(pages[0].base64Data).toContain('p1');
      expect(pages[0].pageNumber).toBe(1);

      // What was Page 3 must now be Page 2
      expect(pages[1].base64Data).toContain('p3');
      expect(pages[1].pageNumber).toBe(2);
    });

    it('should reorder pages and update contiguous page numbers', () => {
      const session = new MultiPageSessionManager();
      session.addPage({ base64Data: 'data:image/jpeg;base64,pageA', width: 800, height: 600 });
      session.addPage({ base64Data: 'data:image/jpeg;base64,pageB', width: 800, height: 600 });
      session.addPage({ base64Data: 'data:image/jpeg;base64,pageC', width: 800, height: 600 });

      // Move Page 3 (index 2) to the front (index 0)
      const reordered = session.reorderPages(2, 0);
      expect(reordered).toBe(true);

      const pages = session.getPages();
      expect(pages[0].base64Data).toContain('pageC');
      expect(pages[0].pageNumber).toBe(1);

      expect(pages[1].base64Data).toContain('pageA');
      expect(pages[1].pageNumber).toBe(2);

      expect(pages[2].base64Data).toContain('pageB');
      expect(pages[2].pageNumber).toBe(3);
    });
  });

  describe('4. Multi-Page Batch Processing & Image Pipeline Reuse', () => {
    it('should aggregate multi-page scans, preserve monotonic numbering, and assign page provenance', async () => {
      // Mock processImage so we verify orchestration and provenance without invoking real OCR
      const spyProcessImage = vi.spyOn(imageEngineModule, 'processImage').mockImplementation(
        async (input: any) => {
          const isPage2 = input.fileName?.includes('Page 2');
          return {
            success: true,
            imageHash: 'hash-' + input.fileName,
            quality: {
              blurScore: 120,
              contrastRatio: 12,
              brightnessMean: 180,
              skewAngleDegrees: 0,
              detectedOrientation: 0,
              isBlurry: false,
              isLowContrast: false,
              isSeverelyDegraded: false,
              qualityRating: 'GOOD',
            },
            questions: [
              {
                id: isPage2 ? 'raw-q2' : 'raw-q1',
                questionNumber: 1,
                questionText: isPage2 ? 'Question from Page 2' : 'Question from Page 1',
                questionType: 'MCQ',
                options: ['A', 'B', 'C', 'D'],
                correctAnswerIndex: 0,
                marks: 2,
                sourceType: 'Camera',
                provenance: {
                  sourceType: 'Camera',
                  sourceTitle: input.fileName,
                  pageNumber: isPage2 ? 2 : 1,
                  confidence: 0.95,
                },
              } as any,
            ],
            assets: [
              {
                id: isPage2 ? 'asset-chart' : 'asset-diagram',
                type: 'diagram',
                mimeType: 'image/png',
                base64Data: 'mockAssetData',
              } as any,
            ],
            groundingFidelityScore: 0.95,
            latencyMs: 15,
            cached: false,
          };
        }
      );

      const pages = [
        {
          id: 'p1',
          pageNumber: 1,
          base64Data: 'data:image/jpeg;base64,' + 'A'.repeat(120),
          width: 1280,
          height: 720,
          timestamp: 1000,
        },
        {
          id: 'p2',
          pageNumber: 2,
          base64Data: 'data:image/jpeg;base64,' + 'B'.repeat(120),
          width: 1280,
          height: 720,
          timestamp: 2000,
        },
      ];

      const batchResult = await processMultiPageScan(pages);

      expect(spyProcessImage).toHaveBeenCalledTimes(2);
      expect(batchResult.success).toBe(true);
      expect(batchResult.totalPages).toBe(2);
      expect(batchResult.questions.length).toBe(2);

      // Verify monotonic question renumbering across pages
      expect(batchResult.questions[0].questionNumber).toBe(1);
      expect(batchResult.questions[0].provenance.sourcePage).toBe(1);
      expect(batchResult.questions[0].sourceType).toBe('Camera');

      expect(batchResult.questions[1].questionNumber).toBe(2);
      expect(batchResult.questions[1].provenance.sourcePage).toBe(2);
      expect(batchResult.questions[1].sourceType).toBe('Camera');

      // Verify asset namespacing across pages
      expect(batchResult.assets.length).toBe(2);
      expect(batchResult.assets[0].assetId).toContain('cam-p1-');
      expect(batchResult.assets[1].assetId).toContain('cam-p2-');
    });
  });

  describe('5. CameraSourceAdapter Multi-Page Integration', () => {
    const adapter = new CameraSourceAdapter();

    it('should validate multi-page input payload and reject corrupted entries', async () => {
      const invalid = await adapter.validateInput({
        pages: [
          { base64Data: 'data:image/jpeg;base64,' + 'A'.repeat(100) },
          { base64Data: 'short' }, // corrupted
        ],
      });
      expect(invalid.valid).toBe(false);
      expect(invalid.error).toContain('corrupted or too small');

      const valid = await adapter.validateInput({
        pages: [
          { base64Data: 'data:image/jpeg;base64,' + 'A'.repeat(100) },
          { base64Data: 'data:image/jpeg;base64,' + 'B'.repeat(100) },
        ],
      });
      expect(valid.valid).toBe(true);
    });

    it('should process multi-page camera input and return canonical test with quality report', async () => {
      vi.spyOn(imageEngineModule, 'processImage').mockResolvedValue({
        success: true,
        imageHash: 'mock-hash',
        quality: {
          blurScore: 100,
          contrastRatio: 10,
          brightnessMean: 150,
          skewAngleDegrees: 0,
          detectedOrientation: 0,
          isBlurry: false,
          isLowContrast: false,
          isSeverelyDegraded: false,
          qualityRating: 'EXCELLENT',
        },
        questions: [
          {
            id: 'mock-q1',
            questionId: 'mock-q1',
            questionNumber: 1,
            questionText: 'What is the speed of light?',
            questionType: 'MCQ',
            options: [
              { id: 'opt-A', text: '3x10^8 m/s', isCorrect: true },
              { id: 'opt-B', text: '2x10^8 m/s', isCorrect: false },
              { id: 'opt-C', text: '1x10^8 m/s', isCorrect: false },
              { id: 'opt-D', text: 'None', isCorrect: false },
            ],
            answer: {
              questionType: 'MCQ',
              correctOptionIndex: 0,
              correctOptionId: 'opt-A',
            },
            marks: 1,
            sourceType: 'Camera',
            provenance: {
              sourceType: 'Camera',
              sourceFile: 'Page 1',
              sourcePage: 1,
              confidence: 0.98,
            },
          } as any,
        ],
        assets: [],
        groundingFidelityScore: 0.98,
        latencyMs: 10,
        cached: false,
      });

      const result = await adapter.process({
        pages: [
          { base64Data: 'data:image/jpeg;base64,' + 'A'.repeat(120), pageNumber: 1 },
          { base64Data: 'data:image/jpeg;base64,' + 'B'.repeat(120), pageNumber: 2 },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.sourceType).toBe('Camera');
      expect(result.sourceTitle).toContain('2 Pages');
      expect(result.questions.length).toBe(2);
      expect(result.legacyQuestions.length).toBe(2);
      expect(result.qualityReport?.total).toBe(2);
      expect(result.qualityReport?.verified).toBeGreaterThanOrEqual(1);
    });
  });
});
