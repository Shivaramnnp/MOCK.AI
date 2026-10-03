import JSZip from 'jszip';
import {
  DocumentIR,
  DocumentUnit,
  DocumentBlock,
  DocumentTable,
  DocumentAsset,
} from './types';
import { sanitizeXml, sanitizeHyperlink } from './officeSecurity';
import { ommlToLatex } from './ommlToLatex';

const EMU_PER_POINT = 12700; // 1 pt = 12,700 EMUs

interface RelationshipMap {
  [rId: string]: {
    target: string;
    type: string;
    isExternal: boolean;
  };
}

/**
 * High-fidelity Word (.docx) parser.
 * Extracts paragraphs, headings, lists, tables with spans/headers,
 * OMML math equations, hyperlinks, and embedded images from word/media.
 */
export async function parseDocxDocument(
  data: Uint8Array | ArrayBuffer,
  fileName: string,
  contentHash: string
): Promise<DocumentIR> {
  const zip = await JSZip.loadAsync(data);

  // 1. Read document relationships: word/_rels/document.xml.rels
  const rels: RelationshipMap = {};
  const relsFile = zip.file('word/_rels/document.xml.rels');
  if (relsFile) {
    const relsXml = sanitizeXml(await relsFile.async('text'));
    const relsDoc = new DOMParser().parseFromString(relsXml, 'text/xml');
    const relElements = relsDoc.getElementsByTagName('Relationship');
    for (let i = 0; i < relElements.length; i++) {
      const el = relElements[i];
      const id = el.getAttribute('Id') || '';
      const target = el.getAttribute('Target') || '';
      const type = el.getAttribute('Type') || '';
      const isExternal = el.getAttribute('TargetMode') === 'External';
      if (id) {
        rels[id] = { target, type, isExternal };
      }
    }
  }

  // 2. Extract embedded media files: word/media/*
  const assets: DocumentAsset[] = [];
  const assetMap = new Map<string, DocumentAsset>(); // key: relative media path (e.g. 'media/image1.png')

  for (const path in zip.files) {
    if (/^word\/media\//i.test(path)) {
      const file = zip.file(path);
      if (!file) continue;

      const mediaBytes = await file.async('uint8array');
      const mediaFileName = path.split('/').pop() || 'image.png';
      const mimeType = detectMimeType(mediaFileName);

      // Compute sha256 for asset
      let assetHash = '';
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        const hashBuf = await crypto.subtle.digest('SHA-256', mediaBytes);
        assetHash = Array.from(new Uint8Array(hashBuf))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
      } else {
        assetHash = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      }

      // Base64 data URL
      const base64 = uint8ArrayToBase64(mediaBytes);
      const dataUrl = `data:${mimeType};base64,${base64}`;

      const assetId = `docx_img_${assetHash.slice(0, 10)}`;
      const asset: DocumentAsset = {
        assetId,
        mimeType,
        dataUrl,
        sha256: assetHash,
        fileName: mediaFileName,
        sourcePartPath: path,
      };

      assets.push(asset);
      // Map both 'media/image1.png' and 'word/media/image1.png'
      assetMap.set(mediaFileName, asset);
      assetMap.set(`media/${mediaFileName}`, asset);
      assetMap.set(path, asset);
    }
  }

  // 3. Read word/document.xml
  const docFile = zip.file('word/document.xml');
  if (!docFile) {
    throw new Error('Corrupt DOCX archive: word/document.xml not found.');
  }

  const docXml = sanitizeXml(await docFile.async('text'));
  const dom = new DOMParser().parseFromString(docXml, 'text/xml');
  const body = dom.getElementsByTagName('w:body')[0] || dom.getElementsByTagName('body')[0];

  if (!body) {
    throw new Error('Corrupt DOCX document: <w:body> element missing.');
  }

  const units: DocumentUnit[] = [];
  let currentPage = 1;
  let currentBlocks: DocumentBlock[] = [];
  let blockCounter = 0;

  // Process child elements of body in document order
  for (let i = 0; i < body.children.length; i++) {
    const node = body.children[i];
    const nodeName = (node.localName || node.nodeName).replace(/^w:/, '');

    // Paragraph
    if (nodeName === 'p') {
      const pBlocks = parseParagraph(node, blockCounter, rels, assetMap);
      blockCounter += pBlocks.length;

      for (const block of pBlocks) {
        // Check for page break
        if (block.metadata?.isPageBreak) {
          if (currentBlocks.length > 0) {
            units.push({
              unitNumber: currentPage,
              unitType: 'page',
              blocks: currentBlocks,
            });
            currentBlocks = [];
            currentPage++;
          }
        } else {
          currentBlocks.push(block);
        }
      }
    }
    // Table
    else if (nodeName === 'tbl') {
      const tableBlock = parseTable(node, blockCounter);
      blockCounter++;
      if (tableBlock) {
        currentBlocks.push(tableBlock);
      }
    }
  }

  if (currentBlocks.length > 0) {
    units.push({
      unitNumber: currentPage,
      unitType: 'page',
      blocks: currentBlocks,
    });
  }

  // If no units generated, create empty unit
  if (units.length === 0) {
    units.push({
      unitNumber: 1,
      unitType: 'page',
      blocks: [],
    });
  }

  return {
    metadata: {
      sourceType: 'DOCX',
      fileName,
      fileSizeBytes: data instanceof ArrayBuffer ? data.byteLength : data.length,
      sha256: contentHash,
      totalUnits: units.length,
      unitType: 'page',
      createdAt: Date.now(),
    },
    units,
    embeddedAssets: assets,
  };
}

/**
 * Parses a <w:p> element into one or more structured DocumentBlocks.
 */
function parseParagraph(
  pNode: Element,
  startIndex: number,
  rels: RelationshipMap,
  assetMap: Map<string, DocumentAsset>
): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  const pPr = getChildByTag(pNode, 'pPr');

  // Check style / heading
  let blockType: DocumentBlock['type'] = 'paragraph';
  let headingLevel: number | undefined;
  let listType: 'bullet' | 'numbered' | undefined;

  if (pPr) {
    const pStyle = getChildByTag(pPr, 'pStyle');
    const styleVal = pStyle?.getAttribute('w:val') || pStyle?.getAttribute('val') || '';
    const headingMatch = styleVal.match(/Heading\s*(\d)/i);
    if (headingMatch) {
      blockType = 'heading';
      headingLevel = parseInt(headingMatch[1], 10);
    }

    const numPr = getChildByTag(pPr, 'numPr');
    if (numPr) {
      blockType = 'list_item';
      listType = 'numbered'; // defaults to numbered/bullet item
    }
  }

  let textParts: string[] = [];
  let isPageBreak = false;
  let paragraphImages: DocumentBlock[] = [];
  let paragraphEquations: DocumentBlock[] = [];

  // Iterate over paragraph children
  for (let j = 0; j < pNode.children.length; j++) {
    const child = pNode.children[j];
    const childName = (child.localName || child.nodeName).replace(/^[a-z]+:/, '');

    // 1. Run <w:r>
    if (childName === 'r') {
      const rPr = getChildByTag(child, 'rPr');
      const isBold = Boolean(getChildByTag(rPr, 'b'));
      const isItalic = Boolean(getChildByTag(rPr, 'i'));
      const vertAlign = getChildByTag(rPr, 'vertAlign');
      const vertVal = vertAlign?.getAttribute('w:val') || vertAlign?.getAttribute('val');

      // Check for page break inside run
      const br = getChildByTag(child, 'br');
      if (br) {
        const brType = br.getAttribute('w:type') || br.getAttribute('type');
        if (brType === 'page') {
          isPageBreak = true;
        }
      }

      // Text elements
      const t = getChildByTag(child, 't');
      if (t && t.textContent) {
        let runText = t.textContent;
        if (vertVal === 'superscript') {
          runText = `^{${runText}}`;
        } else if (vertVal === 'subscript') {
          runText = `_{${runText}}`;
        }
        textParts.push(runText);
      }

      // Drawing / Image inside run: <w:drawing>
      const drawing = getChildByTag(child, 'drawing');
      if (drawing) {
        const imgBlock = extractDrawingImage(drawing, startIndex + blocks.length, rels, assetMap);
        if (imgBlock) paragraphImages.push(imgBlock);
      }
    }
    // 2. Math Equation <m:oMath> or <m:oMathPara>
    else if (childName === 'oMath' || childName === 'oMathPara') {
      const latex = ommlToLatex(child);
      if (latex) {
        textParts.push(latex);
        paragraphEquations.push({
          id: `doc_block_${startIndex}_eq`,
          type: 'equation',
          equationLatex: latex,
          text: latex,
        });
      }
    }
    // 3. Hyperlink <w:hyperlink>
    else if (childName === 'hyperlink') {
      const rId = child.getAttribute('r:id') || child.getAttribute('id');
      const linkInfo = rId ? rels[rId] : null;
      let linkText = '';
      const runs = child.getElementsByTagName('w:t');
      for (let k = 0; k < runs.length; k++) {
        linkText += runs[k].textContent || '';
      }
      if (linkText) {
        const targetUrl = linkInfo?.target ? sanitizeHyperlink(linkInfo.target) : '';
        textParts.push(targetUrl ? `[${linkText}](${targetUrl})` : linkText);
      }
    }
    // 4. Drawing directly on paragraph
    else if (childName === 'drawing') {
      const imgBlock = extractDrawingImage(child, startIndex + blocks.length, rels, assetMap);
      if (imgBlock) paragraphImages.push(imgBlock);
    }
  }

  const paragraphText = textParts.join('').trim();

  // If this paragraph was solely a page break
  if (isPageBreak && !paragraphText && paragraphImages.length === 0) {
    return [
      {
        id: `doc_block_${startIndex}_pb`,
        type: 'paragraph',
        text: '',
        metadata: { isPageBreak: true },
      },
    ];
  }

  // Create text/heading block
  if (paragraphText) {
    blocks.push({
      id: `doc_block_${startIndex}`,
      type: blockType,
      text: paragraphText,
      headingLevel,
      listType,
      metadata: isPageBreak ? { isPageBreak: true } : undefined,
    });
  }

  // Add any equation blocks
  for (const eq of paragraphEquations) {
    blocks.push(eq);
  }

  // Add any image blocks
  for (const img of paragraphImages) {
    blocks.push(img);
  }

  return blocks;
}

/**
 * Extracts embedded image from <w:drawing>
 */
function extractDrawingImage(
  drawingNode: Element,
  index: number,
  rels: RelationshipMap,
  assetMap: Map<string, DocumentAsset>
): DocumentBlock | null {
  const blip = drawingNode.getElementsByTagName('a:blip')[0];
  if (!blip) return null;

  const embedId = blip.getAttribute('r:embed') || blip.getAttribute('embed');
  if (!embedId || !rels[embedId]) return null;

  const relTarget = rels[embedId].target; // e.g. 'media/image1.png'
  const asset = assetMap.get(relTarget) || assetMap.get(relTarget.split('/').pop() || '');

  // Extract dimensions from <wp:extent cx="..." cy="..."/>
  const extent = drawingNode.getElementsByTagName('wp:extent')[0];
  let width: number | undefined;
  let height: number | undefined;
  if (extent) {
    const cx = parseInt(extent.getAttribute('cx') || '0', 10);
    const cy = parseInt(extent.getAttribute('cy') || '0', 10);
    if (cx > 0) width = Math.round(cx / EMU_PER_POINT);
    if (cy > 0) height = Math.round(cy / EMU_PER_POINT);
  }

  return {
    id: `doc_block_${index}_img`,
    type: 'image',
    assetId: asset?.assetId || `img_${embedId}`,
    assetRef: asset?.dataUrl || relTarget,
    coordinates: width && height ? { x: 0, y: 0, width, height } : undefined,
  };
}

/**
 * Parses a <w:tbl> table element into a DocumentBlock containing a DocumentTable.
 */
function parseTable(tableNode: Element, index: number): DocumentBlock | null {
  const trElements = tableNode.getElementsByTagName('w:tr');
  if (trElements.length === 0) return null;

  const rows: string[][] = [];
  const headers: string[] = [];
  let isFirstRowHeader = false;

  for (let r = 0; r < trElements.length; r++) {
    const tr = trElements[r];
    const tcElements = tr.getElementsByTagName('w:tc');
    const rowCells: string[] = [];

    // Check if this row is designated as a table header
    const trPr = getChildByTag(tr, 'trPr');
    const tblHeader = getChildByTag(trPr, 'tblHeader');
    const isHeaderRow = r === 0 && Boolean(tblHeader);

    for (let c = 0; c < tcElements.length; c++) {
      const tc = tcElements[c];
      const pElements = tc.getElementsByTagName('w:p');
      const cellTextParts: string[] = [];

      for (let p = 0; p < pElements.length; p++) {
        const textNodes = pElements[p].getElementsByTagName('w:t');
        const pTexts: string[] = [];
        for (let t = 0; t < textNodes.length; t++) {
          pTexts.push(textNodes[t].textContent || '');
        }
        if (pTexts.length > 0) {
          cellTextParts.push(pTexts.join(''));
        }
      }

      const cellText = cellTextParts.join(' ').trim();
      rowCells.push(cellText);
    }

    if (isHeaderRow) {
      isFirstRowHeader = true;
      headers.push(...rowCells);
    } else {
      rows.push(rowCells);
    }
  }

  if (rows.length === 0 && headers.length > 0) {
    // If only 1 row was marked as header, treat it as row
    rows.push(headers);
  }

  const numCols = Math.max(...rows.map((r) => r.length), headers.length, 1);

  const table: DocumentTable = {
    headers: isFirstRowHeader ? headers : undefined,
    rows,
    numRows: rows.length,
    numCols,
  };

  return {
    id: `doc_block_${index}_tbl`,
    type: 'table',
    table,
  };
}

function getChildByTag(parent: Element | null, tag: string): Element | null {
  if (!parent) return null;
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    const local = (child.localName || child.nodeName).replace(/^w:/, '');
    if (local === tag) return child;
  }
  return null;
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
    case 'svg':
      return 'image/svg+xml';
    case 'webp':
      return 'image/webp';
    case 'emf':
    case 'wmf':
      return 'image/x-emf';
    default:
      return 'image/png';
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
  return Buffer.from(binary, 'binary').toString('base64');
}
