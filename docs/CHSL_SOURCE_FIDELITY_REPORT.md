# MOCK.AI — SSC CHSL Source Fidelity Forensic Report
**Document ID:** `docs/CHSL_SOURCE_FIDELITY_REPORT.md`  
**System:** MOCK.AI Universal Paper Ingestion Engine  
**Author:** Agent 2 (Importer Forensics) & Agent 3 (Source Geometry)  
**Date:** October 2026  
**Status:** FORENSIC AUDIT COMPLETE

---

## 1. Major Forensic Findings & Defect Analysis

### 1.1 Root Cause of Cross-Year Asset Leakage (Section Numbering Mismatch)
**Finding:** 50 exam JSON files from 2019, 2020, and 2023 contained broken references pointing to 2024 asset folders (`/exam-assets/ssc/chsl/2024/...`).  
**Root Cause:**
- In SSC CHSL 2024, questions are numbered continuously from $1$ to $100$ in the CBT response sheets.
- In SSC CHSL 2019–2021, each of the four sections restarts question numbering from $1$ to $25$ ($4 \times 25 = 100$ total):
  - Section 1 (General Intelligence): `Q.1` to `Q.25`
  - Section 2 (General Awareness): `Q.1` to `Q.25`
  - Section 3 (Quantitative Aptitude): `Q.1` to `Q.25`
  - Section 4 (English Language): `Q.1` to `Q.25`
- A legacy relinking script attempted to fill unlinked option images by matching global question indices against 2024 assets without validating the paper identity or section coordinate bounds, causing 980 invalid references to be injected into historical papers.

**Universal Engine Fix:**
Question identity must never rely solely on flat question numbers. The canonical identity is:
$$\text{QuestionId} = \text{paperId} + \text{"-s"} + \text{sectionId} + \text{"-q"} + \text{sourceQuestionNumber}$$
Asset storage is strictly partitioned by `paperId`, guaranteeing that no paper can ever reference an asset belonging to another year or shift.

---

### 1.2 The Narrow-Chip OCR Substitution Defect (`|` vs `1`, `Z` vs `2`/`7`)
**Finding:** Option chips in CBT response sheets are cropped tightly ($\approx 14\text{--}18\text{ px}$ wide). Under standard OCR page segmentation modes (PSM 3 or PSM 6), single narrow vertical glyphs produce severe character confusion:
- Digit `'1'` misclassified as `'|'` (pipe), `'l'` (lowercase L), or `'!'`.
- Digits `'2'` and `'7'` on dice faces misclassified as letter `'Z'`.
- Geometric angle symbol `∠` misclassified as `'Z'` (e.g. `ZB = 90°` instead of `∠B = 90°`).
- Trigonometric radical dropped: `cosecA = 2\sqrt{2}` misclassified as `cosecA = 22`.

**Previous Flawed Heuristic:**
Inline string substitutions like `cosecA = 22 → 2√2` and `| → 1` were hardcoded into generic cleaning functions, threatening mathematical fidelity across non-SSC exams.

**Universal Engine Fix:**
- Multi-tier dynamic thresholding and high-resolution Lanczos scaling ($4\times$) with border padding.
- Strict scope confinement: pipe substitution (`| → 1`) is allowed **only** on isolated single-character option chips and CBT ratio notation (`\d+ : |`). It is strictly prohibited in general mathematical equations.
- Angle notation `∠` is normalized only when followed by letter tokens and degree expressions with geometric context.

---

### 1.3 The Four-Identical-Options Defect
**Finding:** In several historical questions, all 4 options contained identical text (e.g. `["15", "15", "15", "15"]` or `["7.50%", "7.50%", "7.50%", "7.50%"]`).  
**Root Cause:**
When option choices in the PDF are graphic chips (e.g. diagrams or equations) and OCR failed to segment the options individually, the importer copied the first recognized token into all four slots.  
**Universal Engine Fix:**
- If all 4 option strings are identical and option images exist, text is cleared and options are treated as `IMAGE_ONLY`.
- If no option images exist, the question is flagged `REVIEW_REQUIRED`.

---

### 1.4 Passage Duplication & Boundary Leakage
**Finding:** In Reading Comprehension and Cloze Test questions, the full passage was prepended directly into every sub-question's `questionText`.  
**Universal Engine Fix:**
- Implements first-class `PassageGroup` modeling.
- The shared passage is stored once as a parent context block, and sub-questions reference it by `passageId`, reducing JSON payload size and preventing rendering duplication.

---

### 1.5 Answer-Key Mapping Vulnerability
**Finding:** If an extra icon (e.g. an advertisement logo or candidate chosen option cross) was erroneously categorized as a green tick, or if a question lacked a tick, flat sequential matching shifted all subsequent answer keys by one position.  
**Universal Engine Fix:**
- Geometrically bound answer key detection:
  $$\text{tick} \in [start\_y, end\_y] \quad\text{and}\quad x < col\_bound$$
- Proximity constraint: distance from tick to closest option must be $\le 35\text{ pt}$.
- Every question must resolve to exactly one tick. Multiple ticks or zero ticks trigger `REVIEW_REQUIRED` without shifting the rest of the paper.
