# MOCK.AI — SSC CHSL Importer: Current Architecture & Forensic Audit Report
**Document ID:** `docs/CHSL_IMPORTER_CURRENT_ARCHITECTURE.md`  
**System:** MOCK.AI Universal Paper Ingestion Engine  
**Author:** Antigravity Teamwork Architecture & Forensics Group (Agents 1–13)  
**Date:** October 2026  
**Status:** PHASE 0 COMPLETE — READ-ONLY FORENSIC BASELINE

---

## Executive Summary

This document establishes the authoritative forensic baseline of the current SSC CHSL ingestion pipeline (`scripts/universal_chsl_importer.py`) and its interactions with canonical data models, storage assets, and browser rendering engines.

The current importer successfully demonstrates several key capabilities—notably cross-page block extraction, green-tick pixel saturation analysis for CBT answer-key extraction, and single-ownership assertions between question stems and option images. However, it relies heavily on heuristic shortcuts, destructive string replacements (e.g. `cosecA = 22 → 2√2`, `'|' → '1'`), unproven verification states, and hardcoded four-option assumptions that compromise long-term source fidelity and universal exam extensibility.

This audit details:
1. The end-to-end data flow and call graph.
2. The 8 mandatory evaluation criteria (Correct, Unsafe, Duplicated, Heuristic-Only, Source-Verified, Inferred, Presentation-Only, Redesign Required).
3. Detailed functional matrix of every routine in `universal_chsl_importer.py`.
4. Teamwork agent organization across the 13 specialized roles.
5. The phase-by-phase implementation roadmap for the **Universal CHSL Source-Fidelity Engine v3**.

---

## 1. End-to-End Data Flow & Call Graph

```
                           SOURCE PDF (TCS iON Response Sheet)
                                         │
                                         ▼ [PyMuPDF / fitz.open]
                           ┌───────────────────────────────┐
                           │   Preamble Header & Metadata  │
                           │   (Date, Shift, Tier, col_bound)│
                           └─────────────┬─────────────────┘
                                         │
                       ┌─────────────────┴─────────────────┐
                       ▼                                   ▼
         ┌───────────────────────────┐       ┌───────────────────────────┐
         │     Page Text Blocks      │       │     Page Image XObjects   │
         │  (all_blocks with (p, y)) │       │ (all_images & all_ticks)  │
         └─────────────┬─────────────┘       └─────────────┬─────────────┘
                       │                                   │
                       │   ┌───────────────────────────┐   │
                       └──►│   Marker Segmentation     │◄──┘
                           │ (Section, Question Q.N)   │
                           └─────────────┬─────────────┘
                                         │
                                         ▼
                           ┌───────────────────────────┐
                           │ Question Slicing Window   │
                           │ [start_pos ... end_pos)   │
                           └─────────────┬─────────────┘
                                         │
                 ┌───────────────────────┼───────────────────────┐
                 ▼                       ▼                       ▼
    ┌─────────────────────────┐ ┌─────────────────┐ ┌─────────────────────────┐
    │  Text Prompt & Ans Pos  │ │  Stem vs Option │ │ Green Tick Matching     │
    │  clean_watermarks()     │ │  Geometric      │ │ (RGB pixel saturation   │
    │  Stem strip demotion    │ │  Classifier     │ │  distance to option)    │
    └────────────┬────────────┘ └────────┬────────┘ └────────────┬────────────┘
                 │                       │                       │
                 └───────────────────────┼───────────────────────┘
                                         ▼
                           ┌───────────────────────────┐
                           │ Robust Chip OCR & Math    │
                           │ (PSM 6/7, Stacked Fracs)  │
                           └─────────────┬─────────────┘
                                         │
                                         ▼
                           ┌───────────────────────────┐
                           │ Option Promotion Engine   │
                           │ (Promote Math vs Images)  │
                           └─────────────┬─────────────┘
                                         │
                                         ▼
                           ┌───────────────────────────┐
                           │ Single-Ownership Assert   │
                           │ Assets_stem ∩ Assets_opt=∅│
                           └─────────────┬─────────────┘
                                         │
                                         ▼
                           ┌───────────────────────────┐
                           │ JSON Generation & Storage │
                           │ web/src/data/exams/*.json │
                           └─────────────┬─────────────┘
                                         │
                                         ▼
                           ┌───────────────────────────┐
                           │ Web Application Player    │
                           │ CompetitiveExamPlayer     │
                           │ StructuredContentRenderer │
                           └───────────────────────────┘
```

---

## 2. Forensic Evaluation against 8 Mandatory Criteria

### 2.1 What is Already Correct
1. **Cross-Page Stream Architecture:** PyMuPDF iterates across the entire document sequentially, collecting blocks and images with global coordinates `(page_index, y0)`. This gracefully handles questions and answer blocks that cross physical page breaks.
2. **Pixel-Color Tick Detection Principle:** Detecting official answer keys via RGB green-channel saturation (`G > 120 and G > R + 30 and G > B + 30` with `saturation_ratio > 0.25`) accurately isolates genuine TCS iON checkmarks from monochromatic radio buttons or red crosses.
3. **Single-Ownership Guarantee:** The assertion `assert stem_asset_urls.isdisjoint(opt_asset_urls)` guarantees that no image is simultaneously categorized as both a question diagram and an option choice.
4. **Fraction & Mixed Fraction OCR Architecture:** Slicing images along horizontal white gaps and detecting black horizontal fraction bars enables robust reconstruction of stacked fractions without requiring cloud OCR.
5. **Prompt-Figure Separation:** Splitting question instructions (e.g. "Select the mirror image...") from geometric figures when separated by a clear horizontal blank gap prevents text duplication between the stem and the diagram image.

### 2.2 What is Unsafe
1. **Destructive String Mutation Without Evidence:**
   - `re.sub(r'\bcosecA\s*=\s*22\b', r'cosecA = 2√2', cleaned)`: A hardcoded question-specific regex. If a genuine question actually involves `cosecA = 22`, it is silently corrupted.
   - `re.sub(r'\bZ([A-D])\s*=\s*(\d+)', r'∠\1 = \2', cleaned)`: Blanket replacement of uppercase `Z` followed by letter with angle symbol `∠`.
   - `if t in ['|', 'l', '!']: t = '1'`: Blanket substitution without verifying whether the source item was an isolated reasoning symbol, roman numeral, or delimiter.
   - `if t == '/': t = '7'`: Destructive single-character guess without coordinate or stroke validation.
   - `re.sub(r'^2(\d{2,3}(?:,\d{2,3})+)', r'₹\1', t)`: Blanket substitution of leading '2' with rupee symbol '₹'.
2. **Silent Loss of Raw Source Evidence:**
   When an image is demoted to text or OCR is performed, the raw extraction is overwritten in place. Neither the raw text, the source bounding box, nor the original uncropped image is preserved in the output object.
3. **False VERIFIED State Generation:**
   The verification flag is set to `VERIFIED` solely based on:
   ```python
   v_status = "REVIEW_REQUIRED" if (has_empty_option or has_no_stem) else "VERIFIED"
   ```
   A question with badly corrupted OCR, hallucinated math, unvalidated answer key, or broken images is marked `VERIFIED`, providing false confidence.
4. **Lack of Bounding Box Provenance:**
   Blocks and assets lack `sourceBBox: {x, y, width, height}` and `sourcePage`. It is impossible for an auditor to forensically locate the exact region on the PDF page that produced the block.

### 2.3 What is Duplicated
1. **Option Values in Multiple Formats:**
   Each question stores both `options: string[]` and `richOptions: CanonicalOption[]`. In `IMAGE_ONLY` mode, `options` contains empty strings `["", "", "", ""]` while `richOptions` contains image metadata and `ocrText`. This causes confusion in downstream consumers and requires duplicate checks.
2. **Diagram URL Fields:**
   A single question contains `diagramUrl`, `diagramUrls`, `questionAssets`, and `contentBlocks[type='image']`. All four point to the same asset, creating multiple competing rendering sources.
3. **Competing Ingestion Scripts:**
   The repository contains `universal_chsl_importer.py`, `ingest_all_chsl_2024.py`, `ingest_all_chsl_2023.py`, `ingest_chsl_2025.py`, and `tier2_importer.py`, which have differing heuristics and contradictory quality standards.

### 2.4 What is Heuristic-Only
1. **Text Strip Demotion Conditions:**
   ```python
   if not has_visual_kw and len(ocr_stem) >= 12 and (h <= 140 or aspect >= 3.5):
       is_text_strip = True
   ```
   Aspect ratio $\ge 3.5$ or height $\le 140$ is insufficient to prove that an image is pure text. Number lines, timeline charts, and horizontal resistor networks satisfy these geometric criteria and risk being destroyed or OCR-mangled.
2. **Keyword Blacklisting:**
   Visual reasoning detection depends on keyword strings (`'mirror image'`, `'paper is folded'`, `'dice'`, etc.). Any visual question that omits these exact keywords (e.g. a circuit diagram, geometry triangle without keyword, or physics apparatus) risks improper demotion.
3. **Option Slot Nearest-Neighbor Distance:**
   Matching ticks to options uses a flat Euclidean distance formula:
   ```python
   dist = abs(ref_pos[0] - t_pos[0]) * 10000 + abs(ref_pos[1] - t_pos[1])
   ```
   If an option text block is misaligned or missing, a tick can easily latch onto an adjacent question's option slot without triggering a geometric boundary fault.

### 2.5 What is Source-Verified
1. **Exact Vector Text from PDF Streams:** Blocks extracted directly by `page.get_text('blocks')` accurately represent the author's encoded character stream.
2. **XObject Dimensions and Pixel Payloads:** Width, height, and raw raster bytes retrieved from PyMuPDF XObjects are 100% faithful to the source document.
3. **RGB Green Channel Dominance:** The chromatic signature of the green tick icon in TCS iON CBT response sheets has been empirically validated against authentic PDFs.

### 2.6 What is Inferred
1. **Section Boundaries:** Sections are inferred from string presence `'Section :'`. In some response sheets where the section header is missing or watermarked, the importer continues assigning questions to the preceding section without warning.
2. **Question Types:** All questions are inferred to be MCQ with 4 options and standard $+2.0 / -0.5$ marks, without examining whether the section contains NAT, MSQ, or Tier 2 scoring (+3.0 / -1.0).
3. **Question Numbering:** `overall_q_num` is an incrementing counter (`overall_q_num += 1`) rather than the source-declared `Q.N` printed on the paper. If a question is missed, all subsequent question numbers shift out of alignment.

### 2.7 What is Stored Only as Presentation Data
1. **KaTeX Strings in Options:** `options: ['$205\\frac{1}{3}$', ...]` stores the LaTeX string intended for KaTeX display, but does not store the raw OCR numerator, denominator, or bounding box.
2. **Display Mode:** `displayMode: 'IMAGE_ONLY'` is a UI hint rather than a semantic property.
3. **Stripped HTML/Entities:** Special characters like degree symbols `°` or quotes are formatted directly for HTML display, losing the underlying source token.

### 2.8 What Must Be Redesigned
1. **Evidence-Based Normalization Architecture (Three-Layer Model):**
   Separate Raw Extraction $\to$ Canonical Normalization $\to$ Source-Verified Representation. Never replace text without a verified evidence trail.
2. **Multi-Signal Content Classifier:**
   Replace the fragile aspect ratio/keyword check with a deterministic classifier evaluating text density, stroke geometry, edge density, and bounding box overlap to classify into:
   `TEXT_ONLY`, `MATH_ONLY`, `TEXT_PLUS_MATH`, `GENUINE_VISUAL`, `TABLE`, `GRAPH`, `CHART`, `CODE`, `DECORATIVE`, `WATERMARK`, `DUPLICATE`, `UNKNOWN`.
3. **First-Class Passage Support:**
   Model reading comprehension passages as independent entities with their own coordinate boundaries, linking sub-questions cleanly without prepending the entire passage text into every sub-question.
4. **Universal N-Option Architecture:**
   Remove all hardcoded 4-option arrays (`[None, None, None, None]`, `['A', 'B', 'C', 'D']`). The universal engine must handle arbitrary option counts, NAT, and MSQ.
5. **Asset Lifecycle & Storage Integrity Engine:**
   Implement formal asset lifecycle states (`EXTRACTED`, `CLASSIFIED`, `VALIDATED`, `ATTACHED`, `PUBLISHED`, `DUPLICATE`, `ORPHAN`, `REJECTED`). Support non-destructive dry-run audits before file operations.
6. **Strict Quality Gate & Honest Verification Status:**
   Demote questions with unverified OCR, uncertain answer mapping, or missing assets to `REVIEW_REQUIRED` or `FAILED`.

---

## 3. Detailed Matrix of Existing Functions in `universal_chsl_importer.py`

| Function | Current Logic | Risk / Defect | Redesign Requirement |
| :--- | :--- | :--- | :--- |
| `get_or_save_asset()` | Writes raw image bytes to disk during parsing; returns web URL | Side-effecting during parsing; no dry-run support; creates orphan files on failure | Decouple extraction from persistence; stage assets in memory/manifest first |
| `clean_watermarks()` | Regex stripping of publisher banners, footers, plus hardcoded substitutions (`cosecA = 22`, `ZB = 90°`) | Destructive normalization; corrupts authentic math; lacks provenance | Keep watermark cleaning strictly scoped; move math repair to evidence-based pipeline |
| `clean_option_text()` | Calls `clean_watermarks()` | Inherits watermark regex risks in option contexts | Use option-specific token cleaner |
| `norm_digit_line()` | Replaces characters `S->8, l->1, |->1, Z->2` | Blanket substitutions corrupt algebraic variables (`Z`, `S`, `l`) | Only apply to proven numeric crops with bounding box confirmation |
| `ocr_crop()` | Upscales crop, applies thresholding, runs Tesseract PSM 7/6 | Fixed threshold (165) fails on light grey or anti-aliased text | Dynamic Otsu thresholding with multiple PSM fallbacks |
| `refine_diagram_crop()` | Horizontal projection histogram to separate top text band from figure | Fails when figure has text annotations or complex headers | Use connected components and bounding box geometry |
| `robust_ocr_chip()` | Multi-heuristic fraction parser (PSM 6, horizontal projection, division bar search) | Heuristic thresholds (`h * 0.25`, `best_run >= 8`) fail on non-standard font sizes | Formally validate fraction syntax; output raw components alongside LaTeX |
| `clean_and_normalize_option_text()` | Normalizes currency, units, isolated pipes (`|->1`), ratios | Over-eager substitutions; converts `/` to `7` unconditionally | Retain raw string; require adjacent token context for substitutions |
| `is_promotable_option_text()` | Whitelist matching for numbers, currency, single letters, LaTeX | High risk of false positives promoting simple diagram elements | Multi-signal verification before image promotion |
| `get_shift_info()` | Regex matching on filename and preamble header | Regex misses edge-case time formats | Standardized datetime parser with fallback |
| `get_date_info()` | Matches test date from header or filename | Fragile date parsing across non-standard formats | Universal ISO-8601 date extractor |
| `parse_tcs_ion_cbt()` | Monolithic 700-line function doing extraction, OCR, classification, asset saving, JSON export | Violates Single Responsibility Principle; tightly couples PDF reading to file writes | Modularize into discrete pipeline stages (Geometry, OCR, Classifier, Assembler) |

---

## 4. Teamwork Agent Organization (Agents 1–13)

To ensure strict engineering governance, the work is partitioned across 13 specialized agent domains:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      AGENT 1 — ORCHESTRATOR                            │
│           System Architecture, Cross-Module Integration, Master Plan   │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
    ┌───────────────┴───────────────┐┌───────────────┴───────────────┐
    │       INGESTION & SOURCE      ││      DATA MODEL & STORAGE     │
    │ AGENT 2: Importer Forensics   ││ AGENT 6: Asset Engine         │
    │ AGENT 3: Source Geometry      ││ AGENT 8: Canonical Data Model │
    │ AGENT 7: Answer Key Engine    ││ AGENT 9: Player / Renderer    │
    └───────────────┬───────────────┘└───────────────┬───────────────┘
                    │                                │
    ┌───────────────┴───────────────┐┌───────────────┴───────────────┐
    │     CONTENT CLASSIFICATION    ││     VERIFICATION & QUALITY    │
    │ AGENT 4: Math Engine          ││ AGENT 10: SSC Corpus Audit    │
    │ AGENT 5: Content Classifier   ││ AGENT 11: Regression Guardian │
    │                               ││ AGENT 12: Challenger Agent    │
    │                               ││ AGENT 13: Success Auditor     │
    └───────────────────────────────┘└───────────────────────────────┘
```

### Detailed Agent Responsibilities:
1. **AGENT 1 — ORCHESTRATOR:** Owns the universal architecture, execution stages, and integration across all agents.
2. **AGENT 2 — IMPORTER FORENSICS:** Deep-dives into parser bottlenecks, exception handling, and PyMuPDF low-level bindings.
3. **AGENT 3 — SOURCE GEOMETRY:** Owns physical bounding boxes, reading order, cross-page stitching, and question boundaries.
4. **AGENT 4 — MATH ENGINE:** Owns LaTeX reconstruction, stacked fractions, algebraic expressions, radicals, KaTeX syntax validation.
5. **AGENT 5 — CONTENT CLASSIFIER:** Owns deterministic classification (`TEXT`, `MATH`, `IMAGE`, `TABLE`, `CHART`, etc.).
6. **AGENT 6 — ASSET ENGINE:** Owns image deduplication (SHA-256/perceptual), asset lifecycle, dry-run cleanup, and storage sync.
7. **AGENT 7 — ANSWER KEY:** Owns green-tick geometry, RGB saturation verification, and 1-to-1 answer integrity matrices.
8. **AGENT 8 — DATA MODEL:** Owns `CanonicalQuestion`, `CanonicalContentBlock`, and provenance metadata schemas.
9. **AGENT 9 — PLAYER / RENDERER:** Ensures clean single-path rendering in `CompetitiveExamPlayerScreen` and `StructuredContentRenderer`.
10. **AGENT 10 — SSC CORPUS:** Executes the mass audit and safe reprocessing across all 208 SSC CHSL exam papers (2019–2025).
11. **AGENT 11 — REGRESSION GUARDIAN:** Protects the 76 GATE papers (5,344 questions) and ensures zero regressions on existing suites.
12. **AGENT 12 — CHALLENGER:** Adversarially attacks the new pipeline with edge cases (missing stems, corrupted fractions, phantom ticks).
13. **AGENT 13 — SUCCESS AUDITOR:** Independently certifies the final implementation against the forensic criteria.

---

## 5. Implementation Roadmap (Phases 1 to 12)

- **Phase 0:** Read-Only Forensic Audit & Architecture Baseline *(Completed in this document)*.
- **Phase 1:** Core Pipeline Architecture Refactor (Modularize `scripts/universal_chsl_importer.py` into decoupled services).
- **Phase 2:** Multi-Signal Content Classifier & Evidence-Based Normalizer implementation.
- **Phase 3:** Dedicated Math Reconstruction & KaTeX Validator.
- **Phase 4:** Answer-Key Integrity Matrix & Bounding Box Geometric Linker.
- **Phase 5:** Asset Lifecycle Management & Dry-Run Asset Audit Tooling (`scripts/audit_exam_assets.py`).
- **Phase 6:** Frontend Canonical Rendering Alignment (Single authoritative rendering path).
- **Phase 7:** Unit & Source-Fixture Test Pyramid (Levels 1–7).
- **Phase 8:** GATE 2024/2025 Zero-Regression Verification.
- **Phase 9:** SSC Corpus Full Impact Audit & Batch Reprocessing (2019–2025).
- **Phase 10:** Safe Asset Cleanup Dry-Run & Reconciliation.
- **Phase 11:** Adversarial Challenger Attack & Edge-Case Probes.
- **Phase 12:** Final Independent Success Certification & Documentation Publication.
