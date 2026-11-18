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
    context?: ContextualAnalysisResult,
    pageFirstQuestionNumber?: number,
    previousPageFirstQuestionNumber?: number,
    activeQuestionAnchorX?: number
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
    const isTopMargin = bbox.y1 <= 50.0;
    const isBottomMargin = bbox.y0 >= pageHeight - 75;
    const isCol1Left = bbox.x0 <= pageWidth * 0.25;
    const isCol2Left = bbox.x0 >= pageWidth * 0.45 && bbox.x0 <= pageWidth * 0.60;
    const isLeftEdge = isCol1Left || isCol2Left;

    // Cover page numbers are exclusively candidate instructions, never questions or options
    if (context?.coverPageNumbers?.has(node.pageNumber)) {
      return {
        nodeId: node.nodeId,
        tokenType: 'INSTRUCTION_NUMBER',
        rawLabel: rawText,
        confidence: 0.99,
        evidence: {
          spatialLocationBasis: `Front cover page at y=${bbox.y0.toFixed(1)} pt`,
          typographicBasis: 'Front cover instruction bullet',
          lexicalBasis: `Cover page text: "${rawText}"`,
        },
      };
    }


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

    // E. Check Candidate Instructions Context (e.g. Cover page or instructions section)
    if (context?.instructionNodeIds?.has(node.nodeId)) {
      return {
        nodeId: node.nodeId,
        tokenType: 'INSTRUCTION_NUMBER',
        rawLabel: rawText,
        confidence: 0.99,
        evidence: {
          spatialLocationBasis: `Within candidate instructions directive at y=${bbox.y0.toFixed(1)} pt`,
          typographicBasis: 'Instruction enumeration bullet',
          lexicalBasis: `Candidate instructions: "${rawText}"`,
        },
      };
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

    // 3b. Check for Section Header / Question Range (e.g. "Q.1 - Q.5 Carry ONE mark Each", "Questions 1 to 5")
    if (
      /(?:q(?:uestion)?s?\.?\s*\d+\s*(?:-|to|–)\s*q(?:uestion)?s?\.?\s*\d+|carry\s+(?:one|two|\d+)\s+marks?)/i.test(
        rawText
      )
    ) {
      return {
        nodeId: node.nodeId,
        tokenType: 'SECTION_NUMBER',
        rawLabel: rawText,
        confidence: 0.95,
        evidence: {
          spatialLocationBasis: `Header location at y=[${bbox.y0.toFixed(1)}, ${bbox.y1.toFixed(1)}] pt`,
          typographicBasis: 'Range/marks instruction header',
          lexicalBasis: `Section header range pattern: "${rawText}"`,
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
    const cleanForOption = rawText.replace(/~+/g, ' ').trim();
    const optionPrefixMatch = cleanForOption.match(/^(\(?([A-Ea-e]|[1-4]|[ivx]+)\)?[\.\)])(?:\s+|$)/i);
    if (optionPrefixMatch && !rawText.match(/^q(?:uestion)?/i)) {
      const markerLetterOrNum = optionPrefixMatch[2];
      const isLetterOption = /^[A-Ea-e]$/.test(markerLetterOrNum);
      const isRomanOption = /^[ivx]+$/i.test(markerLetterOrNum);
      const optNum = parseInt(markerLetterOrNum, 10);

      // If it's Roman (i-iv), it is ALWAYS a statement bullet or matching sub-clause, NOT an option
      if (isRomanOption) {
        return {
          nodeId: node.nodeId,
          tokenType: 'STATEMENT_NUMBER',
          rawLabel: rawText,
          confidence: 0.95,
          evidence: {
            spatialLocationBasis: `Located at x=${bbox.x0.toFixed(1)}, y=${bbox.y0.toFixed(1)} pt`,
            typographicBasis: `Roman numeral statement enumeration bullet`,
            lexicalBasis: `Roman statement marker: "${optionPrefixMatch[1]}"`,
          },
        };
      }

      // If it's a letter (A-E), it's an option marker
      if (isLetterOption) {
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

      const isIndented = activeQuestionAnchorX !== undefined && bbox.x0 >= activeQuestionAnchorX + 12.0;

      // Check if this bare 1-4 token is actually an initial, sequential, or facing-page question number at the margin
      const isFacingPageRestart =
        previousPageFirstQuestionNumber !== undefined &&
        optNum === previousPageFirstQuestionNumber &&
        pageFirstQuestionNumber === undefined &&
        bbox.y0 <= 250.0;

      const isInitialOnPage =
        pageFirstQuestionNumber === undefined &&
        !isIndented &&
        bbox.y0 <= 250.0 &&
        optNum >= 1 &&
        optNum <= 200;

      const isSequentialQuestion =
        !isIndented &&
        !previousQuestionHasExplicitPrefix &&
        isLeftEdge && !isTopMargin && !isBottomMargin &&
        ((previousQuestionNumber === undefined && optNum === 1) ||
         (previousQuestionNumber !== undefined && optNum === previousQuestionNumber + 1) ||
         isInitialOnPage ||
         isFacingPageRestart);

      if (isSequentialQuestion) {
        return {
          nodeId: node.nodeId,
          tokenType: 'QUESTION_NUMBER',
          detectedNumber: optNum,
          rawLabel: `${optNum}.`,
          confidence: 0.92,
          evidence: {
            spatialLocationBasis: `Left margin at x=${bbox.x0.toFixed(1)} pt`,
            typographicBasis: `Leading numeric bullet`,
            lexicalBasis: `Sequential question numbering: ${optNum}`,
            sequenceBasis: previousQuestionNumber !== undefined
              ? `Follows Q.${previousQuestionNumber}`
              : `First question on page`,
          },
        };
      }

      // In documents with bare question numbers (e.g. "1.", "2."), options are lettered (a-d).
      // Any 1-4 under an active bare question is a statement bullet, NOT an option.
      // But in documents with explicit question prefixes (e.g. "Q.1", "Q.2"), bare 1-4 ARE the options!
      if (!previousQuestionHasExplicitPrefix && optNum >= 1 && optNum <= 4) {
        return {
          nodeId: node.nodeId,
          tokenType: 'STATEMENT_NUMBER',
          rawLabel: rawText,
          confidence: 0.95,
          evidence: {
            spatialLocationBasis: `Located under bare-numbered Q.${previousQuestionNumber} at y=${bbox.y0.toFixed(1)} pt`,
            typographicBasis: 'Statement enumeration bullet in bare-numbered exam',
            lexicalBasis: `Statement numbering under active question: "${rawText}"`,
          },
        };
      }

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

    // Case B: Bare number question (e.g. "1.", "2.", "25.", or legacy font digit "s." for 8)
    if (!previousQuestionHasExplicitPrefix && isLeftEdge && !isTopMargin && !isBottomMargin) {
      let candidateText = rawText.trim();
      // Map Kruti Dev leading tilde before digit to 1 (e.g. "~7." -> "17.")
      if (/^~[0-9]/.test(candidateText)) {
        candidateText = '1' + candidateText.slice(1);
      }
      // Strip font decoration artifacts like leading \l, ~, |, etc. and trailing T, ~, etc.
      const cleaned = candidateText
        .replace(/^[^0-9sS]+/, '')
        .replace(/[^0-9sS\.\)]+$/, '');


      const bareNumMatch = cleaned.match(/^(\d{1,4}|s)[\.\)]?$/i) || rawText.match(/^(\d{1,4}|s)[\.\)](?:\s+.*)?$/i);
      if (bareNumMatch) {
        const rawDigit = bareNumMatch[1].toLowerCase();
        const num = rawDigit === 's' ? 8 : parseInt(rawDigit, 10);
        const isIndented = activeQuestionAnchorX !== undefined && bbox.x0 >= activeQuestionAnchorX + 12.0;

        if (isIndented) {
          return {
            nodeId: node.nodeId,
            tokenType: 'STATEMENT_NUMBER',
            rawLabel: `${bareNumMatch[1]}.`,
            confidence: 0.95,
            evidence: {
              spatialLocationBasis: `Indented by ${(bbox.x0 - activeQuestionAnchorX!).toFixed(1)} pt from question anchor`,
              typographicBasis: 'Indented statement bullet',
              lexicalBasis: `Statement numbering: ${num}`,
            },
          };
        }

        const hasExplicitPunctuation =
          /[.\)]/.test(candidateText) || /[.\)]/.test(rawText);

        const isFacingPageRestart =
          previousPageFirstQuestionNumber !== undefined &&
          num === previousPageFirstQuestionNumber &&
          pageFirstQuestionNumber === undefined &&
          bbox.y0 <= 250.0 &&
          isLeftEdge && !isTopMargin && !isBottomMargin;

        const isInitialOnPage =
          pageFirstQuestionNumber === undefined &&
          !isIndented &&
          hasExplicitPunctuation &&
          isLeftEdge && !isTopMargin && !isBottomMargin &&
          bbox.y0 <= 250.0 &&
          num >= 1 &&
          num <= 200;

        const isSequential =
          (isLeftEdge && !isTopMargin && !isBottomMargin && (
            (previousQuestionNumber === undefined && num === 1) ||
            (previousQuestionNumber !== undefined && (
              num === previousQuestionNumber + 1 ||
              (num === previousQuestionNumber + 2 && !isIndented) ||
              (num === previousQuestionNumber && bbox.y0 <= 120.0)
            ))
          )) ||
          isInitialOnPage ||
          isFacingPageRestart;

        if (isSequential) {
          return {
            nodeId: node.nodeId,
            tokenType: 'QUESTION_NUMBER',
            detectedNumber: num,
            rawLabel: `${num}.`,
            confidence: 0.92,
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
