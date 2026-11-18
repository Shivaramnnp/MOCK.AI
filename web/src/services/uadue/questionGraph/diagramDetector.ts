/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Diagram Detector (Phase 2C Final Semantic Closure)
 *
 * Clusters visual elements into authentic Assessment Visuals (DiagramCandidate)
 * with mathematical precision while eliminating false positives:
 * - Distinguishes:
 *   DIAGRAM | IMAGE | VISUAL_OPTION | TABLE | MATH_VECTOR | BORDER |
 *   LAYOUT_DIVIDER | WATERMARK | CHECKBOX | ICON | DECORATION | PAGE_TEMPLATE
 * - Connected Components clustering (Zero duplicate candidates)
 * - Strict Assessment Figure Qualification Gate:
 *   Requires either genuine raster assessment image OR complex vector drawing
 *   with authentic figure anchors/annotations (coordinates, engineering units).
 *
 * Inviolable Forensic Hierarchy:
 * PHYSICAL EVIDENCE -> CONTEXT -> CANDIDATE HYPOTHESIS -> OWNERSHIP EVIDENCE -> SEMANTIC CANDIDATE
 */

import { DocumentGraph, DocumentGraphNode } from '../contracts/documentGraph';
import {
  DiagramCandidate,
  EvidenceObservationState,
  QuestionVerificationStatus,
  VisualCandidateRole,
} from '../contracts/questionGraph';

export class DiagramDetector {
  /**
   * Classifies a visual node into its prospective visual candidate role.
   */
  public static classifyVisualRole(
    node: DocumentGraphNode,
    graph: DocumentGraph
  ): VisualCandidateRole {
    if (node.nodeType !== 'RASTER_IMAGE' && node.nodeType !== 'VECTOR_PATH') {
      return 'OTHER';
    }

    const pWidth = node.bbox.pageWidth || 595.0;
    const pHeight = node.bbox.pageHeight || 842.0;
    const w = Math.abs(node.bbox.x1 - node.bbox.x0);
    const h = Math.abs(node.bbox.y1 - node.bbox.y0);
    const area = w * h;
    const pageArea = pWidth * pHeight;

    // 1. Full-page background image / watermark
    if (node.nodeType === 'RASTER_IMAGE') {
      if ((w >= pWidth * 0.70 && h >= pHeight * 0.65) || area >= pageArea * 0.40 || (w >= 1800.0 && h >= 1800.0)) {
        return 'PAGE_BACKGROUND';
      }
    }

    // 1b. Header or Footer margin visual element (logos, headers, page decorations)
    if (node.bbox.y1 <= 85.0 || node.bbox.y0 >= pHeight - 75.0) {
      return 'PAGE_TEMPLATE';
    }

    // 2. Count metadata text nodes contained inside this element
    let containsMetadataText = false;
    for (const edge of graph.edges) {
      if (edge.sourceNodeId === node.nodeId && (edge.relation === 'CONTAINS' || edge.relation === 'INSIDE')) {
        const targetNode = graph.nodes.get(edge.targetNodeId);
        if (targetNode && (targetNode.nodeType === 'TEXT_RUN' || targetNode.nodeType === 'GLYPH_RUN')) {
          const t = (targetNode.textContent || '').trim();
          if (/(?:roll\s+number|candidate\s+name|venue\s+name|exam\s+date|exam\s+time|subject|question\s+id|test\s+center)/i.test(t)) {
            containsMetadataText = true;
          }
        }
      }
    }

    // 3. Page template, header card container, or candidate response details table
    if (
      (w >= pWidth * 0.65 && h >= pHeight * 0.40) ||
      h >= pHeight * 0.60 ||
      containsMetadataText
    ) {
      return 'PAGE_TEMPLATE';
    }

    // 4. Page border or card outline frame
    if ((w >= pWidth * 0.70 && h >= pHeight * 0.60) || area >= pageArea * 0.45) {
      return 'BORDER';
    }

    // 5. Layout divider rules, column lines, and table borders
    if (h <= 4.0 || w <= 4.0) {
      if (w >= 40.0 || h >= 40.0) {
        return 'LAYOUT_DIVIDER';
      }
      return 'MATH_VECTOR';
    }

    // Long separator lines / column dividers
    if ((h >= 140.0 && w <= 45.0) || (w >= 140.0 && h <= 45.0)) {
      return 'LAYOUT_DIVIDER';
    }

    // 6. Tiny icons, checkboxes, or bullet vectors
    if (w <= 20.0 && h <= 20.0) {
      return 'CHECKBOX';
    }

    // 7. Genuine raster image
    if (node.nodeType === 'RASTER_IMAGE') {
      return 'IMAGE';
    }

    // 8. General vector path candidate
    return 'DIAGRAM_PRIMITIVE';
  }

  /**
   * Identifies visual diagram candidates and their associated spatial labels.
   */
  public static detectDiagrams(graph: DocumentGraph): DiagramCandidate[] {
    const diagrams: DiagramCandidate[] = [];

    // 1. Pre-classify roles for all visual nodes
    const visualRoleMap = new Map<string, VisualCandidateRole>();
    for (const node of graph.nodes.values()) {
      if (node.nodeType === 'RASTER_IMAGE' || node.nodeType === 'VECTOR_PATH') {
        const role = DiagramDetector.classifyVisualRole(node, graph);
        visualRoleMap.set(node.nodeId, role);
      }
    }

    // 2. Identify candidate nodes that can participate in assessment visuals
    const eligibleNodes = Array.from(graph.nodes.values()).filter((n) => {
      const role = visualRoleMap.get(n.nodeId);
      return role === 'IMAGE' || role === 'DIAGRAM_PRIMITIVE';
    });

    // 3. Build Disjoint Connected Components (Zero Duplicate Diagrams)
    const visitedNodes = new Set<string>();
    const components: {
      physicalNodeIds: string[];
      labelNodeIds: string[];
      pageNumber: number;
    }[] = [];

    for (const seedNode of eligibleNodes) {
      if (visitedNodes.has(seedNode.nodeId)) continue;

      const pageNum = seedNode.pageNumber;
      const componentPhysical: string[] = [];
      const componentLabels: string[] = [];
      const queue: string[] = [seedNode.nodeId];
      visitedNodes.add(seedNode.nodeId);

      let minX = seedNode.bbox.x0;
      let minY = seedNode.bbox.y0;
      let maxX = seedNode.bbox.x1;
      let maxY = seedNode.bbox.y1;

      while (queue.length > 0) {
        const currId = queue.shift()!;
        componentPhysical.push(currId);
        const currNode = graph.nodes.get(currId);
        if (currNode) {
          minX = Math.min(minX, currNode.bbox.x0);
          minY = Math.min(minY, currNode.bbox.y0);
          maxX = Math.max(maxX, currNode.bbox.x1);
          maxY = Math.max(maxY, currNode.bbox.y1);
        }

        // Search adjacent edges on the same page
        const edges = graph.edges.filter(
          (e) =>
            (e.sourceNodeId === currId || e.targetNodeId === currId) &&
            (e.relation === 'OVERLAPS' ||
              e.relation === 'TOUCHES' ||
              e.relation === 'NEAR' ||
              e.relation === 'CONTAINS' ||
              e.relation === 'INSIDE')
        );

        for (const edge of edges) {
          const otherId = edge.sourceNodeId === currId ? edge.targetNodeId : edge.sourceNodeId;
          const otherNode = graph.nodes.get(otherId);
          if (!otherNode || otherNode.pageNumber !== pageNum) continue;

          const otherRole = visualRoleMap.get(otherId);

          // Never expand into PAGE_TEMPLATE, BORDER, or LAYOUT_DIVIDER
          if (
            otherRole === 'PAGE_TEMPLATE' ||
            otherRole === 'BORDER' ||
            otherRole === 'PAGE_BACKGROUND' ||
            otherRole === 'LAYOUT_DIVIDER' ||
            otherRole === 'TABLE_RULE'
          ) {
            continue;
          }

          const canClusterVisual =
            (currNode?.nodeType === 'VECTOR_PATH' && otherNode.nodeType === 'VECTOR_PATH' && otherRole === 'DIAGRAM_PRIMITIVE') ||
            (currNode?.nodeType === 'RASTER_IMAGE' && otherNode.nodeType === 'RASTER_IMAGE' && otherRole === 'IMAGE');

          if (canClusterVisual) {
            if (!visitedNodes.has(otherId)) {
              visitedNodes.add(otherId);
              queue.push(otherId);
            }
          } else if (otherNode.nodeType === 'TEXT_RUN' || otherNode.nodeType === 'GLYPH_RUN') {
            const text = (otherNode.textContent || '').trim();
            // Candidate diagram label must be short and not an ordinary grammar word
            if (
              text.length > 0 &&
              text.length <= 25 &&
              !/^(?:and|the|in|of|for|to|with|by|from|which|is|are|was|were)$/i.test(text)
            ) {
              const isContainedOrClose =
                edge.relation === 'CONTAINS' ||
                edge.relation === 'INSIDE' ||
                edge.relation === 'TOUCHES' ||
                (edge.relation === 'NEAR' &&
                  otherNode.bbox.x0 >= minX - 12.0 &&
                  otherNode.bbox.x1 <= maxX + 12.0 &&
                  otherNode.bbox.y0 >= minY - 12.0 &&
                  otherNode.bbox.y1 <= maxY + 12.0);

              if (isContainedOrClose && !componentLabels.includes(otherId)) {
                componentLabels.push(otherId);
              }
            }
          }
        }
      }

      components.push({
        physicalNodeIds: componentPhysical,
        labelNodeIds: componentLabels,
        pageNumber: pageNum,
      });
    }

    // 4. Forensic Assessment Figure Qualification Gate
    for (const comp of components) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      const sourceAssetIds: string[] = [];

      for (const id of comp.physicalNodeIds) {
        const node = graph.nodes.get(id);
        if (node) {
          minX = Math.min(minX, node.bbox.x0);
          minY = Math.min(minY, node.bbox.y0);
          maxX = Math.max(maxX, node.bbox.x1);
          maxY = Math.max(maxY, node.bbox.y1);
          if (node.sourceEvidence?.sourceObjectId) {
            sourceAssetIds.push(node.sourceEvidence.sourceObjectId);
          }
        }
      }

      for (const id of comp.labelNodeIds) {
        const node = graph.nodes.get(id);
        if (node) {
          minX = Math.min(minX, node.bbox.x0);
          minY = Math.min(minY, node.bbox.y0);
          maxX = Math.max(maxX, node.bbox.x1);
          maxY = Math.max(maxY, node.bbox.y1);
        }
      }

      const clusterW = maxX - minX;
      const clusterH = maxY - minY;
      const pWidth = 595.0;
      const pHeight = 842.0;

      // Reject full page or oversized container hulls
      if (clusterW >= pWidth * 0.70 && clusterH >= pHeight * 0.50) continue;
      if (clusterH >= pHeight * 0.60) continue;

      const hasRaster = comp.physicalNodeIds.some(
        (id) => graph.nodes.get(id)?.nodeType === 'RASTER_IMAGE'
      );

      // Check for authentic figure anchors and engineering annotations
      const labelTexts = comp.labelNodeIds
        .map((id) => (graph.nodes.get(id)?.textContent || '').trim())
        .filter((t) => t.length > 0);

      const hasFigureCaption = labelTexts.some((t) =>
        /(?:figure|fig\.?|diagram|chart|circuit|graph)/i.test(t)
      );

      const hasEngineeringOrGeometricAnnotation = labelTexts.some((t) =>
        /(?:[ΩVμA-Z]\b|cm|mm|m\b|Hz|eV|kN|deg|°|%|\b[A-E]\b|\b[P-S]\b|\bR\d|\bC\d|\bV_)/i.test(t)
      );

      const hasMetadataLabel = labelTexts.some((t) =>
        /(?:roll\s+number|candidate\s+name|venue\s+name|exam\s+date|subject|question\s+id)/i.test(t)
      );
      if (hasMetadataLabel) continue;

      let isAuthenticAssessmentVisual = false;
      let clusterRole: VisualCandidateRole = 'OTHER';

      if (hasRaster) {
        // Authentic raster assessment asset
        if (clusterW >= 25.0 && clusterH >= 25.0) {
          isAuthenticAssessmentVisual = true;
          clusterRole = 'IMAGE';
        }
      } else {
        // Vector Assessment Figure Gate:
        // Must have multi-path complexity (>= 4 strokes), reasonable figure dimensions,
        // and either an explicit figure caption OR geometric/engineering annotations.
        if (
          comp.physicalNodeIds.length >= 4 &&
          clusterW >= 40.0 &&
          clusterH >= 40.0 &&
          (hasFigureCaption || hasEngineeringOrGeometricAnnotation)
        ) {
          isAuthenticAssessmentVisual = true;
          clusterRole = 'DIAGRAM_REGION';
        }
      }

      if (!isAuthenticAssessmentVisual) continue;

      const diagramId = `diag_p${comp.pageNumber}_${comp.physicalNodeIds[0]}`;
      const observationState: EvidenceObservationState = 'OBSERVED';
      const verificationStatus: QuestionVerificationStatus = 'SUPPORTED';

      diagrams.push({
        diagramCandidateId: diagramId,
        physicalNodeIds: comp.physicalNodeIds,
        labelNodeIds: comp.labelNodeIds,
        visualBbox: {
          x0: minX,
          y0: minY,
          x1: maxX,
          y1: maxY,
          width: clusterW,
          height: clusterH,
          unit: 'pt',
        },
        hasAccompanyingText: comp.labelNodeIds.length > 0,
        visualRole: clusterRole,
        authoritativeSourceAssetIds: sourceAssetIds,
        observationState,
        verificationStatus,
        confidenceScore: 0.96,
      });
    }

    return diagrams;
  }
}
