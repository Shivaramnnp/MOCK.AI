/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Spatial Index Engine (Phase 2B)
 *
 * Deterministic 2D bounding-box spatial index supporting range search,
 * containment, intersection, k-nearest neighbors, and directional adjacency.
 */

import { BoundingBox2D } from '../contracts/evidence';

export interface IndexedSpatialItem {
  id: string;
  bbox: BoundingBox2D;
  pageNumber: number;
  payload?: unknown;
}

export interface SpatialNeighborResult {
  item: IndexedSpatialItem;
  distancePt: number;
}

export class Spatial2DIndex {
  private items: IndexedSpatialItem[] = [];

  constructor(items?: IndexedSpatialItem[]) {
    if (items) {
      for (const it of items) {
        this.insert(it);
      }
    }
  }

  public insert(item: IndexedSpatialItem): void {
    // Sanitize bounding box: ensure min/max invariants
    const cleanBbox: BoundingBox2D = {
      x0: Math.min(item.bbox.x0, item.bbox.x1),
      y0: Math.min(item.bbox.y0, item.bbox.y1),
      x1: Math.max(item.bbox.x0, item.bbox.x1),
      y1: Math.max(item.bbox.y0, item.bbox.y1),
      width: Math.abs(item.bbox.x1 - item.bbox.x0),
      height: Math.abs(item.bbox.y1 - item.bbox.y0),
      unit: item.bbox.unit || 'pt',
      pageWidth: item.bbox.pageWidth,
      pageHeight: item.bbox.pageHeight,
    };
    this.items.push({
      ...item,
      bbox: cleanBbox,
    });
  }

  public size(): number {
    return this.items.length;
  }

  public getAll(): IndexedSpatialItem[] {
    return [...this.items];
  }

  /**
   * Find all items intersecting with target bounding box.
   */
  public queryIntersects(target: BoundingBox2D, tolerancePt = 0.1): IndexedSpatialItem[] {
    return this.items.filter((item) => Spatial2DIndex.isOverlapping(item.bbox, target, tolerancePt));
  }

  /**
   * Find all items strictly inside the target container box.
   */
  public queryContainedBy(container: BoundingBox2D, tolerancePt = 0.5): IndexedSpatialItem[] {
    return this.items.filter((item) => Spatial2DIndex.isInside(item.bbox, container, tolerancePt));
  }

  /**
   * Find all items that completely enclose the target box.
   */
  public queryEnclosing(inner: BoundingBox2D, tolerancePt = 0.5): IndexedSpatialItem[] {
    return this.items.filter((item) => Spatial2DIndex.isInside(inner, item.bbox, tolerancePt));
  }

  /**
   * Find k nearest neighbors to a target box, ordered deterministically by distance then ID.
   */
  public queryKNearest(
    target: BoundingBox2D,
    k: number,
    excludeId?: string,
    maxDistancePt = Infinity
  ): SpatialNeighborResult[] {
    const candidates: SpatialNeighborResult[] = [];

    for (const item of this.items) {
      if (excludeId && item.id === excludeId) continue;
      const d = Spatial2DIndex.computeDistance(target, item.bbox);
      if (d <= maxDistancePt) {
        candidates.push({ item, distancePt: d });
      }
    }

    candidates.sort((a, b) => {
      const diff = a.distancePt - b.distancePt;
      if (Math.abs(diff) > 1e-6) return diff;
      return a.item.id.localeCompare(b.item.id);
    });

    return candidates.slice(0, k);
  }

  /**
   * Find directional nearest neighbors (ABOVE, BELOW, LEFT_OF, RIGHT_OF).
   */
  public queryDirectionalNeighbors(
    target: BoundingBox2D,
    direction: 'ABOVE' | 'BELOW' | 'LEFT_OF' | 'RIGHT_OF',
    k = 5,
    excludeId?: string,
    maxDistancePt = 200
  ): SpatialNeighborResult[] {
    const results: SpatialNeighborResult[] = [];

    for (const item of this.items) {
      if (excludeId && item.id === excludeId) continue;
      const valid = Spatial2DIndex.isDirectionallyOriented(target, item.bbox, direction);
      if (!valid) continue;

      const d = Spatial2DIndex.computeDistance(target, item.bbox);
      if (d <= maxDistancePt) {
        results.push({ item, distancePt: d });
      }
    }

    results.sort((a, b) => {
      const diff = a.distancePt - b.distancePt;
      if (Math.abs(diff) > 1e-6) return diff;
      return a.item.id.localeCompare(b.item.id);
    });

    return results.slice(0, k);
  }

  // ============================================================================
  // Static Mathematical & Geometry Utilities (Unquantized IEEE 754)
  // ============================================================================

  /**
   * Computes minimum edge-to-edge Euclidean distance between two 2D boxes.
   * If boxes overlap, distance is 0.0.
   */
  public static computeDistance(a: BoundingBox2D, b: BoundingBox2D): number {
    const dx = Math.max(0, Math.max(a.x0 - b.x1, b.x0 - a.x1));
    const dy = Math.max(0, Math.max(a.y0 - b.y1, b.y0 - a.y1));
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Computes intersection area and overlap ratios.
   */
  public static computeIntersection(
    a: BoundingBox2D,
    b: BoundingBox2D
  ): { area: number; overlapRatioA: number; overlapRatioB: number } {
    const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
    const iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    const area = ix * iy;

    const areaA = Math.max(1e-6, a.width * a.height);
    const areaB = Math.max(1e-6, b.width * b.height);

    return {
      area,
      overlapRatioA: area / areaA,
      overlapRatioB: area / areaB,
    };
  }

  /**
   * Checks whether box `inner` is completely inside box `outer` within tolerance.
   */
  public static isInside(inner: BoundingBox2D, outer: BoundingBox2D, tol = 0.5): boolean {
    return (
      inner.x0 >= outer.x0 - tol &&
      inner.y0 >= outer.y0 - tol &&
      inner.x1 <= outer.x1 + tol &&
      inner.y1 <= outer.y1 + tol
    );
  }

  /**
   * Checks if two boxes overlap (interior intersection area > 0).
   */
  public static isOverlapping(a: BoundingBox2D, b: BoundingBox2D, tol = 0.1): boolean {
    const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    const iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    return ix > tol && iy > tol;
  }

  /**
   * Checks if two boxes touch along an edge without interior penetration.
   */
  public static isTouching(a: BoundingBox2D, b: BoundingBox2D, tol = 1.0): boolean {
    const d = Spatial2DIndex.computeDistance(a, b);
    if (d > tol) return false;
    const { area } = Spatial2DIndex.computeIntersection(a, b);
    return area <= tol * tol;
  }

  /**
   * Directional orientation test in standard top-down viewport coordinates:
   * (y0 = top, y1 = bottom, x0 = left, x1 = right).
   */
  public static isDirectionallyOriented(
    from: BoundingBox2D,
    to: BoundingBox2D,
    direction: 'ABOVE' | 'BELOW' | 'LEFT_OF' | 'RIGHT_OF'
  ): boolean {
    switch (direction) {
      case 'BELOW': // `to` is below `from`
        return to.y0 >= from.y1 - 1.0;
      case 'ABOVE': // `to` is above `from`
        return to.y1 <= from.y0 + 1.0;
      case 'RIGHT_OF': // `to` is right of `from`
        return to.x0 >= from.x1 - 1.0;
      case 'LEFT_OF': // `to` is left of `from`
        return to.x1 <= from.x0 + 1.0;
    }
  }

  /**
   * Alignment evaluation:
   * Checks horizontal (left, right, center) or vertical (top, bottom, baseline) alignment.
   */
  public static checkAlignment(
    a: BoundingBox2D,
    b: BoundingBox2D,
    tolPt = 4.0
  ): { alignedX: boolean; alignedY: boolean; deltaX: number; deltaY: number; type?: string } {
    const leftDelta = Math.abs(a.x0 - b.x0);
    const rightDelta = Math.abs(a.x1 - b.x1);
    const centerDelta = Math.abs((a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2);

    const topDelta = Math.abs(a.y0 - b.y0);
    const bottomDelta = Math.abs(a.y1 - b.y1);
    const middleYDelta = Math.abs((a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);

    const minXDelta = Math.min(leftDelta, rightDelta, centerDelta);
    const minYDelta = Math.min(topDelta, bottomDelta, middleYDelta);

    let type: string | undefined = undefined;
    if (leftDelta <= tolPt) type = 'ALIGNED_LEFT';
    else if (rightDelta <= tolPt) type = 'ALIGNED_RIGHT';
    else if (centerDelta <= tolPt) type = 'ALIGNED_CENTER';
    else if (bottomDelta <= tolPt) type = 'ALIGNED_BASELINE';
    else if (topDelta <= tolPt) type = 'ALIGNED_TOP';

    return {
      alignedX: minXDelta <= tolPt,
      alignedY: minYDelta <= tolPt,
      deltaX: minXDelta,
      deltaY: minYDelta,
      type,
    };
  }
}
