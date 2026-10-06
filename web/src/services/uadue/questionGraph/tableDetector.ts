/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Table Detector (Phase 2C)
 *
 * Detects table candidates and preserves grid geometry, rows, columns, and cells.
 *
 * Inviolable Principle:
 * "Do NOT flatten tables into plain text.
 * Represent Table physical identity -> rows, columns, cells, cell spans, cell geometry.
 * Maintain Column-I / Column-II matching structures without premature semantic flattening."
 */

import { DocumentGraph, DocumentGraphNode } from '../contracts/documentGraph';
import {
  TableCandidate,
  TableCellCandidate,
  EvidenceObservationState,
  QuestionVerificationStatus,
} from '../contracts/questionGraph';

export class TableDetector {
  /**
   * Detects tabular structures and constructs structured TableCandidate representations.
   */
  public static detectTables(graph: DocumentGraph): TableCandidate[] {
    const tableCandidates: TableCandidate[] = [];
    const processedNodes = new Set<string>();

    const nodesList = Array.from(graph.nodes.values())
      .filter((n) => n.nodeType === 'TEXT_RUN' || n.nodeType === 'GLYPH_RUN' || n.nodeType === 'VECTOR_PATH')
      .sort((a, b) => {
        if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
        return a.bbox.y0 - b.bbox.y0;
      });

    // Look for Column-I / Column-II or List-I / List-II pattern headers
    for (let i = 0; i < nodesList.length; i++) {
      const node = nodesList[i];
      if (processedNodes.has(node.nodeId)) continue;
      const text = (node.textContent || '').trim();

      const isMatchingHeader =
        /^(?:column\s*[-–—]?\s*[i1]|list\s*[-–—]?\s*[i1]|match\s+the\s+following)/i.test(text);

      if (!isMatchingHeader) continue;

      // Found potential matching table header (e.g. Column I)
      const pageNum = node.pageNumber;
      const candidateTableNodes: DocumentGraphNode[] = [node];
      processedNodes.add(node.nodeId);

      // Find partner header (e.g. Column II or List II) on the same horizontal row
      const sameRowHeaders = nodesList.filter(
        (n) =>
          n.pageNumber === pageNum &&
          n.nodeId !== node.nodeId &&
          Math.abs(n.bbox.y0 - node.bbox.y0) <= 10.0 &&
          /^(?:column\s*[-–—]?\s*(?:ii|2)|list\s*[-–—]?\s*(?:ii|2))/i.test((n.textContent || '').trim())
      );

      let isColumnIColumnIIMatch = false;
      if (sameRowHeaders.length > 0) {
        isColumnIColumnIIMatch = true;
        for (const h of sameRowHeaders) {
          candidateTableNodes.push(h);
          processedNodes.add(h.nodeId);
        }
      }

      // Collect subsequent rows of matching items (e.g. P., Q., R., S. in Col 1 and 1., 2., 3., 4. in Col 2)
      const tableTopY = node.bbox.y0;
      let tableBottomY = node.bbox.y1;
      let minX = node.bbox.x0;
      let maxX = node.bbox.x1;

      for (let j = 0; j < nodesList.length; j++) {
        const item = nodesList[j];
        if (processedNodes.has(item.nodeId)) continue;
        if (item.pageNumber !== pageNum) continue;

        // Must be below header and within vertical span of 220 pt
        if (item.bbox.y0 >= tableTopY + 5.0 && item.bbox.y0 <= tableTopY + 220.0) {
          const itemText = (item.textContent || '').trim();
          // Skip if next question anchor or options appear
          if (/^q(?:uestion)?\.?\s*\d+/i.test(itemText) || /^\([a-d]\)\s+[a-d]/i.test(itemText)) {
            continue;
          }

          // Check if item aligns with either column
          const alignsCol1 = Math.abs(item.bbox.x0 - node.bbox.x0) <= 60.0;
          const partnerX = sameRowHeaders[0]?.bbox.x0 || node.bbox.x1 + 50.0;
          const alignsCol2 = Math.abs(item.bbox.x0 - partnerX) <= 60.0;

          if (alignsCol1 || alignsCol2) {
            candidateTableNodes.push(item);
            processedNodes.add(item.nodeId);
            tableBottomY = Math.max(tableBottomY, item.bbox.y1);
            minX = Math.min(minX, item.bbox.x0);
            maxX = Math.max(maxX, item.bbox.x1);
          }
        }
      }

      if (candidateTableNodes.length >= 4) {
        // Construct cells
        const cells: TableCellCandidate[] = [];
        // Group candidate nodes by vertical bands (rows)
        candidateTableNodes.sort((a, b) => a.bbox.y0 - b.bbox.y0);

        const rowBands: DocumentGraphNode[][] = [];
        let currentRow: DocumentGraphNode[] = [];
        let currentRowY = candidateTableNodes[0].bbox.y0;

        for (const n of candidateTableNodes) {
          if (Math.abs(n.bbox.y0 - currentRowY) <= 12.0) {
            currentRow.push(n);
          } else {
            if (currentRow.length > 0) rowBands.push(currentRow);
            currentRow = [n];
            currentRowY = n.bbox.y0;
          }
        }
        if (currentRow.length > 0) rowBands.push(currentRow);

        for (let rIdx = 0; rIdx < rowBands.length; rIdx++) {
          const rowElements = rowBands[rIdx].sort((a, b) => a.bbox.x0 - b.bbox.x0);
          for (let cIdx = 0; cIdx < rowElements.length; cIdx++) {
            const cellNode = rowElements[cIdx];
            cells.push({
              rowIndex: rIdx,
              columnIndex: cIdx,
              rowSpan: 1,
              colSpan: 1,
              physicalNodeIds: [cellNode.nodeId],
              textContent: cellNode.textContent,
              bbox: cellNode.bbox,
            });
          }
        }

        const tableId = `tbl_p${pageNum}_${node.nodeId}`;
        const observationState: EvidenceObservationState = isColumnIColumnIIMatch ? 'OBSERVED' : 'INFERRED';
        const verificationStatus: QuestionVerificationStatus = 'SUPPORTED';

        tableCandidates.push({
          tableCandidateId: tableId,
          physicalNodeIds: candidateTableNodes.map((n) => n.nodeId),
          rowCount: rowBands.length,
          columnCount: sameRowHeaders.length > 0 ? 2 : 1,
          cells,
          gridGeometry: {
            x0: minX,
            y0: tableTopY,
            x1: maxX,
            y1: tableBottomY,
            unit: 'pt',
          },
          isColumnIColumnIIMatch,
          observationState,
          verificationStatus,
          confidenceScore: isColumnIColumnIIMatch ? 0.95 : 0.82,
        });
      }
    }

    return tableCandidates;
  }
}
