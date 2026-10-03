import JSZip from 'jszip';
import {
  DocumentIR,
  DocumentUnit,
  DocumentBlock,
  DocumentTable,
  DocumentAsset,
} from './types';
import { sanitizeXml } from './officeSecurity';
import { ommlToLatex } from './ommlToLatex';

const EMU_PER_POINT = 12700; // 1 pt = 12,700 EMUs

interface SlideRelMap {
  [rId: string]: {
    target: string;
    type: string;
  };
}

/**
 * High-fidelity PowerPoint (.pptx) parser.
 * Extracts slides, shape order and spatial coordinates, text boxes,
 * tables, charts, speaker notes, and embedded images from ppt/media.
 */
export async function parsePptxDocument(
  data: Uint8Array | ArrayBuffer,
  fileName: string,
  contentHash: string
): Promise<DocumentIR> {
  const zip = await JSZip.loadAsync(data);

  // 1. Extract embedded media files: ppt/media/*
  const assets: DocumentAsset[] = [];
  const assetMap = new Map<string, DocumentAsset>();

  for (const path in zip.files) {
    if (/^ppt\/media\//i.test(path)) {
      const file = zip.file(path);
      if (!file) continue;

      const mediaBytes = await file.async('uint8array');
      const mediaFileName = path.split('/').pop() || 'image.png';
      const mimeType = detectMimeType(mediaFileName);

      let assetHash = '';
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        const hashBuf = await crypto.subtle.digest('SHA-256', mediaBytes);
        assetHash = Array.from(new Uint8Array(hashBuf))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
      } else {
        assetHash = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      }

      const base64 = uint8ArrayToBase64(mediaBytes);
      const dataUrl = `data:${mimeType};base64,${base64}`;

      const assetId = `pptx_img_${assetHash.slice(0, 10)}`;
      const asset: DocumentAsset = {
        assetId,
        mimeType,
        dataUrl,
        sha256: assetHash,
        fileName: mediaFileName,
        sourcePartPath: path,
      };

      assets.push(asset);
      assetMap.set(mediaFileName, asset);
      assetMap.set(`media/${mediaFileName}`, asset);
      assetMap.set(`../media/${mediaFileName}`, asset);
      assetMap.set(path, asset);
    }
  }

  // 2. Discover slides in order
  const slideFiles: { num: number; slidePath: string }[] = [];

  // Try reading ppt/_rels/presentation.xml.rels and ppt/presentation.xml
  const presFile = zip.file('ppt/presentation.xml');
  const presRelsFile = zip.file('ppt/_rels/presentation.xml.rels');

  if (presFile && presRelsFile) {
    const presRelsXml = sanitizeXml(await presRelsFile.async('text'));
    const presRelsDoc = new DOMParser().parseFromString(presRelsXml, 'text/xml');
    const rels: Record<string, string> = {};
    const relEls = presRelsDoc.getElementsByTagName('Relationship');
    for (let i = 0; i < relEls.length; i++) {
      const id = relEls[i].getAttribute('Id') || '';
      const target = relEls[i].getAttribute('Target') || '';
      if (id && target) {
        // Normalize target path (e.g. 'slides/slide1.xml' -> 'ppt/slides/slide1.xml')
        const norm = target.startsWith('ppt/') ? target : `ppt/${target.replace(/^\.\//, '')}`;
        rels[id] = norm;
      }
    }

    const presXml = sanitizeXml(await presFile.async('text'));
    const presDoc = new DOMParser().parseFromString(presXml, 'text/xml');
    const sldIdEls = presDoc.getElementsByTagName('p:sldId');

    for (let i = 0; i < sldIdEls.length; i++) {
      const rId = sldIdEls[i].getAttribute('r:id') || sldIdEls[i].getAttribute('id') || '';
      const slidePath = rels[rId];
      if (slidePath && zip.file(slidePath)) {
        slideFiles.push({ num: i + 1, slidePath });
      }
    }
  }

  // Fallback if presentation.xml enumeration was empty
  if (slideFiles.length === 0) {
    zip.forEach((path) => {
      const match = path.match(/^ppt\/slides\/slide(\d+)\.xml$/i);
      if (match) {
        slideFiles.push({ num: parseInt(match[1], 10), slidePath: path });
      }
    });
    slideFiles.sort((a, b) => a.num - b.num);
  }

  const units: DocumentUnit[] = [];

  for (let sIdx = 0; sIdx < slideFiles.length; sIdx++) {
    const { num: slideNum, slidePath } = slideFiles[sIdx];
    const slideZipFile = zip.file(slidePath);
    if (!slideZipFile) continue;

    // Read slide relationships (ppt/slides/_rels/slide{N}.xml.rels)
    const relsPath = slidePath.replace('slides/slide', 'slides/_rels/slide') + '.rels';
    const slideRels: SlideRelMap = {};
    const slideRelsFile = zip.file(relsPath);

    let notesSlidePath: string | null = null;

    if (slideRelsFile) {
      const relsXml = sanitizeXml(await slideRelsFile.async('text'));
      const relsDoc = new DOMParser().parseFromString(relsXml, 'text/xml');
      const relEls = relsDoc.getElementsByTagName('Relationship');
      for (let i = 0; i < relEls.length; i++) {
        const id = relEls[i].getAttribute('Id') || '';
        const target = relEls[i].getAttribute('Target') || '';
        const type = relEls[i].getAttribute('Type') || '';
        if (id) {
          slideRels[id] = { target, type };
          if (type.includes('notesSlide')) {
            // e.g. '../notesSlides/notesSlide1.xml' -> 'ppt/notesSlides/notesSlide1.xml'
            notesSlidePath = `ppt/${target.replace(/^\.\.\//, '')}`;
          }
        }
      }
    }

    // Read slide content
    const slideXml = sanitizeXml(await slideZipFile.async('text'));
    const slideDoc = new DOMParser().parseFromString(slideXml, 'text/xml');
    const spTree = slideDoc.getElementsByTagName('p:spTree')[0];

    const slideBlocks: DocumentBlock[] = [];
    let blockCounter = 0;

    if (spTree) {
      const elements = extractSlideElements(spTree, sIdx + 1, slideRels, assetMap);
      // Sort shapes top-to-bottom (Y), then left-to-right (X)
      elements.sort((a, b) => {
        const yA = a.coordinates?.y ?? 0;
        const yB = b.coordinates?.y ?? 0;
        if (Math.abs(yA - yB) > 10) {
          return yA - yB;
        }
        const xA = a.coordinates?.x ?? 0;
        const xB = b.coordinates?.x ?? 0;
        return xA - xB;
      });

      slideBlocks.push(...elements);
    }

    // Read speaker notes if available
    let speakerNotes: string | undefined;
    if (notesSlidePath) {
      const notesFile = zip.file(notesSlidePath);
      if (notesFile) {
        const notesXml = sanitizeXml(await notesFile.async('text'));
        const notesDoc = new DOMParser().parseFromString(notesXml, 'text/xml');
        const textElements = notesDoc.getElementsByTagName('a:t');
        const noteStrings: string[] = [];
        for (let t = 0; t < textElements.length; t++) {
          const str = textElements[t].textContent || '';
          if (str.trim()) noteStrings.push(str.trim());
        }
        if (noteStrings.length > 0) {
          speakerNotes = noteStrings.join(' ');
        }
      }
    }

    units.push({
      unitNumber: slideNum,
      unitType: 'slide',
      blocks: slideBlocks,
      speakerNotes,
    });
  }

  return {
    metadata: {
      sourceType: 'PPTX',
      fileName,
      fileSizeBytes: data instanceof ArrayBuffer ? data.byteLength : data.length,
      sha256: contentHash,
      totalUnits: units.length,
      unitType: 'slide',
      createdAt: Date.now(),
    },
    units,
    embeddedAssets: assets,
  };
}

/**
 * Extracts blocks (shapes, pictures, tables, charts) from a slide shape tree.
 */
function extractSlideElements(
  container: Element,
  slideNumber: number,
  slideRels: SlideRelMap,
  assetMap: Map<string, DocumentAsset>
): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];

  for (let i = 0; i < container.children.length; i++) {
    const child = container.children[i];
    const name = (child.localName || child.nodeName).replace(/^p:/, '');

    // 1. Standard Shape or Text Box: <p:sp>
    if (name === 'sp') {
      const coords = extractCoordinates(child);
      const txBody = getChildByTag(child, 'txBody');

      if (txBody) {
        const paragraphs = txBody.getElementsByTagName('a:p');
        for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
          const p = paragraphs[pIdx];
          const textParts: string[] = [];
          const textRuns = p.getElementsByTagName('a:r');

          for (let rIdx = 0; rIdx < textRuns.length; rIdx++) {
            const r = textRuns[rIdx];
            const t = r.getElementsByTagName('a:t')[0];
            if (t && t.textContent) {
              textParts.push(t.textContent);
            }
          }

          // Check for math equations inside paragraph
          const oMathEls = p.getElementsByTagName('m:oMath');
          for (let m = 0; m < oMathEls.length; m++) {
            const latex = ommlToLatex(oMathEls[m]);
            if (latex) textParts.push(latex);
          }

          const fullText = textParts.join(' ').trim();
          if (fullText) {
            blocks.push({
              id: `pptx_s${slideNumber}_b${blocks.length}`,
              type: 'paragraph',
              text: fullText,
              coordinates: coords,
            });
          }
        }
      }
    }
    // 2. Picture / Diagram: <p:pic>
    else if (name === 'pic') {
      const coords = extractCoordinates(child);
      const blip = child.getElementsByTagName('a:blip')[0];
      if (blip) {
        const embedId = blip.getAttribute('r:embed') || blip.getAttribute('embed');
        if (embedId && slideRels[embedId]) {
          const target = slideRels[embedId].target;
          const asset = assetMap.get(target) || assetMap.get(target.split('/').pop() || '');

          blocks.push({
            id: `pptx_s${slideNumber}_img${blocks.length}`,
            type: 'image',
            assetId: asset?.assetId || `img_${embedId}`,
            assetRef: asset?.dataUrl || target,
            coordinates: coords,
          });
        }
      }
    }
    // 3. Graphic Frame (Tables & Charts): <p:graphicFrame>
    else if (name === 'graphicFrame') {
      const coords = extractCoordinates(child);

      // Table: <a:tbl>
      const tbl = child.getElementsByTagName('a:tbl')[0];
      if (tbl) {
        const tableBlock = parsePptxTable(tbl, slideNumber, blocks.length, coords);
        if (tableBlock) blocks.push(tableBlock);
      }

      // Chart: <c:chart>
      const chart = child.getElementsByTagName('c:chart')[0];
      if (chart) {
        blocks.push({
          id: `pptx_s${slideNumber}_chart${blocks.length}`,
          type: 'chart',
          coordinates: coords,
        });
      }
    }
    // 4. Group Shape: <p:grpSp>
    else if (name === 'grpSp') {
      const groupChildren = extractSlideElements(child, slideNumber, slideRels, assetMap);
      blocks.push(...groupChildren);
    }
  }

  return blocks;
}

/**
 * Parses a PowerPoint table <a:tbl> into a structured DocumentBlock.
 */
function parsePptxTable(
  tblNode: Element,
  slideNumber: number,
  index: number,
  coordinates?: { x: number; y: number; width: number; height: number }
): DocumentBlock | null {
  const trElements = tblNode.getElementsByTagName('a:tr');
  if (trElements.length === 0) return null;

  const rows: string[][] = [];

  for (let r = 0; r < trElements.length; r++) {
    const tr = trElements[r];
    const tcElements = tr.getElementsByTagName('a:tc');
    const rowCells: string[] = [];

    for (let c = 0; c < tcElements.length; c++) {
      const tc = tcElements[c];
      const pElements = tc.getElementsByTagName('a:p');
      const cellTexts: string[] = [];

      for (let p = 0; p < pElements.length; p++) {
        const textElements = pElements[p].getElementsByTagName('a:t');
        const pStrings: string[] = [];
        for (let t = 0; t < textElements.length; t++) {
          pStrings.push(textElements[t].textContent || '');
        }
        if (pStrings.length > 0) {
          cellTexts.push(pStrings.join(''));
        }
      }

      rowCells.push(cellTexts.join(' ').trim());
    }

    rows.push(rowCells);
  }

  const numCols = Math.max(...rows.map((r) => r.length), 1);

  const table: DocumentTable = {
    rows,
    numRows: rows.length,
    numCols,
  };

  return {
    id: `pptx_s${slideNumber}_tbl${index}`,
    type: 'table',
    table,
    coordinates,
  };
}

/**
 * Extracts spatial coordinates (X, Y, Width, Height in points) from <a:xfrm>.
 */
function extractCoordinates(element: Element): { x: number; y: number; width: number; height: number } | undefined {
  const xfrm = element.getElementsByTagName('a:xfrm')[0];
  if (!xfrm) return undefined;

  const off = xfrm.getElementsByTagName('a:off')[0];
  const ext = xfrm.getElementsByTagName('a:ext')[0];

  if (!off || !ext) return undefined;

  const xEmus = parseInt(off.getAttribute('x') || '0', 10);
  const yEmus = parseInt(off.getAttribute('y') || '0', 10);
  const cxEmus = parseInt(ext.getAttribute('cx') || '0', 10);
  const cyEmus = parseInt(ext.getAttribute('cy') || '0', 10);

  return {
    x: Math.round(xEmus / EMU_PER_POINT),
    y: Math.round(yEmus / EMU_PER_POINT),
    width: Math.round(cxEmus / EMU_PER_POINT),
    height: Math.round(cyEmus / EMU_PER_POINT),
  };
}

function getChildByTag(parent: Element | null, tag: string): Element | null {
  if (!parent) return null;
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    const local = (child.localName || child.nodeName).replace(/^[a-z]+:/, '');
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
