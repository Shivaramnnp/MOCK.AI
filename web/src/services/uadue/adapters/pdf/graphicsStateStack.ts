/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Module: Graphics State Stack & Deterministic Coordinate Transforms
 *
 * Implements the explicit PDF graphics-state stack:
 * - CTM (Current Transformation Matrix) accumulation
 * - Clipping bounding box intersection
 * - Drawing order indexing
 * - Matrix math with deterministic 2-decimal quantization
 */

import { AffineTransformMatrix } from '../../contracts/documentIR';

export interface GraphicsState {
  ctm: AffineTransformMatrix;
  clippingBox?: { x0: number; y0: number; x1: number; y1: number };
  fontId?: string;
  fontSizePt: number;
  lineWidthPt: number;
  lineCap: 'butt' | 'round' | 'square';
  lineJoin: 'miter' | 'round' | 'bevel';
  strokeRgba: [number, number, number, number];
  fillRgba: [number, number, number, number];
  textRenderingMode: number;
}

export function quantize(val: number): number {
  return Math.round(val * 100) / 100;
}

export function identityMatrix(): AffineTransformMatrix {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

/**
 * Multiplies matrix M1 by M2 (M1 * M2).
 * Represents transform composition in PDF rendering.
 * Full IEEE 754 precision preserved without premature quantization.
 */
export function multiplyMatrices(
  m1: AffineTransformMatrix,
  m2: AffineTransformMatrix
): AffineTransformMatrix {
  return {
    a: m1.a * m2.a + m1.b * m2.c,
    b: m1.a * m2.b + m1.b * m2.d,
    c: m1.c * m2.a + m1.d * m2.c,
    d: m1.c * m2.b + m1.d * m2.d,
    e: m1.e * m2.a + m1.f * m2.c + m2.e,
    f: m1.e * m2.b + m1.f * m2.d + m2.f,
  };
}

/**
 * Transforms point (x, y) through matrix M with full float precision.
 */
export function transformPoint(
  x: number,
  y: number,
  m: AffineTransformMatrix
): [number, number] {
  const xPrime = x * m.a + y * m.c + m.e;
  const yPrime = x * m.b + y * m.d + m.f;
  return [xPrime, yPrime];
}

export class GraphicsStateStack {
  private stack: GraphicsState[] = [];
  private current: GraphicsState;

  constructor(initialMediaBox?: { x0: number; y0: number; x1: number; y1: number }) {
    this.current = {
      ctm: identityMatrix(),
      clippingBox: initialMediaBox ? { ...initialMediaBox } : undefined,
      fontSizePt: 12,
      lineWidthPt: 1.0,
      lineCap: 'butt',
      lineJoin: 'miter',
      strokeRgba: [0, 0, 0, 1],
      fillRgba: [0, 0, 0, 1],
      textRenderingMode: 0,
    };
  }

  get currentState(): GraphicsState {
    return { ...this.current };
  }

  get ctm(): AffineTransformMatrix {
    return { ...this.current.ctm };
  }

  get clippingBox(): { x0: number; y0: number; x1: number; y1: number } | undefined {
    return this.current.clippingBox ? { ...this.current.clippingBox } : undefined;
  }

  /**
   * Pushes current graphics state to stack ('q' operator in PDF).
   */
  save(): void {
    this.stack.push({
      ...this.current,
      ctm: { ...this.current.ctm },
      clippingBox: this.current.clippingBox ? { ...this.current.clippingBox } : undefined,
    });
  }

  /**
   * Restores previous graphics state from stack ('Q' operator in PDF).
   */
  restore(): void {
    if (this.stack.length > 0) {
      this.current = this.stack.pop()!;
    }
  }

  /**
   * Concatenates matrix M to the Current Transformation Matrix ('cm' operator).
   */
  transform(m: AffineTransformMatrix): void {
    this.current.ctm = multiplyMatrices(m, this.current.ctm);
  }

  /**
   * Intersects current clipping box with a new clipping rectangle ('W' / 'W*' operator).
   */
  clip(box: { x0: number; y0: number; x1: number; y1: number }): void {
    if (!this.current.clippingBox) {
      this.current.clippingBox = { ...box };
    } else {
      this.current.clippingBox = {
        x0: Math.max(this.current.clippingBox.x0, box.x0),
        y0: Math.max(this.current.clippingBox.y0, box.y0),
        x1: Math.min(this.current.clippingBox.x1, box.x1),
        y1: Math.min(this.current.clippingBox.y1, box.y1),
      };
    }
  }

  setLineWidth(w: number): void {
    this.current.lineWidthPt = Math.max(0, w);
  }

  setLineCap(cap: 'butt' | 'round' | 'square'): void {
    this.current.lineCap = cap;
  }

  setLineJoin(join: 'miter' | 'round' | 'bevel'): void {
    this.current.lineJoin = join;
  }

  setStrokeColor(rgba: [number, number, number, number]): void {
    this.current.strokeRgba = [...rgba];
  }

  setFillColor(rgba: [number, number, number, number]): void {
    this.current.fillRgba = [...rgba];
  }

  setFont(fontId: string, sizePt: number): void {
    this.current.fontId = fontId;
    this.current.fontSizePt = Math.max(0.1, sizePt);
  }

  setTextRenderingMode(mode: number): void {
    this.current.textRenderingMode = mode;
  }
}
