/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Geometric Relations Evaluator (Phase 2B)
 *
 * Deterministically computes 15 spatial relationships between physical document elements:
 * CONTAINS, INSIDE, OVERLAPS, TOUCHES, ABOVE, BELOW, LEFT_OF, RIGHT_OF,
 * ALIGNED_X, ALIGNED_Y, NEAR, ADJACENT, SAME_REGION, SAME_ROW, SAME_COLUMN, CONTINUES_PHYSICALLY.
 *
 * Inviolable Principle:
 * Every relation records exact geometric measurements and a deterministic decision basis.
 */

import {
  DocumentGraphNode,
  DocumentGraphEdge,
  GeometricRelationType,
  GeometricEvidenceRecord,
} from '../contracts/documentGraph';
import { Spatial2DIndex } from './spatialIndex';

export interface GeometricRelationConfig {
  alignmentTolerancePt: number; // default: 4.0 pt
  touchingTolerancePt: number; // default: 1.0 pt
  nearDistanceThresholdPt: number; // default: 36.0 pt
  adjacentMaxDistancePt: number; // default: 150.0 pt
  sameRowOverlapRatio: number; // default: 0.50 (50% vertical overlap)
  algorithmVersion: string; // default: 'geom_rel_v2b'
}

export const DEFAULT_GEOMETRIC_CONFIG: GeometricRelationConfig = {
  alignmentTolerancePt: 4.0,
  touchingTolerancePt: 1.0,
  nearDistanceThresholdPt: 36.0,
  adjacentMaxDistancePt: 150.0,
  sameRowOverlapRatio: 0.5,
  algorithmVersion: 'geom_rel_v2b_2026',
};

export class GeometricRelationsEvaluator {
  private config: GeometricRelationConfig;

  constructor(config?: Partial<GeometricRelationConfig>) {
    this.config = { ...DEFAULT_GEOMETRIC_CONFIG, ...config };
  }

  /**
   * Deterministically evaluates relations between source and target nodes.
   */
  public evaluatePairRelations(
    source: DocumentGraphNode,
    target: DocumentGraphNode,
    columnMap?: Map<string, number>,
    regionMap?: Map<string, string>
  ): DocumentGraphEdge[] {
    if (source.nodeId === target.nodeId || source.pageNumber !== target.pageNumber) {
      return [];
    }

    const edges: DocumentGraphEdge[] = [];
    const bA = source.bbox;
    const bB = target.bbox;

    const distance = Spatial2DIndex.computeDistance(bA, bB);
    const { area, overlapRatioA, overlapRatioB } = Spatial2DIndex.computeIntersection(bA, bB);

    // Horizontal & vertical gaps (negative if overlapping in that axis)
    const hGap = Math.max(0, Math.max(bA.x0 - bB.x1, bB.x0 - bA.x1));
    const vGap = Math.max(0, Math.max(bA.y0 - bB.y1, bB.y0 - bA.y1));

    // Overlap lengths on projections
    const hOverlap = Math.max(0, Math.min(bA.x1, bB.x1) - Math.max(bA.x0, bB.x0));
    const vOverlap = Math.max(0, Math.min(bA.y1, bB.y1) - Math.max(bA.y0, bB.y0));

    const evidenceBase: GeometricEvidenceRecord = {
      distancePt: distance,
      overlapAreaPt2: area,
      overlapRatioSource: overlapRatioA,
      overlapRatioTarget: overlapRatioB,
      horizontalGapPt: hGap,
      verticalGapPt: vGap,
    };

    // 1. CONTAINS / INSIDE
    if (Spatial2DIndex.isInside(bB, bA, 0.5)) {
      edges.push(
        this.createEdge(
          source.nodeId,
          target.nodeId,
          'CONTAINS',
          distance,
          1.0,
          `Node ${source.nodeId} completely encloses ${target.nodeId} with overlap ratio ${(overlapRatioB * 100).toFixed(1)}%`,
          evidenceBase
        )
      );
    } else if (Spatial2DIndex.isInside(bA, bB, 0.5)) {
      edges.push(
        this.createEdge(
          source.nodeId,
          target.nodeId,
          'INSIDE',
          distance,
          1.0,
          `Node ${source.nodeId} is completely inside ${target.nodeId} with overlap ratio ${(overlapRatioA * 100).toFixed(1)}%`,
          evidenceBase
        )
      );
    }
    // 2. OVERLAPS (partial interior overlap, not full containment)
    else if (area > 0.1) {
      edges.push(
        this.createEdge(
          source.nodeId,
          target.nodeId,
          'OVERLAPS',
          0.0,
          Math.min(1.0, (overlapRatioA + overlapRatioB) / 2),
          `Boxes intersect with area ${area.toFixed(2)} pt^2 without complete containment`,
          evidenceBase
        )
      );
    }
    // 3. TOUCHES (boundary contact within tolerance without interior overlap)
    else if (distance <= this.config.touchingTolerancePt && area <= 0.1) {
      edges.push(
        this.createEdge(
          source.nodeId,
          target.nodeId,
          'TOUCHES',
          distance,
          1.0,
          `Distance ${distance.toFixed(3)} pt <= tolerance ${this.config.touchingTolerancePt} pt with no interior penetration`,
          evidenceBase
        )
      );
    }

    // 4. ABOVE / BELOW (requires horizontal projection overlap or alignment)
    if (bA.y1 <= bB.y0 + 1.0 && hOverlap > 1.0) {
      edges.push(
        this.createEdge(
          source.nodeId,
          target.nodeId,
          'ABOVE',
          vGap,
          Math.min(1.0, 1.0 - Math.min(1.0, vGap / 200)),
          `Node ${source.nodeId} bottom y1=${bA.y1.toFixed(1)} <= ${target.nodeId} top y0=${bB.y0.toFixed(1)} with horizontal overlap ${hOverlap.toFixed(1)} pt`,
          evidenceBase
        )
      );
    } else if (bA.y0 >= bB.y1 - 1.0 && hOverlap > 1.0) {
      edges.push(
        this.createEdge(
          source.nodeId,
          target.nodeId,
          'BELOW',
          vGap,
          Math.min(1.0, 1.0 - Math.min(1.0, vGap / 200)),
          `Node ${source.nodeId} top y0=${bA.y0.toFixed(1)} >= ${target.nodeId} bottom y1=${bB.y1.toFixed(1)} with horizontal overlap ${hOverlap.toFixed(1)} pt`,
          evidenceBase
        )
      );
    }

    // 5. LEFT_OF / RIGHT_OF (requires vertical projection overlap)
    if (bA.x1 <= bB.x0 + 1.0 && vOverlap > 1.0) {
      edges.push(
        this.createEdge(
          source.nodeId,
          target.nodeId,
          'LEFT_OF',
          hGap,
          Math.min(1.0, 1.0 - Math.min(1.0, hGap / 200)),
          `Node ${source.nodeId} right x1=${bA.x1.toFixed(1)} <= ${target.nodeId} left x0=${bB.x0.toFixed(1)} with vertical overlap ${vOverlap.toFixed(1)} pt`,
          evidenceBase
        )
      );
    } else if (bA.x0 >= bB.x1 - 1.0 && vOverlap > 1.0) {
      edges.push(
        this.createEdge(
          source.nodeId,
          target.nodeId,
          'RIGHT_OF',
          hGap,
          Math.min(1.0, 1.0 - Math.min(1.0, hGap / 200)),
          `Node ${source.nodeId} left x0=${bA.x0.toFixed(1)} >= ${target.nodeId} right x1=${bB.x1.toFixed(1)} with vertical overlap ${vOverlap.toFixed(1)} pt`,
          evidenceBase
        )
      );
    }

    // 6. ALIGNED_X & ALIGNED_Y
    const align = Spatial2DIndex.checkAlignment(bA, bB, this.config.alignmentTolerancePt);
    if (align.alignedX) {
      edges.push(
        this.createEdge(
          source.nodeId,
          target.nodeId,
          'ALIGNED_X',
          align.deltaX,
          1.0 - align.deltaX / this.config.alignmentTolerancePt,
          `Horizontal alignment (${align.type || 'ALIGNED_X'}) within ${align.deltaX.toFixed(2)} pt`,
          { ...evidenceBase, alignmentDeltaPt: align.deltaX }
        )
      );
    }
    if (align.alignedY) {
      edges.push(
        this.createEdge(
          source.nodeId,
          target.nodeId,
          'ALIGNED_Y',
          align.deltaY,
          1.0 - align.deltaY / this.config.alignmentTolerancePt,
          `Vertical alignment (${align.type || 'ALIGNED_Y'}) within ${align.deltaY.toFixed(2)} pt`,
          { ...evidenceBase, alignmentDeltaPt: align.deltaY }
        )
      );
    }

    // 7. NEAR (distance within neighborhood threshold)
    if (distance > 0 && distance <= this.config.nearDistanceThresholdPt) {
      edges.push(
        this.createEdge(
          source.nodeId,
          target.nodeId,
          'NEAR',
          distance,
          1.0 - distance / this.config.nearDistanceThresholdPt,
          `Edge distance ${distance.toFixed(2)} pt <= threshold ${this.config.nearDistanceThresholdPt} pt`,
          evidenceBase
        )
      );
    }

    // 8. SAME_ROW
    const minHeight = Math.min(bA.height, bB.height);
    if (minHeight > 0 && vOverlap / minHeight >= this.config.sameRowOverlapRatio && hGap <= 100.0) {
      edges.push(
        this.createEdge(
          source.nodeId,
          target.nodeId,
          'SAME_ROW',
          hGap,
          vOverlap / minHeight,
          `Vertical overlap ${vOverlap.toFixed(1)} pt is ${( (vOverlap / minHeight) * 100).toFixed(0)}% of shorter height (${minHeight.toFixed(1)} pt)`,
          evidenceBase
        )
      );
    }

    // 9. SAME_COLUMN
    if (columnMap && columnMap.has(source.nodeId) && columnMap.has(target.nodeId)) {
      const colA = columnMap.get(source.nodeId);
      const colB = columnMap.get(target.nodeId);
      if (colA === colB) {
        edges.push(
          this.createEdge(
            source.nodeId,
            target.nodeId,
            'SAME_COLUMN',
            distance,
            1.0,
            `Both nodes assigned to Column ${colA}`,
            evidenceBase
          )
        );
      }
    }

    // 10. SAME_REGION
    if (regionMap && regionMap.has(source.nodeId) && regionMap.has(target.nodeId)) {
      const regA = regionMap.get(source.nodeId);
      const regB = regionMap.get(target.nodeId);
      if (regA === regB) {
        edges.push(
          this.createEdge(
            source.nodeId,
            target.nodeId,
            'SAME_REGION',
            distance,
            1.0,
            `Both nodes reside within Layout Region ${regA}`,
            evidenceBase
          )
        );
      }
    }

    return edges;
  }

  /**
   * Evaluates Voronoi-like ADJACENT edges across a page of nodes.
   * Node B is ADJACENT to Node A if B is the nearest neighbor in that quadrant
   * without an intervening element shielding it.
   */
  public evaluateAdjacency(nodes: DocumentGraphNode[], spatialIndex: Spatial2DIndex): DocumentGraphEdge[] {
    const edges: DocumentGraphEdge[] = [];
    const directions: ('ABOVE' | 'BELOW' | 'LEFT_OF' | 'RIGHT_OF')[] = ['ABOVE', 'BELOW', 'LEFT_OF', 'RIGHT_OF'];

    for (const node of nodes) {
      for (const dir of directions) {
        const neighbors = spatialIndex.queryDirectionalNeighbors(
          node.bbox,
          dir,
          1,
          node.nodeId,
          this.config.adjacentMaxDistancePt
        );

        if (neighbors.length > 0) {
          const nearest = neighbors[0];
          edges.push(
            this.createEdge(
              node.nodeId,
              nearest.item.id,
              'ADJACENT',
              nearest.distancePt,
              Math.max(0.1, 1.0 - nearest.distancePt / this.config.adjacentMaxDistancePt),
              `Direct ${dir} nearest neighbor at distance ${nearest.distancePt.toFixed(2)} pt`,
              {
                distancePt: nearest.distancePt,
              }
            )
          );
        }
      }
    }

    return edges;
  }

  private createEdge(
    sourceNodeId: string,
    targetNodeId: string,
    relation: GeometricRelationType,
    distancePt: number,
    confidence: number,
    decisionBasis: string,
    evidence?: GeometricEvidenceRecord
  ): DocumentGraphEdge {
    const edgeId = `edge_${sourceNodeId}__${targetNodeId}__${relation}`;
    return {
      edgeId,
      sourceNodeId,
      targetNodeId,
      sourceElementId: sourceNodeId,
      targetElementId: targetNodeId,
      relation,
      distancePt,
      weight: confidence,
      confidence,
      decisionBasis,
      geometricEvidence: evidence,
      algorithmVersion: this.config.algorithmVersion,
    };
  }
}
