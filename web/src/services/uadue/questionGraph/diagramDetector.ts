/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Diagram Detector (Phase 2C Remediation)
 *
 * Clusters vector paths, raster XObjects, and spatially nested/adjacent labels
 * into structured DiagramCandidate entities while strictly filtering out:
 * - Full-page canvas and printer background images (PAGE_BACKGROUND / WATERMARK)
 * - Page template borders and question container frames (BORDER)
 * - Thin layout rule lines, dividers, and table borders (LAYOUT_DIVIDER / TABLE_RULE)
 * - Isolated mathematical vector symbols, fraction vinculums, and radicals (MATH_VECTOR)
 * - Small checkboxes, bullet vectors, and icons (CHECKBOX / ICON / DECORATIVE_VISUAL)
 * - Isolated unlabeled vector boxes and frames (DIAGRAM_PRIMITIVE)
 *
 * Inviolable Forensic Hierarchy:
 * PHYSICAL EVIDENCE -> CONTEXT -> CANDIDATE HYPOTHESIS -> OWNERSHIP EVIDENCE -> SEMANTIC CANDIDATE
 * "Do NOT OCR/describe a diagram as replacement text. Original physical visual nodes remain authoritative."
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
      if ((w >= pWidth * 0.70 && h >= pHeight * 0.65) || area >= pageArea * 0.45 || (w >= 1800.0 && h >= 1800.0)) {
        return 'PAGE_BACKGROUND';
      }
    }

    // 2. Count text nodes contained inside this element
    let containedTextCount = 0;
    for (const edge of graph.edges) {
      if (edge.sourceNodeId === node.nodeId && edge.relation === 'CONTAINS') {
        const targetNode = graph.nodes.get(edge.targetNodeId);
        if (targetNode && (targetNode.nodeType === 'TEXT_RUN' || targetNode.nodeType === 'GLYPH_RUN')) {
          containedTextCount++;
        }
      }
    }

    // 3. Page border or multi-question card container frame
    if (
      (w >= pWidth * 0.75 && h >= pHeight * 0.70) ||
      area >= pageArea * 0.50 ||
      containedTextCount > 5
    ) {
      return 'BORDER';
    }

    // 4. Thin layout dividers, table rules, and math lines
    if (h <= 4.0 || w <= 4.0) {
      if (w >= 50.0 || h >= 50.0) {
        return 'LAYOUT_DIVIDER';
      }
      return 'MATH_VECTOR';
    }

    // 5. Tiny icons, checkboxes, or bullet vectors
    if (w <= 16.0 && h <= 16.0) {
      return 'ICON';
    }

    // 6. Genuine raster image
    if (node.nodeType === 'RASTER_IMAGE') {
      return 'IMAGE';
    }

    // 7. General vector path candidate
    return 'DIAGRAM_PRIMITIVE';
  }

  /**
   * Identifies visual diagram candidates and their associated spatial labels.
   */
  public static detectDiagrams(graph: DocumentGraph): DiagramCandidate[] {
    const diagrams: DiagramCandidate[] = [];
    const processedVisualNodeIds = new Set<string>();

    // Pre-classify roles for all visual nodes
    const visualRoleMap = new Map<string, VisualCandidateRole>();
    for (const node of graph.nodes.values()) {
      if (node.nodeType === 'RASTER_IMAGE' || node.nodeType === 'VECTOR_PATH') {
        const role = DiagramDetector.classifyVisualRole(node, graph);
        visualRoleMap.set(node.nodeId, role);
      }
    }

    // Eligible candidate seeds: only IMAGE or DIAGRAM_PRIMITIVE
    const candidateNodes = Array.from(graph.nodes.values()).filter((n) => {
      const role = visualRoleMap.get(n.nodeId);
      return role === 'IMAGE' || role === 'DIAGRAM_PRIMITIVE';
    });

    for (const vNode of candidateNodes) {
      if (processedVisualNodeIds.has(vNode.nodeId)) continue;

      const pageNum = vNode.pageNumber;
      const clusterPhysicalNodeIds: string[] = [vNode.nodeId];
      const clusterLabelNodeIds: string[] = [];
      const sourceAssetIds: string[] = [];

      if (vNode.sourceEvidence?.sourceObjectId) {
        sourceAssetIds.push(vNode.sourceEvidence.sourceObjectId);
      }

      processedVisualNodeIds.add(vNode.nodeId);

      let minX = vNode.bbox.x0;
      let minY = vNode.bbox.y0;
      let maxX = vNode.bbox.x1;
      let maxY = vNode.bbox.y1;

      // Find nearby or overlapping visual elements on the same page
      // Inviolable Rule: NEVER follow edges to BORDER or PAGE_BACKGROUND nodes!
      const relatedVisualEdges = graph.edges.filter(
        (e) =>
          (e.sourceNodeId === vNode.nodeId || e.targetNodeId === vNode.nodeId) &&
          (e.relation === 'OVERLAPS' ||
            e.relation === 'TOUCHES' ||
            e.relation === 'NEAR' ||
            e.relation === 'CONTAINS' ||
            e.relation === 'INSIDE')
      );

      for (const edge of relatedVisualEdges) {
        const otherId = edge.sourceNodeId === vNode.nodeId ? edge.targetNodeId : edge.sourceNodeId;
        const otherNode = graph.nodes.get(otherId);
        if (!otherNode || otherNode.pageNumber !== pageNum) continue;

        const otherRole = visualRoleMap.get(otherId);

        if (otherRole === 'IMAGE' || otherRole === 'DIAGRAM_PRIMITIVE') {
          // If relation is CONTAINS or INSIDE, only merge if neither is a large container
          const vW = Math.abs(vNode.bbox.x1 - vNode.bbox.x0);
          const oW = Math.abs(otherNode.bbox.x1 - otherNode.bbox.x0);
          if ((edge.relation === 'CONTAINS' || edge.relation === 'INSIDE') && (vW >= 300 || oW >= 300)) {
            continue;
          }

          if (!clusterPhysicalNodeIds.includes(otherId)) {
            clusterPhysicalNodeIds.push(otherId);
            processedVisualNodeIds.add(otherId);
            if (otherNode.sourceEvidence?.sourceObjectId) {
              sourceAssetIds.push(otherNode.sourceEvidence.sourceObjectId);
            }
            minX = Math.min(minX, otherNode.bbox.x0);
            minY = Math.min(minY, otherNode.bbox.y0);
            maxX = Math.max(maxX, otherNode.bbox.x1);
            maxY = Math.max(maxY, otherNode.bbox.y1);
          }
        } else if (otherNode.nodeType === 'TEXT_RUN' || otherNode.nodeType === 'GLYPH_RUN') {
          // Diagram label must be short and geometrically close or contained within the diagram
          const text = (otherNode.textContent || '').trim();
          const isShortLabel = text.length > 0 && text.length <= 25;
          const isContained =
            (edge.sourceNodeId === vNode.nodeId && edge.relation === 'CONTAINS') ||
            (edge.targetNodeId === vNode.nodeId && edge.relation === 'INSIDE');
          const isContainedOrTouching =
            isContained ||
            edge.relation === 'TOUCHES' ||
            (edge.relation === 'NEAR' &&
              otherNode.bbox.x0 >= minX - 15.0 &&
              otherNode.bbox.x1 <= maxX + 15.0 &&
              otherNode.bbox.y0 >= minY - 15.0 &&
              otherNode.bbox.y1 <= maxY + 15.0);

          if (isShortLabel && isContainedOrTouching) {
            if (!clusterLabelNodeIds.includes(otherId)) {
              clusterLabelNodeIds.push(otherId);
              clusterPhysicalNodeIds.push(otherId);
              minX = Math.min(minX, otherNode.bbox.x0);
              minY = Math.min(minY, otherNode.bbox.y0);
              maxX = Math.max(maxX, otherNode.bbox.x1);
              maxY = Math.max(maxY, otherNode.bbox.y1);
            }
          }
        }
      }

      // 4. Forensic Diagram Validation Gate
      const hasRaster = clusterPhysicalNodeIds.some(
        (id) => graph.nodes.get(id)?.nodeType === 'RASTER_IMAGE'
      );
      const hasLabels = clusterLabelNodeIds.length > 0;
      const clusterW = maxX - minX;
      const clusterH = maxY - minY;

      let isAuthenticDiagram = false;
      let clusterRole: VisualCandidateRole = 'OTHER';

      if (hasRaster) {
        // Genuine raster image diagram
        isAuthenticDiagram = true;
        clusterRole = 'IMAGE';
      } else if (hasLabels && clusterW >= 35.0 && clusterH >= 35.0) {
        // Vector cluster with embedded/touching labels
        isAuthenticDiagram = true;
        clusterRole = 'DIAGRAM_REGION';
      } else if (clusterPhysicalNodeIds.length >= 4 && clusterW >= 50.0 && clusterH >= 50.0 && clusterW * clusterH >= 3000) {
        // Complex multi-primitive vector drawing
        isAuthenticDiagram = true;
        clusterRole = 'DIAGRAM_REGION';
      }

      if (!isAuthenticDiagram) {
        // Filter out isolated vector paths, table rules, and empty boxes
        continue;
      }

      const diagramId = `diag_p${pageNum}_${vNode.nodeId}`;
      const observationState: EvidenceObservationState = 'OBSERVED';
      const verificationStatus: QuestionVerificationStatus = 'SUPPORTED';

      diagrams.push({
        diagramCandidateId: diagramId,
        physicalNodeIds: clusterPhysicalNodeIds,
        labelNodeIds: clusterLabelNodeIds,
        visualBbox: {
          x0: minX,
          y0: minY,
          x1: maxX,
          y1: maxY,
          width: maxX - minX,
          height: maxY - minY,
          unit: 'pt',
        },
        hasAccompanyingText: clusterLabelNodeIds.length > 0,
        visualRole: clusterRole,
        authoritativeSourceAssetIds: sourceAssetIds,
        observationState,
        verificationStatus,
        confidenceScore: 0.95,
      });
    }

    return diagrams;
  }
}
