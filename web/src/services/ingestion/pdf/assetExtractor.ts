import { ExtractedAsset, AssetOwnership, BoundingBox } from './types';

/**
 * Extracts and classifies image assets from a PDF.js page operator list and object store.
 */
export async function extractPageAssets(
  page: any,
  pageNumber: number,
  viewport: { width: number; height: number },
  contentHash: string
): Promise<ExtractedAsset[]> {
  const assets: ExtractedAsset[] = [];
  if (!page || !page.getOperatorList) return assets;

  try {
    const ops = await page.getOperatorList();
    const pdfjsOps = (window as any).pdfjsLib?.OPS || {
      paintImageXObject: 85,
      paintInlineImageXObject: 86,
      transform: 11,
    };

    let lastTransform = [1, 0, 0, 1, 0, 0];
    const imageCandidates: {
      opIndex: number;
      imgName: string;
      transform: number[];
      width: number;
      height: number;
    }[] = [];

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i];

      if (fn === pdfjsOps.transform || fn === 11) {
        lastTransform = args;
      } else if (
        fn === pdfjsOps.paintImageXObject ||
        fn === 85 ||
        fn === pdfjsOps.paintInlineImageXObject ||
        fn === 86
      ) {
        const imgName = args[0];
        const intrinsicWidth = args[1] || 100;
        const intrinsicHeight = args[2] || 100;

        imageCandidates.push({
          opIndex: i,
          imgName,
          transform: lastTransform,
          width: intrinsicWidth,
          height: intrinsicHeight,
        });
      }
    }

    const pageArea = viewport.width * viewport.height;

    for (const cand of imageCandidates) {
      const tx = cand.transform[4] || 0;
      const ty = cand.transform[5] || 0;
      const renderedWidth = Math.abs(cand.transform[0]) || cand.width;
      const renderedHeight = Math.abs(cand.transform[3]) || cand.height;

      const boundingBox: BoundingBox = {
        x: tx,
        y: ty,
        width: renderedWidth,
        height: renderedHeight,
        pageWidth: viewport.width,
        pageHeight: viewport.height,
      };

      const renderedArea = renderedWidth * renderedHeight;
      const coverageRatio = renderedArea / pageArea;

      // 1. Watermark Detection: Spans > 65% of entire page
      if (coverageRatio > 0.65 || (renderedWidth > viewport.width * 0.85 && renderedHeight > viewport.height * 0.85)) {
        assets.push({
          assetId: `wm_${cand.imgName}_p${pageNumber}`,
          sourcePage: pageNumber,
          boundingBox,
          mimeType: 'image/png',
          width: cand.width,
          height: cand.height,
          hash: `wm_${cand.imgName}`,
          ownership: 'WATERMARK',
          contentType: 'image',
        });
        continue;
      }

      // 2. Header / Footer Detection: At very top or bottom of page
      if (ty > viewport.height * 0.92) {
        assets.push({
          assetId: `hdr_${cand.imgName}_p${pageNumber}`,
          sourcePage: pageNumber,
          boundingBox,
          mimeType: 'image/png',
          width: cand.width,
          height: cand.height,
          hash: `hdr_${cand.imgName}`,
          ownership: 'HEADER',
          contentType: 'image',
        });
        continue;
      }

      if (ty < viewport.height * 0.06) {
        assets.push({
          assetId: `ftr_${cand.imgName}_p${pageNumber}`,
          sourcePage: pageNumber,
          boundingBox,
          mimeType: 'image/png',
          width: cand.width,
          height: cand.height,
          hash: `ftr_${cand.imgName}`,
          ownership: 'FOOTER',
          contentType: 'image',
        });
        continue;
      }

      // 3. Document Decoration: tiny icons (< 15x15 px)
      if (renderedWidth < 15 && renderedHeight < 15) {
        assets.push({
          assetId: `dec_${cand.imgName}_p${pageNumber}`,
          sourcePage: pageNumber,
          boundingBox,
          mimeType: 'image/png',
          width: cand.width,
          height: cand.height,
          hash: `dec_${cand.imgName}`,
          ownership: 'DOCUMENT_DECORATION',
          contentType: 'image',
        });
        continue;
      }

      // 4. Genuine Question or Option Diagram
      let dataUrl: string | undefined;
      try {
        dataUrl = await extractImageObjAsDataUrl(page, cand.imgName);
      } catch {
        // Fallback: dataUrl may be undefined if pixel buffer cannot be decoded
      }

      const assetId = `crop_p${pageNumber}_${cand.imgName}`;

      assets.push({
        assetId,
        sourcePage: pageNumber,
        boundingBox,
        mimeType: 'image/png',
        width: cand.width,
        height: cand.height,
        hash: `${contentHash.slice(0, 8)}_p${pageNumber}_${cand.imgName}`,
        ownership: 'QUESTION', // Option-specific assignment refined during segmentation
        contentType: 'diagram',
        dataUrl,
      });
    }
  } catch (err) {
    console.warn(`[AssetExtractor] Error extracting assets on page ${pageNumber}:`, err);
  }

  return assets;
}

/**
 * Attempts to extract raw RGBA pixel data from page object store and convert to data URL.
 */
function extractImageObjAsDataUrl(page: any, imgName: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    if (!page.objs || !page.objs.get) {
      return resolve(undefined);
    }

    try {
      page.objs.get(imgName, (img: any) => {
        if (!img || !img.data || !img.width || !img.height) {
          return resolve(undefined);
        }

        // Render pixel data onto offscreen canvas
        if (typeof document !== 'undefined' && document.createElement) {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(undefined);

          const imgData = ctx.createImageData(img.width, img.height);
          const srcData = img.data;

          if (img.kind === 2) {
            // RGBA
            imgData.data.set(srcData);
          } else if (img.kind === 1) {
            // RGB
            let srcIdx = 0;
            let destIdx = 0;
            while (srcIdx < srcData.length && destIdx < imgData.data.length) {
              imgData.data[destIdx] = srcData[srcIdx];
              imgData.data[destIdx + 1] = srcData[srcIdx + 1];
              imgData.data[destIdx + 2] = srcData[srcIdx + 2];
              imgData.data[destIdx + 3] = 255;
              srcIdx += 3;
              destIdx += 4;
            }
          } else {
            // Grayscale
            let srcIdx = 0;
            let destIdx = 0;
            while (srcIdx < srcData.length && destIdx < imgData.data.length) {
              const val = srcData[srcIdx];
              imgData.data[destIdx] = val;
              imgData.data[destIdx + 1] = val;
              imgData.data[destIdx + 2] = val;
              imgData.data[destIdx + 3] = 255;
              srcIdx++;
              destIdx += 4;
            }
          }

          ctx.putImageData(imgData, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } else {
          resolve(undefined);
        }
      });
    } catch {
      resolve(undefined);
    }
  });
}
