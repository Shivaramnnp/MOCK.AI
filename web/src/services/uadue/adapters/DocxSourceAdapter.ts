/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Adapter: Microsoft Word (.docx) OpenXML Source Adapter
 *
 * Implements UadueSourceAdapter for native DOCX documents.
 * Extracts paragraphs, OMML mathematical formulas, structured tables,
 * and embedded media directly into Universal DocumentIR.
 *
 * Principle: Pure decoder. Never segments questions or assigns answers.
 */

import JSZip from 'jszip';
import {
  DocumentIR,
  DocumentIRPage,
  DocumentIRElement,
  DocumentIRMediaAsset,
  DocumentIRTableData,
  DocumentIRTableCell,
} from '../contracts/documentIR';
import { BoundingBox2D } from '../contracts/evidence';
import { UadueSourceAdapter, SourceValidationResult, AdapterExtractionOptions } from './SourceAdapterInterface';
import { ommlToLatex } from '../../ingestion/office/ommlToLatex';

async function computeSha256(data: Uint8Array): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = (hash << 5) - hash + data[i];
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

function detectMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    case 'emf':
    case 'wmf':
      return 'image/x-emf';
    default:
      return 'application/octet-stream';
  }
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa !== 'undefined') {
    return btoa(binary);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(binary, 'binary').toString('base64');
  }
  return '';
}

export class DocxSourceAdapter implements UadueSourceAdapter<Uint8Array | ArrayBuffer | Blob> {
  readonly adapterId = 'uadue_adapter_docx';
  readonly adapterVersion = '1.0.0';
  readonly supportedFormats = ['DOCX' as const];
  readonly supportedMimeTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ];

  private toUint8Array(input: Uint8Array | ArrayBuffer | Blob): Promise<Uint8Array> {
    if (input instanceof Blob) {
      return input.arrayBuffer().then((ab) => new Uint8Array(ab));
    }
    if (input instanceof ArrayBuffer) {
      return Promise.resolve(new Uint8Array(input.slice(0)));
    }
    return Promise.resolve(new Uint8Array(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)));
  }

  async validateInput(input: Uint8Array | ArrayBuffer | Blob): Promise<SourceValidationResult> {
    if (!input) {
      return { valid: false, error: 'Input is empty or null.', fileSizeBytes: 0 };
    }

    const bytes = await this.toUint8Array(input);
    const size = bytes.length;

    if (size < 100) {
      return { valid: false, error: 'File size is too small for a valid Word (.docx) document.', fileSizeBytes: size };
    }

    // Check ZIP magic bytes PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
      return {
        valid: false,
        error: 'Invalid file format: missing ZIP archive header for .docx package.',
        fileSizeBytes: size,
      };
    }

    return {
      valid: true,
      detectedFormat: 'DOCX',
      fileSizeBytes: size,
    };
  }

  async extractDocumentIR(
    input: Uint8Array | ArrayBuffer | Blob,
    options?: AdapterExtractionOptions
  ): Promise<DocumentIR> {
    const validation = await this.validateInput(input);
    if (!validation.valid) {
      throw new Error(`[DocxSourceAdapter] Validation failed: ${validation.error}`);
    }

    const binaryData = await this.toUint8Array(input);
    const sourceHash = await computeSha256(binaryData);

async function parseXmlString(xml: string): Promise<Document> {
  if (typeof DOMParser !== 'undefined') {
    return new DOMParser().parseFromString(xml, 'text/xml');
  }
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM(xml, { contentType: 'text/xml' });
  return dom.window.document;
}

    const zip = await JSZip.loadAsync(binaryData);

    // 1. Parse word/_rels/document.xml.rels for media mapping
    const relsMap = new Map<string, string>(); // rId -> target
    const relsFile = zip.file('word/_rels/document.xml.rels');
    if (relsFile) {
      const relsXml = await relsFile.async('text');
      const relsDoc = await parseXmlString(relsXml);
      const relElements = relsDoc.getElementsByTagName('Relationship');
      for (let i = 0; i < relElements.length; i++) {
        const id = relElements[i].getAttribute('Id');
        const target = relElements[i].getAttribute('Target');
        if (id && target) {
          relsMap.set(id, target);
        }
      }
    }

    // 2. Extract embedded media files: word/media/*
    const embeddedMedia: DocumentIRMediaAsset[] = [];
    const mediaPathToAssetId = new Map<string, string>();

    for (const path in zip.files) {
      if (/^word\/media\//i.test(path)) {
        const file = zip.file(path);
        if (!file) continue;

        const mediaBytes = await file.async('uint8array');
        const mediaFileName = path.split('/').pop() || 'image.png';
        const mimeType = detectMimeType(mediaFileName);
        const mediaHash = await computeSha256(mediaBytes);
        const assetId = `asset_${mediaHash.slice(0, 12)}`;

        const base64 = uint8ArrayToBase64(mediaBytes);
        const dataUrl = `data:${mimeType};base64,${base64}`;

        const asset: DocumentIRMediaAsset = {
          assetId,
          mimeType,
          sha256: mediaHash,
          widthPx: 600,
          heightPx: 400,
          originalFileName: mediaFileName,
          dataUrl,
        };

        embeddedMedia.push(asset);
        mediaPathToAssetId.set(path, assetId);
        mediaPathToAssetId.set(`media/${mediaFileName}`, assetId);
        mediaPathToAssetId.set(mediaFileName, assetId);
      }
    }

    // 3. Read word/document.xml
    const docFile = zip.file('word/document.xml');
    if (!docFile) {
      throw new Error('[DocxSourceAdapter] Missing word/document.xml in archive.');
    }

    const docXml = await docFile.async('text');
    const docDom = await parseXmlString(docXml);
    const body = docDom.getElementsByTagName('w:body')[0];

    if (!body) {
      throw new Error('[DocxSourceAdapter] No <w:body> found in Word document.');
    }

    // Standard A4 page geometry in points
    const PAGE_WIDTH = 595.28; // pt
    const PAGE_HEIGHT = 841.89; // pt
    const MARGIN_LEFT = 54;
    const MARGIN_RIGHT = 54;
    const MARGIN_TOP = 54;
    const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

    const pages: DocumentIRPage[] = [];
    let currentPageNumber = 1;
    let currentY = MARGIN_TOP;
    let currentElements: DocumentIRElement[] = [];
    let readingOrder: string[] = [];
    let readingOrderCounter = 0;

    const commitPage = async () => {
      const pageRep = currentElements.map((e) => `${e.bbox.x0},${e.bbox.y0}:${e.rawContent}`).join('|');
      const pageHash = await computeSha256(new TextEncoder().encode(pageRep));

      pages.push({
        pageNumber: currentPageNumber,
        dimensions: {
          width: PAGE_WIDTH,
          height: PAGE_HEIGHT,
          unit: 'pt',
        },
        elements: [...currentElements],
        readingOrder: [...readingOrder],
        pageHash,
      });

      currentPageNumber++;
      currentY = MARGIN_TOP;
      currentElements = [];
      readingOrder = [];
    };

    const childNodes = Array.from(body.childNodes);

    for (let nodeIdx = 0; nodeIdx < childNodes.length; nodeIdx++) {
      const node = childNodes[nodeIdx] as Element;
      if (node.nodeType !== 1) continue; // Skip non-element nodes

      // A. Section Break or Page Break Check
      const hasPageBreak = node.querySelector?.('w\\:br[w\\:type="page"], br[type="page"]');
      if (hasPageBreak && currentElements.length > 0) {
        await commitPage();
      }

      // Check vertical page overflow
      if (currentY > PAGE_HEIGHT - 72 && currentElements.length > 0) {
        await commitPage();
      }

      // B. Paragraph Element <w:p>
      if (node.tagName === 'w:p') {
        // 1. Check for OMML equations inside paragraph
        const mathNodes = node.getElementsByTagName('m:oMath');
        if (mathNodes.length > 0) {
          for (let mIdx = 0; mIdx < mathNodes.length; mIdx++) {
            const mathEl = mathNodes[mIdx];
            const latex = ommlToLatex(mathEl);
            const mathHeight = 24;
            const elementId = `doc_${sourceHash.slice(0, 8)}_p${currentPageNumber}_math_${readingOrderCounter}`;

            const bbox: BoundingBox2D = {
              x0: MARGIN_LEFT,
              y0: Math.round(currentY * 100) / 100,
              x1: Math.round((MARGIN_LEFT + CONTENT_WIDTH) * 100) / 100,
              y1: Math.round((currentY + mathHeight) * 100) / 100,
              width: CONTENT_WIDTH,
              height: mathHeight,
              pageWidth: PAGE_WIDTH,
              pageHeight: PAGE_HEIGHT,
              unit: 'pt',
            };

            const element: DocumentIRElement = {
              elementId,
              pageNumber: currentPageNumber,
              type: 'EQUATION_CONTAINER',
              bbox,
              rawContent: latex ? `$${latex}$` : '',
              confidence: 1.0,
              readingOrderIndex: readingOrderCounter++,
            };

            currentElements.push(element);
            readingOrder.push(elementId);
            currentY += mathHeight + 8;
          }
          continue;
        }

        // 2. Check for drawing / images
        const blips = node.getElementsByTagName('a:blip');
        if (blips.length > 0) {
          for (let bIdx = 0; bIdx < blips.length; bIdx++) {
            const embedId = blips[bIdx].getAttribute('r:embed');
            if (embedId && relsMap.has(embedId)) {
              const relTarget = relsMap.get(embedId)!;
              const assetId = mediaPathToAssetId.get(relTarget);
              const imgHeight = 120;
              const elementId = `doc_${sourceHash.slice(0, 8)}_p${currentPageNumber}_img_${readingOrderCounter}`;

              const bbox: BoundingBox2D = {
                x0: MARGIN_LEFT,
                y0: Math.round(currentY * 100) / 100,
                x1: Math.round((MARGIN_LEFT + 200) * 100) / 100,
                y1: Math.round((currentY + imgHeight) * 100) / 100,
                width: 200,
                height: imgHeight,
                pageWidth: PAGE_WIDTH,
                pageHeight: PAGE_HEIGHT,
                unit: 'pt',
              };

              const element: DocumentIRElement = {
                elementId,
                pageNumber: currentPageNumber,
                type: 'IMAGE_BITMAP',
                bbox,
                rawContent: `[Embedded Image: ${assetId || relTarget}]`,
                confidence: 1.0,
                mediaRefId: assetId,
                readingOrderIndex: readingOrderCounter++,
              };

              currentElements.push(element);
              readingOrder.push(elementId);
              currentY += imgHeight + 8;
            }
          }
          continue;
        }

        // 3. Regular text paragraph
        const textRuns = node.getElementsByTagName('w:r');
        let paraText = '';
        let isBold = false;
        let isItalic = false;

        for (let rIdx = 0; rIdx < textRuns.length; rIdx++) {
          const run = textRuns[rIdx];
          const textEl = run.getElementsByTagName('w:t')[0];
          if (textEl && textEl.textContent) {
            paraText += textEl.textContent;
          }
          if (run.getElementsByTagName('w:b').length > 0) isBold = true;
          if (run.getElementsByTagName('w:i').length > 0) isItalic = true;
        }

        if (!paraText.trim()) continue;

        const approxHeight = Math.max(16, Math.ceil(paraText.length / 80) * 16);
        const elementId = `doc_${sourceHash.slice(0, 8)}_p${currentPageNumber}_p_${readingOrderCounter}`;

        const bbox: BoundingBox2D = {
          x0: MARGIN_LEFT,
          y0: Math.round(currentY * 100) / 100,
          x1: Math.round((MARGIN_LEFT + CONTENT_WIDTH) * 100) / 100,
          y1: Math.round((currentY + approxHeight) * 100) / 100,
          width: CONTENT_WIDTH,
          height: approxHeight,
          pageWidth: PAGE_WIDTH,
          pageHeight: PAGE_HEIGHT,
          unit: 'pt',
        };

        const element: DocumentIRElement = {
          elementId,
          pageNumber: currentPageNumber,
          type: 'TEXT_LINE',
          bbox,
          rawContent: paraText.trim(),
          confidence: 1.0,
          style: {
            fontSizePt: 11,
            isBold,
            isItalic,
          },
          readingOrderIndex: readingOrderCounter++,
        };

        currentElements.push(element);
        readingOrder.push(elementId);
        currentY += approxHeight + 6;
      }

      // C. Table Element <w:tbl>
      if (node.tagName === 'w:tbl') {
        const rowNodes = node.getElementsByTagName('w:tr');
        const cells: DocumentIRTableCell[] = [];
        let maxCols = 0;

        for (let rIdx = 0; rIdx < rowNodes.length; rIdx++) {
          const cellNodes = rowNodes[rIdx].getElementsByTagName('w:tc');
          maxCols = Math.max(maxCols, cellNodes.length);

          for (let cIdx = 0; cIdx < cellNodes.length; cIdx++) {
            const cell = cellNodes[cIdx];
            const pEls = cell.getElementsByTagName('w:p');
            let cellText = '';
            for (let pIdx = 0; pIdx < pEls.length; pIdx++) {
              cellText += (pEls[pIdx].textContent || '').trim() + ' ';
            }

            const colWidth = CONTENT_WIDTH / Math.max(1, cellNodes.length);
            const cellBbox: BoundingBox2D = {
              x0: Math.round((MARGIN_LEFT + cIdx * colWidth) * 100) / 100,
              y0: Math.round((currentY + rIdx * 20) * 100) / 100,
              x1: Math.round((MARGIN_LEFT + (cIdx + 1) * colWidth) * 100) / 100,
              y1: Math.round((currentY + (rIdx + 1) * 20) * 100) / 100,
              width: Math.round(colWidth * 100) / 100,
              height: 20,
              pageWidth: PAGE_WIDTH,
              pageHeight: PAGE_HEIGHT,
              unit: 'pt',
            };

            cells.push({
              rowIndex: rIdx,
              colIndex: cIdx,
              rowSpan: 1,
              colSpan: 1,
              bbox: cellBbox,
              rawText: cellText.trim(),
              elements: [],
            });
          }
        }

        const tableHeight = rowNodes.length * 20 + 8;
        const tableData: DocumentIRTableData = {
          rowCount: rowNodes.length,
          colCount: maxCols,
          cells,
          hasBorders: true,
        };

        const elementId = `doc_${sourceHash.slice(0, 8)}_p${currentPageNumber}_tbl_${readingOrderCounter}`;
        const bbox: BoundingBox2D = {
          x0: MARGIN_LEFT,
          y0: Math.round(currentY * 100) / 100,
          x1: Math.round((MARGIN_LEFT + CONTENT_WIDTH) * 100) / 100,
          y1: Math.round((currentY + tableHeight) * 100) / 100,
          width: CONTENT_WIDTH,
          height: tableHeight,
          pageWidth: PAGE_WIDTH,
          pageHeight: PAGE_HEIGHT,
          unit: 'pt',
        };

        const element: DocumentIRElement = {
          elementId,
          pageNumber: currentPageNumber,
          type: 'TABLE_STRUCTURE',
          bbox,
          rawContent: `[Table: ${tableData.rowCount}x${tableData.colCount}]`,
          confidence: 1.0,
          tableData,
          readingOrderIndex: readingOrderCounter++,
        };

        currentElements.push(element);
        readingOrder.push(elementId);
        currentY += tableHeight + 8;
      }
    }

    if (currentElements.length > 0) {
      await commitPage();
    }

    return {
      documentId: `doc_${sourceHash.slice(0, 16)}`,
      sourceHash,
      sourceFormat: 'DOCX',
      sourceFileName: 'SourceDocument.docx',
      fileSizeBytes: binaryData.byteLength,
      totalPages: pages.length,
      pages,
      embeddedMedia,
      metadata: {
        docxParser: 'UADUE_OPENXML_DECODER',
        extractedAt: Date.now(),
      },
      createdAt: Date.now(),
    };
  }
}
