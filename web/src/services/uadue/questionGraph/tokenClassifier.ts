/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Token Classifier (Phase 2C)
 *
 * Exam-agnostic candidate token classifier.
 * Inviolable Principle:
 * "A number-like token is NOT automatically a question number."
 *
 * Distinguishes:
 * - PAGE_NUMBER
 * - SECTION_NUMBER
 * - QUESTION_NUMBER
 * - OPTION_NUMBER
 * - FIGURE_NUMBER
 * - TABLE_NUMBER
 * - PARAGRAPH_NUMBER
 * - CODE_LINE_NUMBER
 * - YEAR_NUMBER
 * - MATHEMATICAL_NUMBER
 * - UNKNOWN_NUMBER
 *
 * Evaluates spatial context, typography, reading flow position, prefixes, and sequence continuity.
 */

import { DocumentGraphNode } from '../contracts/documentGraph';
import { NumberCandidateType } from '../contracts/questionGraph';
import { ContextualAnalysisResult } from './contextualTokenReconstructor';

export interface TokenClassificationResult {
  nodeId: string;
  tokenType: NumberCandidateType;
  detectedNumber?: number;
  rawLabel: string;
  confidence: number;
  evidence: {
    spatialLocationBasis: string;
    typographicBasis: string;
    lexicalBasis: string;
    sequenceBasis?: string;
  };
}

export class TokenClassifier {
  /**
   * Classifies a text run node into its prospective number semantic role.
   */
  public static classifyToken(
    node: DocumentGraphNode,
    pageHeight: number,
    pageWidth: number,
    previousQuestionNumber?: number,
    previousQuestionHasExplicitPrefix: boolean = false,
    context?: ContextualAnalysisResult
  ): TokenClassificationResult {
    const rawText = (node.textContent || '').trim();

    // Default result for non-numeric or unclassified text
    const defaultUnknown: TokenClassificationResult = {
      nodeId: node.nodeId,
      tokenType: 'UNKNOWN_NUMBER',
      rawLabel: rawText,
      confidence: 0.1,
      evidence: {
        spatialLocationBasis: 'Standard page body',
        typographicBasis: 'Standard font size',
        lexicalBasis: 'No number pattern detected',
      },
    };

    if (!rawText) return defaultUnknown;

    const bbox = node.bbox;
    const isTopMargin = bbox.y1 <= 65;
    const isBottomMargin = bbox.y0 >= pageHeight - 75;
    const isCol1Left = bbox.x0 <= pageWidth * 0.25;
    const isCol2Left = bbox.x0 >= pageWidth * 0.45 && bbox.x0 <= pageWidth * 0.60;
    const isLeftEdge = isCol1Left || isCol2Left;

    // A. Check Contextual Split Question Anchors (e.g. Node A: "Q." + Node B: "2")
    if (context?.splitQuestionAnchors.has(node.nodeId)) {
      const split = context.splitQuestionAnchors.get(node.nodeId)!;
      if (split.primaryNodeId === node.nodeId) {
        return {
          nodeId: node.nodeId,
          tokenType: 'QUESTION_NUMBER',
          detectedNumber: split.detectedNumber,
          rawLabel: split.combinedLabel,
          confidence: split.confidence,
          evidence: {
            spatialLocationBasis: `Contextual split question anchor at x=${bbox.x0.toFixed(1)}, y=${bbox.y0.toFixed(1)} pt`,
            typographicBasis: 'Contextually unified split question anchor',
            lexicalBasis: `Unified prefix + number: "${split.combinedLabel}"`,
            sequenceBasis: previousQuestionNumber ? `Sequential successor to Q.${previousQuestionNumber}` : 'Initial question',
          },
        };
      } else {
        // Secondary node (the digit portion) is consumed by the primary anchor
        return {
          nodeId: node.nodeId,
          tokenType: 'UNKNOWN_NUMBER',
          rawLabel: rawText,
          confidence: 0.1,
          evidence: {
            spatialLocationBasis: `Part of split question anchor ${split.combinedLabel}`,
            typographicBasis: 'Secondary token of unified question number',
            lexicalBasis: `Consumed into primary anchor: "${split.combinedLabel}"`,
          },
        };
      }
    }

    // B. Check Statement Enumeration Context (e.g. "1. Jhelum River...", "2. Krishna River...")
    if (context?.statementNodeIds.has(node.nodeId)) {
      return {
        nodeId: node.nodeId,
        tokenType: 'STATEMENT_NUMBER',
        rawLabel: rawText,
        confidence: 0.95,
        evidence: {
          spatialLocationBasis: `Located within statement directive block at y=${bbox.y0.toFixed(1)} pt`,
          typographicBasis: 'Indented statement enumeration bullet',
          lexicalBasis: `Statement directive context: "${rawText}"`,
        },
      };
    }

    // C. Check Metadata Table Context (e.g. "Question ID :", "Status :", "Chosen Option : 1")
    if (context?.metadataNodeIds.has(node.nodeId)) {
      return {
        nodeId: node.nodeId,
        tokenType: 'METADATA_NUMBER',
        rawLabel: rawText,
        confidence: 0.99,
        evidence: {
          spatialLocationBasis: `Within metadata table at y=${bbox.y0.toFixed(1)} pt`,
          typographicBasis: 'TCS/CBT response metadata value',
          lexicalBasis: `Official response metadata: "${rawText}"`,
        },
      };
    }

    // D. Check Ordinary Prose Sentences starting with "A", "An", "The", "I"
    if (context?.ordinaryTextNodeIds.has(node.nodeId)) {
      return defaultUnknown;
    }

    // 0. Check for Exam Timing / Metadata Patterns (e.g. "11:45 AM - 12:45 PM", "Question ID : 123456")
    if (
      /^\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?/i.test(rawText) ||
      /\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/i.test(rawText)
    ) {
      return {
        nodeId: node.nodeId,
        tokenType: 'UNKNOWN_NUMBER',
        rawLabel: rawText,
        confidence: 0.1,
        evidence: {
          spatialLocationBasis: `Header location at y=${bbox.y0.toFixed(1)} pt`,
          typographicBasis: 'Header metadata text',
          lexicalBasis: `Examination timing string: "${rawText}"`,
        },
      };
    }

    if (/^(?:Question\s+ID|Option\s+\d+\s+ID|Status|Chosen\s+Option)\s*:/i.test(rawText)) {
      return {
        nodeId: node.nodeId,
        tokenType: 'METADATA_NUMBER',
        rawLabel: rawText,
        confidence: 0.99,
        evidence: {
          spatialLocationBasis: `Table/block at x=${bbox.x0.toFixed(1)}, y=${bbox.y0.toFixed(1)} pt`,
          typographicBasis: 'Metadata table text',
          lexicalBasis: `Official response sheet metadata: "${rawText}"`,
        },
      };
    }

    // 1. Check for Figure Number (e.g. "Figure 1", "Fig. 2", "Fig 4(a)")
    const figureMatch = rawText.match(/^(?:figure|fig\.?)\s*(\d+)/i);
    if (figureMatch) {
      const num = parseInt(figureMatch[1], 10);
      return {
        nodeId: node.nodeId,
        tokenType: 'FIGURE_NUMBER',
        detectedNumber: num,
        rawLabel: rawText,
        confidence: 0.95,
        evidence: {
          spatialLocationBasis: `Located at y=[${bbox.y0.toFixed(1)}, ${bbox.y1.toFixed(1)}] pt`,
          typographicBasis: `Font size ${node.style?.fontSizePt || 'unknown'} pt`,
          lexicalBasis: `Explicit figure caption prefix: "${figureMatch[0]}"`,
        },
      };
    }

    // 2. Check for Table Number (e.g. "Table 1", "Tab. 3")
    const tableMatch = rawText.match(/^(?:table|tab\.?)\s*(\d+)/i);
    if (tableMatch) {
      const num = parseInt(tableMatch[1], 10);
      return {
        nodeId: node.nodeId,
        tokenType: 'TABLE_NUMBER',
        detectedNumber: num,
        rawLabel: rawText,
        confidence: 0.95,
        evidence: {
          spatialLocationBasis: `Located at y=[${bbox.y0.toFixed(1)}, ${bbox.y1.toFixed(1)}] pt`,
          typographicBasis: `Font size ${node.style?.fontSizePt || 'unknown'} pt`,
          lexicalBasis: `Explicit table caption prefix: "${tableMatch[0]}"`,
        },
      };
    }

    // 3. Check for Section Number (e.g. "Section 1", "Part A", "Section-I", "Section II")
    const sectionMatch = rawText.match(/^(?:section|part)\s*[-:]?\s*([0-9ivxlcdm]+|[a-z])/i);
    if (sectionMatch) {
      const num = parseInt(sectionMatch[1], 10);
      return {
        nodeId: node.nodeId,
        tokenType: 'SECTION_NUMBER',
        detectedNumber: Number.isNaN(num) ? undefined : num,
        rawLabel: rawText,
        confidence: 0.92,
        evidence: {
          spatialLocationBasis: `Header location at y=[${bbox.y0.toFixed(1)}, ${bbox.y1.toFixed(1)}] pt`,
          typographicBasis: `Header font size ${node.style?.fontSizePt || 'unknown'} pt`,
          lexicalBasis: `Explicit section prefix: "${sectionMatch[0]}"`,
        },
      };
    }

    // 4. Check for Page Number (isolated number in top/bottom margin)
    const isPureInteger = /^\d{1,4}$/.test(rawText);
    const isPageNumberLike = /^(?:page\s*)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?$/i.test(rawText);

    if ((isPageNumberLike && (isTopMargin || isBottomMargin)) || (isPureInteger && isBottomMargin)) {
      const numMatch = rawText.match(/\d+/);
      const pageNum = numMatch ? parseInt(numMatch[0], 10) : undefined;
      return {
        nodeId: node.nodeId,
        tokenType: 'PAGE_NUMBER',
        detectedNumber: pageNum,
        rawLabel: rawText,
        confidence: 0.94,
        evidence: {
          spatialLocationBasis: `In ${isTopMargin ? 'top' : 'bottom'} page margin at y=${bbox.y0.toFixed(1)} pt`,
          typographicBasis: `Isolated margin token`,
          lexicalBasis: `Matches page numbering token: "${rawText}"`,
        },
      };
    }

    // 5. Check for 4-digit Year Number (e.g. 1947, 1999, 2023, 2024 in running text)
    if (isPureInteger && rawText.length === 4) {
      const year = parseInt(rawText, 10);
      if (year >= 1500 && year <= 2100 && !isLeftEdge) {
        return {
          nodeId: node.nodeId,
          tokenType: 'YEAR_NUMBER',
          detectedNumber: year,
          rawLabel: rawText,
          confidence: 0.85,
          evidence: {
            spatialLocationBasis: `Embedded in running text at x=${bbox.x0.toFixed(1)} pt`,
            typographicBasis: `Inline running text font`,
            lexicalBasis: `4-digit historical or current calendar year: ${year}`,
          },
        };
      }
    }

    // 6. Check for Option Number / Marker (e.g. "(A)", "(B)", "(1)", "(2)", "(a)", "A.", "1.", "1. Business")
    const optionPrefixMatch = rawText.match(/^(\(?([A-Ea-e]|[1-4]|[ivx]+)\)?[\.\)])(?:\s+|$)/i);
    if (optionPrefixMatch && !rawText.match(/^q(?:uestion)?/i)) {
      const markerLetterOrNum = optionPrefixMatch[2];
      const isLetterOption = /^[A-Ea-e]$/.test(markerLetterOrNum);
      const isRomanOption = /^[ivx]+$/i.test(markerLetterOrNum);
      const optNum = parseInt(markerLetterOrNum, 10);

      // If it's a letter (A-E) or roman (i-iv), it's ALWAYS an option
      if (isLetterOption || isRomanOption) {
        return {
          nodeId: node.nodeId,
          tokenType: 'OPTION_NUMBER',
          rawLabel: rawText,
          confidence: 0.90,
          evidence: {
            spatialLocationBasis: `Located at x=${bbox.x0.toFixed(1)}, y=${bbox.y0.toFixed(1)} pt`,
            typographicBasis: `Option marker prefix`,
            lexicalBasis: `Option marker syntax: "${optionPrefixMatch[1]}"`,
          },
        };
      }

      // Check if this bare 1-4 token is actually an initial or sequential question number at the margin
      const isSequentialQuestion =
        !previousQuestionHasExplicitPrefix &&
        isLeftEdge && !isTopMargin && !isBottomMargin &&
        ((previousQuestionNumber === undefined && optNum === 1) ||
         (previousQuestionNumber !== undefined && optNum === previousQuestionNumber + 1));

      // If it's not a sequential question and an active question is in scope, it's an option under that question
      if (!isSequentialQuestion && previousQuestionNumber !== undefined && optNum >= 1 && optNum <= 4) {
        return {
          nodeId: node.nodeId,
          tokenType: 'OPTION_NUMBER',
          rawLabel: rawText,
          confidence: 0.88,
          evidence: {
            spatialLocationBasis: `Located below active Q.${previousQuestionNumber} at y=${bbox.y0.toFixed(1)} pt`,
            typographicBasis: `Numbered option prefix under active question`,
            lexicalBasis: `Option marker syntax: "${optionPrefixMatch[1]}"`,
          },
        };
      }
    }

    // 7. Check for Mathematical Number (e.g. "= 42", "+ 15", "10^-3", "3.1415", "x = 5")
    const isMathNumber = /^[=+\-×÷√±]\s*\d+|\d+\s*[=+\-×÷√±%]|^\d+\.\d+$|^\d+\s*(?:cm|mm|m|kg|s|Hz|eV|N|J|W|Ω)$/i.test(rawText);
    if (isMathNumber) {
      return {
        nodeId: node.nodeId,
        tokenType: 'MATHEMATICAL_NUMBER',
        rawLabel: rawText,
        confidence: 0.90,
        evidence: {
          spatialLocationBasis: `Located in formula/expression line at y=${bbox.y0.toFixed(1)} pt`,
          typographicBasis: `Math symbol / unit context`,
          lexicalBasis: `Mathematical operator or unit adjacent to number: "${rawText}"`,
        },
      };
    }

    // 8. Check for Question Number Candidate
    // Case A: Explicit Question prefix (e.g. "Q.1", "Q. 1", "Question 10", "Que 5", "Q1", "Q.10 Select...")
    const explicitQMatch = rawText.match(/^(?:q(?:uestion)?|qn|que)\.?\s*(\d{1,4})(?:[\.\)\-\:]|\s+|$)/i);
    if (explicitQMatch) {
      const num = parseInt(explicitQMatch[1], 10);
      let confidence = 0.98;
      let sequenceBasis = 'Explicit question prefix';
      if (previousQuestionNumber !== undefined) {
        if (num === previousQuestionNumber + 1) {
          confidence = 0.99;
          sequenceBasis = `Perfect sequential successor to Q.${previousQuestionNumber}`;
        }
      }
      return {
        nodeId: node.nodeId,
        tokenType: 'QUESTION_NUMBER',
        detectedNumber: num,
        rawLabel: explicitQMatch[0].trim(),
        confidence,
        evidence: {
          spatialLocationBasis: `Left alignment at x=${bbox.x0.toFixed(1)} pt`,
          typographicBasis: `Explicit question anchor`,
          lexicalBasis: `Explicit question syntax: "${explicitQMatch[0]}"`,
          sequenceBasis,
        },
      };
    }

    // Case B: Bare number question (e.g. "1.", "2.", "25.")
    if (!previousQuestionHasExplicitPrefix && isLeftEdge && !isTopMargin && !isBottomMargin) {
      const bareNumMatch = rawText.match(/^(\d{1,4})[\.\)](?:\s+.*)?$/);
      if (bareNumMatch) {
        const num = parseInt(bareNumMatch[1], 10);
        if (
          (previousQuestionNumber === undefined && num === 1) ||
          (previousQuestionNumber !== undefined && num === previousQuestionNumber + 1)
        ) {
          return {
            nodeId: node.nodeId,
            tokenType: 'QUESTION_NUMBER',
            detectedNumber: num,
            rawLabel: rawText,
            confidence: 0.88,
            evidence: {
              spatialLocationBasis: `Left margin at x=${bbox.x0.toFixed(1)} pt`,
              typographicBasis: `Leading numeric bullet`,
              lexicalBasis: `Sequential question numbering: ${num}`,
              sequenceBasis: previousQuestionNumber ? `Sequential successor to Q.${previousQuestionNumber}` : 'Initial question',
            },
          };
        }
      }
    }

    return defaultUnknown;
  }
}
