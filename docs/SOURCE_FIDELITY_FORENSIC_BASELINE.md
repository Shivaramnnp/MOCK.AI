# MOCK.AI — Universal Source-Fidelity Forensic Baseline
## Comprehensive Forensic Root-Cause Analysis across SSC CHSL 2024 Corpus
**Author:** Antigravity Forensic Engineering  
**Baseline Date:** October 2, 2026  
**Status:** CERTIFIED FORENSIC BASELINE  

---

## 1. Executive Summary & Objective

Following manual browser verification of the active CBT player on official SSC CHSL 2024 papers (specifically 01 Jul Shift 1 and 01 Jul Shift 2), 23 distinct user-visible defects were documented via browser screenshots located at `/Users/shivarampatel/Desktop/untitled folder 3/`.

The primary mission is:
1. **Never patch individual questions** (`if q_num == ...` or `if paper == ...` strictly forbidden).
2. **Fix the producing algorithm** so that content classification (`TEXT` vs `LATEX / MATH` vs `IMAGE` vs `MIXED`) is deterministic, exam-agnostic, and permanent.
3. **Reconstruct mathematical fractions and mixed fractions** into standard KaTeX LaTeX (`\frac{a}{b}`, `$W\frac{a}{b}\text{ units}$`) rather than rendering low-resolution raster image cutouts.
4. **Promote plain-text options** (numbers with commas `87,000`, unit variations `94.66 km/hr`, word-pair analogies `Cow — Buffalo`, `Foot : Ankle`, mixed-case code words `gc`, `fp`, `mZ`, `Ze`) to native text options.
5. **Eliminate duplicate prompt text** in diagram crops where question prompt text was baked into the figure crop as well as duplicated in `questionText`.
6. **Audit and safely purge unreferenced/orphaned raster image assets** from disk and database (over 3,100 orphaned PNGs identified).

---

## 2. Exhaustive Screenshot Forensic Mapping (All 23 Cases)

| Screenshot | Paper | Q# | Source Content | Previous Failure Mode | Target Canonical Model |
|---|---|---|---|---|---|
| **01** | 01 Jul S1 | Q30 | Cube net problem figure | Prompt text duplicated in diagram crop & text | Crop diagram to cube net only; text prompt in `questionText` |
| **02** | 01 Jul S1 | Q32 | Figure series replacement | Prompt text duplicated in diagram crop & text | Clean diagram crop containing only problem figures |
| **03** | 01 Jul S1 | Q34 | Mirror image: `RTYZXC57` at MN | Prompt text duplicated above figure in diagram | Crop diagram to figure & MN mirror; prompt in `questionText` |
| **04** | 01 Jul S1 | Q38 | Opposite side of 'Y' on folded sheet | Prompt text duplicated in diagram crop | Clean diagram crop containing only sheet net |
| **05** | 01 Jul S1 | Q47 | Dice faces 1, 3, 5, 6, 7, 8 | Prompt text duplicated in diagram crop | Clean diagram crop containing only dice views |
| **06** | 01 Jul S1 | Q52 | Mixed fractions: $42\frac{1}{2}$, $42\frac{1}{7}$, $42$, $42\frac{6}{7}\text{ km/h}$ | Rendered as 4 raster PNG images | Reconstruct to LaTeX: `$42\frac{1}{2}\text{ km/h}$`, `$42\frac{1}{7}\text{ km/h}$` |
| **07** | 01 Jul S1 | Q53 | Fractions: $\frac{1728}{125}$, $\frac{125}{1728}$, $\frac{27}{8000}$, $\frac{3375}{8000}$ | Broken OCR text `['—', 'ir', '3000', '3375']` | Reconstruct to LaTeX: `$\frac{1728}{125}$`, `$\frac{125}{1728}$`, `$\frac{27}{8000}$` |
| **08** | 01 Jul S1 | Q62 | Dual pie-charts (Students & Girls enrolled) | Entire prompt text baked inside diagram crop & in text | Self-contained visual chart with clean prompt handling |
| **09** | 01 Jul S1 | Q66 | Mixed fractions: $205\frac{1}{3}$, $1707\frac{1}{3}$, $1437\frac{1}{3}$, $1600\frac{1}{3}$ | Rendered as 4 raster PNG images | Reconstruct to LaTeX: `$205\frac{1}{3}\text{ cm}^3$`, `$1707\frac{1}{3}\text{ cm}^3$` |
| **10** | 01 Jul S1 | Q68 | Mixed fractions: $16\frac{7}{26}$, $17\frac{8}{26}$, $11\frac{5}{26}$, $11\frac{9}{26}$ | Rendered as 4 raster PNG images | Reconstruct to LaTeX: `$16\frac{7}{26}\text{ km}$`, `$17\frac{8}{26}\text{ km}$` |
| **11** | 01 Jul S1 | Q72 | Graduation progress pie-chart | Pie slice labels leaked as garbled OCR in stem text | Pure visual chart asset; zero garbled OCR label leakage |
| **12** | 01 Jul S1 | Q73 | Percentages with mixed fractions: $28\frac{4}{7}\%$, $31\%$, $24\frac{1}{3}\%$, $26\frac{2}{3}\%$ | Rendered as 4 raster PNG images | Reconstruct to LaTeX: `$28\frac{4}{7}\%$`, `$31\%$`, `$24\frac{1}{3}\%$` |
| **13** | 01 Jul S2 | Q26 | Code words: `gc`, `fp`, `mZ`, `Ze` | Rendered as PNG images (regex required uppercase) | Promoted to clean text: `gc`, `fp`, `mZ`, `Ze` |
| **14** | 01 Jul S2 | Q35 | Word-pair analogies: `Cow — Buffalo`, `Attic — Common` | Rendered as PNG images (em-dash failed isalpha) | Promoted to clean text: `Cow — Buffalo`, `Attic — Common` |
| **15** | 01 Jul S2 | Q36 | Word-pair analogies: `Foot : Ankle`, `Ear : Hair` | Rendered as PNG images (regex required uppercase) | Promoted to clean text: `Foot : Ankle`, `Ear : Hair` |
| **16** | 01 Jul S2 | Q39 | Opposite side of 'K' on folded sheet | Prompt text duplicated in diagram crop | Clean diagram crop containing only sheet net |
| **17** | 01 Jul S2 | Q55 | Currency/numbers with commas: `87,000`, `86,000` | Rendered as PNG images (regex disallowed commas) | Promoted to clean text: `87,000`, `86,000`, `87,500`, `86,500` |
| **18** | 01 Jul S2 | Q60 | Profit/Loss with mixed fractions: $\text{Profit, } 36\frac{4}{11}\%$ | Rendered as PNG images | Reconstruct to LaTeX: `$\text{Profit, } 36\frac{4}{11}\%$` |
| **19** | 01 Jul S2 | Q65 | Speeds with `km/hr`: `94.66 km/hr`, `46.96 km/hr` | Rendered as PNG images (regex only matched `km/h`) | Promoted to clean text: `94.66 km/hr`, `46.96 km/hr` |
| **20** | 01 Jul S2 | Q67 | Mixed fractions: $1\frac{81}{217}$, $2\frac{61}{217}$, $3\frac{27}{217}$ | Rendered as PNG images | Reconstruct to LaTeX: `$1\frac{81}{217}$`, `$2\frac{61}{217}$`, `$3\frac{27}{217}$` |
| **21** | 01 Jul S2 | Q68 | Pure numeric fractions: $\frac{36}{115}$, $\frac{125}{216}$, $\frac{36}{125}$, $\frac{25}{36}$ | Rendered as PNG images | Reconstruct to LaTeX: `$\frac{36}{115}$`, `$\frac{125}{216}$`, `$\frac{25}{36}$` |
| **22** | 01 Jul S2 | Q72 | Student marks frequency table | Prompt text duplicated in diagram crop | Clean diagram crop containing only frequency table |
| **23** | 01 Jul S2 | Q75 | Rational expressions: $\frac{2xy}{x^2-y^2}$, $\frac{x^2-y^2}{2xy}$ | Rendered as PNG images | Reconstruct to LaTeX: `$\frac{2xy}{x^2-y^2}$`, `$\frac{x^2-y^2}{2xy}$` |

---

## 3. Four Core Algorithmic Defect Classes & Root Causes

### Defect Class 1: Stacked Mathematical Fractions and Mixed Expressions Kept as Images
- **Root Cause**: TCS response sheets render fractions as vertically stacked bitmaps with horizontal fraction bars. The prior option chip OCR ran Tesseract in single-line mode (`--psm 7`), which flattened two-line fractions into noise (`oe`, `x`, `716`, `42= km/h`). Even when two-line OCR survived (`25\n36`), `is_promotable_option_text` lacked fraction grammar rules and rejected the text, forcing the pipeline to retain raster PNG images.
- **Solution**:
  1. Multi-scale fraction bar detection in `robust_ocr_chip`: analyze pixel profiles to detect horizontal fraction bar lines.
  2. Multi-line OCR (`--psm 6`) on upscaled chips with Lanczos interpolation and white border expansion.
  3. Reconstruct pure fractions into `\frac{N}{D}` and mixed fractions into `$W\frac{N}{D}\text{ units}$`.
  4. Expand `is_promotable_option_text` to accept all valid KaTeX fraction patterns.

### Defect Class 2: Restrictive Option Promotion Rules Demoting Plain Text to Images
- **Root Cause**:
  - Commas in numeric options (`87,000`) failed `^\d+(\.\d+)?$`.
  - Word pairs with mixed case and punctuation (`Cow — Buffalo`, `Foot : Ankle`) failed `^[A-Z]+\s*:\s*[A-Z]+$` and `isalpha()`.
  - Units with `km/hr`, `kmph`, `cm/s` failed the regex which only allowed `km/h`.
  - Mixed-case code words (`gc`, `fp`, `mZ`, `Ze`) failed `^[A-Z]{2,6}$`.
- **Solution**:
  - Add numeric comma regex: `^\d{1,3}(,\d{2,3})+(\.\d+)?$`.
  - Add generalized word-pair analogy regex: `^[A-Za-z]+(\s+[A-Za-z]+)*\s*[:–—\-]\s*[A-Za-z]+(\s+[A-Za-z]+)*$`.
  - Add unit patterns: `km/hr`, `kmph`, `m/s`, `cm/s`, `cm³`, `m³`, `quintals`.
  - Support mixed-case alphabetical codes: `^[A-Za-z]{2,6}$`.

### Defect Class 3: Diagram Crop Prompt Leakage & Stem Duplication
- **Root Cause**:
  - TCS response sheets often embed visual questions (mirror images, cube nets, pie charts) as a single composite raster image that includes the question prompt at the top.
  - The previous importer OCR'd the diagram, populated `raw_q_text = ocr_stem`, and kept the uncropped diagram as `diagramUrl`.
  - The active player rendered both `questionText` and the diagram, displaying the prompt twice (and often leaking garbled chart slice labels into the prompt text).
- **Solution**:
  - Geometric header crop refinement: detect horizontal white bands separating the top prompt text line from the authentic visual diagram below it.
  - Crop the diagram image to preserve strictly the authentic visual figure (cube net, mirror string, pie chart).
  - Use the clean prompt in `questionText` and the refined figure in `diagramUrl` with zero duplication.
  - In cases where the diagram is completely self-contained with no separable header gap, suppress OCR label leakage into `questionText`.

### Defect Class 4: Storage & Database Bloat from Orphaned Images
- **Root Cause**: Iterative ingestion runs generated thousands of PNG crops on disk (`web/public/exam-assets/ssc/chsl/2024/`). When questions were demoted to text or re-extracted, old image files remained orphaned on disk.
- **Solution**:
  - Implement a referential integrity audit script cataloging all assets referenced by active JSON papers.
  - Safely remove unreferenced PNGs from disk with full backup and audit reporting (`docs/IMAGE_ASSET_FORENSIC_REPORT.md`).

---

## 4. Protected Baselines & Invariants
- **GATE 2024 & GATE 2025 protected baseline**: Extraction logic for GATE papers is strictly preserved; zero regressions permitted.
- **Authentic visual reasoning preservation**: Cube nets, dice faces, mirror images, paper folding, pattern series, and pie charts MUST remain high-fidelity visual assets.
- **Zero question-specific hacks**: All parsing logic must be general, geometric, and rule-based.
