import { TextLine, ExtractedAsset } from './types';
import { CanonicalOption, CanonicalContentBlock, DisplayMode } from '../../../types/canonicalQuestion';
import { reconstructLineMath, wrapFormulaExpressions } from './mathReconstructor';

const OPTION_PREFIX_REGEX = /^(?:\(([A-Fa-f0-9])\)|\b([A-Fa-f0-9])[\.\)]\s*)\s*/;

/**
 * Parses raw option lines into structured CanonicalOption records with dynamic option counts.
 * Strictly preserves genuine option counts without padding fake options or truncating.
 */
export function segmentOptions(
  rawOptionLines: Map<string, TextLine[]>,
  associatedAssets: ExtractedAsset[]
): CanonicalOption[] {
  const options: CanonicalOption[] = [];
  const keysSet = new Set<string>(rawOptionLines.keys());
  for (const a of associatedAssets) {
    if (a.ownership && a.ownership.startsWith('OPTION_')) {
      keysSet.add(a.ownership.replace('OPTION_', ''));
    }
  }
  const sortedKeys = Array.from(keysSet).sort();

  for (const key of sortedKeys) {
    const lines = rawOptionLines.get(key) || [];
    const optionAsset = associatedAssets.find(
      (a) => a.ownership === `OPTION_${key.toUpperCase()}`
    );

    if (lines.length === 0 && !optionAsset) continue;

    let enrichedText = '';
    let ocrCandidate: string | undefined = undefined;

    if (lines.length > 0) {
      // Join and reconstruct math on option lines
      const lineTexts = lines.map((l) => reconstructLineMath(l));
      let rawText = lineTexts.join(' ').trim();

      // Strip leading option marker (e.g. "(A) " or "A. ")
      rawText = rawText.replace(OPTION_PREFIX_REGEX, '').trim();

      // Enrich with math notation if needed
      enrichedText = wrapFormulaExpressions(rawText);
      ocrCandidate = rawText || undefined;
    }

    const displayMode: DisplayMode =
      optionAsset && !enrichedText
        ? 'IMAGE_ONLY'
        : optionAsset && enrichedText
        ? 'TEXT_AND_IMAGE'
        : 'TEXT_ONLY';

    const cleanText = displayMode === 'IMAGE_ONLY' ? '' : enrichedText;
    const ocrText = displayMode === 'IMAGE_ONLY' ? ocrCandidate : undefined;
    const altText = optionAsset ? `Option ${key.toUpperCase()} figure` : undefined;

    const contentBlocks: CanonicalContentBlock[] = [];
    if (cleanText) {
      contentBlocks.push({
        type: 'text',
        content: cleanText,
      });
    }

    if (optionAsset) {
      contentBlocks.push({
        type: 'image',
        assetId: optionAsset.assetId,
        assetUrl: optionAsset.dataUrl,
        displayMode,
        altText,
        ocrText,
        confidence: 'VERIFIED',
      });
    }

    options.push({
      id: key.toUpperCase(),
      text: cleanText,
      displayMode,
      altText,
      ocrText,
      contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
      imageUrl: optionAsset?.dataUrl || null,
      assetId: optionAsset?.assetId,
    });
  }

  return options;
}
