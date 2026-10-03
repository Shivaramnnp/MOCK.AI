# MOCK.AI — Universal CHSL Source-Fidelity Engine v3 Architecture
**Document ID:** `docs/CHSL_IMPORTER_V3_ARCHITECTURE.md`  
**System:** MOCK.AI Universal Paper Ingestion Engine  
**Version:** 3.0.0-PROD  
**Author:** Antigravity Teamwork Architecture & Forensics Group (Agents 1–13)  
**Date:** October 2026  
**Status:** ARCHITECTURE DESIGN SPECIFICATION

---

## 1. Architectural Philosophy: The Source is Authoritative

The Universal CHSL Source-Fidelity Engine v3 transitions the MOCK.AI ingestion subsystem from a collection of procedural heuristics into a deterministic, provenance-aware, source-fidelity engine.

### Non-Negotiable Core Tenets:
1. **The Source Document is the Ultimate Source of Truth:**
   Content must never be invented, guessed, or inferred from context. If a stroke, symbol, or answer cannot be proven from source evidence, it must be flagged as `REVIEW_REQUIRED`.
2. **Normalization $\ne$ Correction:**
   Normalizing whitespace, unicode homoglyphs, or LaTeX delimiters is permissible; replacing unreadable text with guessed values (e.g. `cosecA = 22 → 2√2` or `'|' → '1'`) without provenance is strictly prohibited.
3. **Three-Layer Semantic Representation:**
   Every extracted element must maintain:
   - **Layer A (Raw Source):** Exactly what PyMuPDF or Tesseract extracted, with physical page and coordinates.
   - **Layer B (Canonical Normalized):** Deterministically normalized representation.
   - **Layer C (Verified Provenance):** Validated against multi-signal source evidence or flagged for human review.
4. **Decoupled Architecture:**
   PDF extraction, content classification, mathematical reconstruction, asset lifecycle, and persistence are strictly decoupled into independent, testable modules.

---

## 2. End-to-End Pipeline Architecture

```
                    ┌─────────────────────────────────────────┐
                    │      Source PDF / Exam Response Sheet   │
                    └────────────────────┬────────────────────┘
                                         │
                                         ▼
                    ┌─────────────────────────────────────────┐
                    │   STAGE 1: Source & Geometry Ingestion  │
                    │   - PyMuPDF cross-page stream parser    │
                    │   - Reading-order sorting & bboxes      │
                    │   - Metadata & column anchor detection  │
                    └────────────────────┬────────────────────┘
                                         │
                                         ▼
                    ┌─────────────────────────────────────────┐
                    │   STAGE 2: Question & Passage Slicing   │
                    │   - Geometry-aware question markers     │
                    │   - First-class passage grouping        │
                    │   - Cross-page window boundaries        │
                    └────────────────────┬────────────────────┘
                                         │
                                         ▼
                    ┌─────────────────────────────────────────┐
                    │   STAGE 3: Multi-Signal Classification  │
                    │   - Text vs Math vs Image vs Table      │
                    │   - Aspect ratio, density, stroke hist  │
                    │   - Genuine visual preservation         │
                    └────────────────────┬────────────────────┘
                                         │
                                         ▼
                    ┌─────────────────────────────────────────┐
                    │   STAGE 4: Evidence-Based Normalization │
                    │   - KaTeX syntax validation             │
                    │   - Stacked & mixed fraction engine     │
                    │   - Provenance-preserving token repair  │
                    └────────────────────┬────────────────────┘
                                         │
                                         ▼
                    ┌─────────────────────────────────────────┐
                    │   STAGE 5: Answer Key & Asset Integrity │
                    │   - RGB green-tick coordinate matcher   │
                    │   - 1-to-1 answer integrity matrix      │
                    │   - Single-ownership assertion          │
                    │   - Asset lifecycle & dry-run inventory │
                    └────────────────────┬────────────────────┘
                                         │
                                         ▼
                    ┌─────────────────────────────────────────┐
                    │   STAGE 6: Quality Gate & Persistence   │
                    │   - Schema & structural validation      │
                    │   - Honest status: VERIFIED / REVIEW    │
                    │   - Output: CanonicalQuestion JSON      │
                    └─────────────────────────────────────────┘
```

---

## 3. Modular System Decomposition

The v3 architecture replaces the monolithic script with decoupled, single-responsibility modules:

### 3.1 `SourceGeometryEngine`
- **Responsibility:** Extracts page text blocks, vector drawings, and embedded raster images using PyMuPDF.
- **Key Guarantee:** Normalizes all coordinates into global physical page space `(pageIndex, x0, y0, x1, y1)`.
- **Anchor Detection:** Computes the dynamic selection column boundary `col_bound` by analyzing the distribution of `Ans` blocks and radio buttons across the first 10 pages.

### 3.2 `PassageEngine`
- **Responsibility:** Models reading comprehension, cloze tests, and shared data interpretation contexts as first-class `Passage` entities.
- **Contract:**
  ```typescript
  interface PassageGroup {
    passageId: string;
    passageText: string;
    contentBlocks: CanonicalContentBlock[];
    sourcePageStart: number;
    sourcePageEnd: number;
    sourceBBoxes: BoundingBox[];
    subQuestionNumbers: number[];
  }
  ```
- **Guarantee:** Passages are linked by reference rather than duplicating the entire text inside every sub-question stem.

### 3.3 `MultiSignalClassifier`
- **Responsibility:** Classifies every extracted image or crop region into a concrete semantic category:
  - `TEXT_ONLY`
  - `MATH_ONLY`
  - `TEXT_PLUS_MATH`
  - `GENUINE_VISUAL`
  - `TABLE`
  - `GRAPH`
  - `CHART`
  - `CODE`
  - `DECORATIVE`
  - `WATERMARK`
  - `DUPLICATE`
  - `UNKNOWN`
- **Signals Evaluated:**
  1. PDF vector text overlap (is text already present in the PDF text layer?).
  2. Aspect ratio and absolute pixel dimensions.
  3. Connected components and stroke stroke-width variance.
  4. OCR character confidence and dictionary readability.
  5. Horizontal projection gap structure.
  6. Question and option contextual semantics.

### 3.4 `EvidenceBasedNormalizer & MathEngine`
- **Responsibility:** Normalizes mathematics, fractions, and symbols with mathematical proof and provenance.
- **Pipeline:**
  1. Identifies stacked horizontal division bars via vertical projection analysis.
  2. OCRs numerator and denominator independently with high-resolution Lanczos scaling.
  3. Validates that the denominator is non-zero and mathematically sound.
  4. Generates standard KaTeX syntax (e.g. `\frac{a}{b}`).
  5. Validates syntax against KaTeX parser before emission.
  6. Preserves the raw extracted tokens in block metadata.

### 3.5 `AnswerKeyEngine`
- **Responsibility:** Determines official answer keys with 100% geometric binding.
- **Algorithm:**
  1. Scans selection column ($x < col\_bound$) for green checkmark icons.
  2. Computes chromatic saturation: $G > 120$ and $G - R > 30$ and $G - B > 30$.
  3. Associates each tick with the enclosing question window $[start\_pos, end\_pos)$.
  4. Verifies that exactly one valid checkmark exists per question.
  5. Matches tick coordinate vertically to the closest candidate option box:
     $$dist = |y_{tick} - y_{option}|$$
  6. Validates that $dist \le 35\text{ pt}$ (strict geometric proximity). If out of bounds, marks answer `UNRESOLVED` and sets question status to `REVIEW_REQUIRED`.

### 3.6 `AssetLifecycleManager`
- **Responsibility:** Manages all image files, deduplication, perceptual hashing, and storage staging.
- **States:**
  `EXTRACTED` $\to$ `CLASSIFIED` $\to$ `VALIDATED` $\to$ `ATTACHED` $\to$ `PUBLISHED`.
- **Deduplication:** Computes SHA-256 for bit-exact identity and pHash for perceptual similarity. Reuses canonical assets when bit-identical.
- **Dry-Run Support:** Supports audit and deletion simulation without modifying disk or database state.

---

## 4. Universal Data Contracts & Canonical Schema

The engine outputs data adhering to the project's canonical data model (`web/src/types/canonicalQuestion.ts`):

```typescript
export interface CanonicalQuestion {
  questionId: string;
  sourceId: string;
  sourceType: InputSourceType;
  questionNumber: number;
  sectionId?: string;
  sectionName?: string;
  questionText: string;
  contentBlocks: CanonicalContentBlock[];
  questionType: QuestionType; // MCQ | MSQ | NAT | MATCHING | etc.
  options: CanonicalOption[];
  answer: CanonicalAnswer;
  scoring: CanonicalScoring;
  provenance: CanonicalProvenance;
  assets: CanonicalAsset[];
  explanation: string;
  verificationStatus: VerificationStatus; // VERIFIED | PARTIAL | REVIEW_REQUIRED | FAILED
  verificationReasons: string[];
  confidence: CanonicalConfidence;
  createdAt: number;
  updatedAt: number;
}
```

### Universal Option Flexibility (N-Options)
The engine does not hardcode 4 options. Options are parsed as an arbitrary-length array `CanonicalOption[]`, supporting 2-choice True/False, 3-choice, 4-choice, 5-choice, and numerical/NAT answer types without structural alterations.

---

## 5. Quality Gate & Honest Verification Status

A question is marked `VERIFIED` **only** when all of the following conditions are met:
1. `stem`: Stem contains valid non-empty text, or has a verified genuine visual diagram.
2. `options`: For MCQ, all options have valid text or valid image assets.
3. `answerKey`: Official answer is uniquely identified with confidence $\ge 0.95$.
4. `math`: Any LaTeX math block parses successfully without syntax errors.
5. `assets`: Every referenced asset exists on disk, has non-zero size, and passes MIME validation.

If any check fails, the question is honestly marked:
- `PARTIAL`: Content readable, but minor non-blocking discrepancy exists.
- `REVIEW_REQUIRED`: Answer key ambiguous, math unverified, or asset missing.
- `FAILED`: Critical failure preventing exam participation.

---

## 6. Regression Protection (GATE 2024 / 2025 Baseline)

The universal engine maintains strict regression isolation:
- All shared algorithms must pass the existing Vitest suite (`733/733 tests passed`).
- GATE 2025 datasets (`76 papers`, `5,344 questions`) serve as the protected baseline.
- Mathematical tokens used in GATE (such as vector absolute values $|y| \le 1$, inner products, and conditional probabilities) must never be corrupted by SSC normalization rules.
