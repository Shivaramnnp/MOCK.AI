# SSC CHSL 2024 Forensic Repair & Certification: Shared Root-Cause Analysis (Milestone 1)

**Document Reference:** `docs/ssc-chsl-2024/ROOT_CAUSE_ANALYSIS.md`  
**Initiative:** Mock.AI SSC CHSL 2024 Forensic Repair & Full-Corpus Certification  
**Author:** Worker Agent (`worker_m0_m1`), incorporating findings from Explorer Agents (`explorer_m0_1`, `explorer_m0_2`, `explorer_m0_3`)  
**Parent Orchestrator:** Program Orchestrator (`c580e698-58c5-442f-bbc6-00238b1d30bf`)  
**Status:** Certified Authoritative Baseline  
**Date:** 2026-10-01  

---

## 1. Executive Summary & Architectural Overview

The SSC CHSL 2024 corpus comprises **37 authoritative examination papers** (36 Tier-1 four-shift daily papers across 9 dates, plus 1 Tier-2 comprehensive paper) totaling **3,735 questions**, **920 source PDF pages**, and **5,764 active visual assets** on disk.

Historical ingestion and rendering implementations suffered from a constellation of systemic defects that degraded question fidelity, corrupted visual reasoning choices, leaked OCR artifacts into the UI, wiped question prompt stems, and exposed authoritative answer keys directly to the client browser.

This document establishes the authoritative, root-cause diagnostic across all **6 forensic defect classes**. Each defect class is analyzed through:
1. **The Phenomenological Symptom** (what candidates or reviewers observed).
2. **The Exact Failure Mechanism** (how the geometry, parser, data structure, or React component failed).
3. **Verified Code References** (exact files, lines, and functions in the repository).
4. **Concrete Architectural Solutions** (generic, reusable engineering repairs for Milestone 2 and Milestone 3).

### Non-Negotiable Core Architectural Principles

- **Source Fidelity Invariant:** `SOURCE VISUAL > OCR > TEXT > DERIVED METADATA`. When source visual assets exist, the visual crop is ground truth; OCR is strictly auxiliary metadata for accessibility and search. Visual crops and OCR text must never be double-rendered.
- **Zero Question-Specific Patches:** Strictly prohibit hardcoded question overrides such as `if (paperId === ...)`, `if (q_num === 4)`, or `if (questionNumber === 26)`. All repairs must be implemented as generic geometric and presentation rules.
- **No Manufactured Certainty:** If content cannot be faithfully extracted from official sources, it must be marked `REVIEW_REQUIRED`. Placeholders like `"Question {N}"` or artificial option texts are strictly forbidden.
- **Active Exam Answer-Key Isolation:** Active examination sessions must receive presentation schemas only. Correct answers, solution keys, and explanations must remain quarantined until formal test submission.

---

## 2. Forensic Defect Class A: Coordinate Boundaries & Upward Option Search Tolerance

### 2.1 The Phenomenological Symptom
In visual reasoning questions (e.g. pattern series, mirror images, folding figures), Option D (or the fourth option slot) was frequently rendered completely blank (`""`) without text or image, while Option A received an incorrect image or the question stem carried an extraneous option image.

### 2.2 Exact Failure Mechanism
In official TCS iON CBT response sheet PDFs, the question prompt is laid out above the candidate answer table. The beginning of the answer choices is marked by the word `"Ans"` (or answer option radio markers `1.`, `2.`, `3.`, `4.`):

```
+-------------------------------------------------------+
| Question Stem Diagram (W: 860, H: 202)                |
+-------------------------------------------------------+
|                                                       |
|   [16x16 TICK]  [Option 1 Figure: W: 124, H: 124]     |  <-- Top coordinate y0 = 600.0
| Ans                                                   |  <-- Text bbox y0 = 615.0
|   1. X                                                |
|   2. X          [Option 2 Figure: W: 124, H: 124]     |  <-- Top coordinate y0 = 660.0
|   3. X          [Option 3 Figure: W: 124, H: 124]     |  <-- Top coordinate y0 = 720.0
|   4. X          [Option 4 Figure: W: 124, H: 124]     |  <-- Top coordinate y0 = 780.0
+-------------------------------------------------------+
```

Naive extraction implementations relied on a rigid, hardcoded vertical tolerance:
```python
ans_pos_for_imgs = (ans_pos[0], ans_pos[1] - 10)
diag_imgs = [img for img in q_imgs if img['pos'] < ans_pos_for_imgs]
opt_imgs = [img for img in q_imgs if img['pos'] >= ans_pos_for_imgs]
```

When Option 1's figure was taller than average or placed slightly higher than the `"Ans"` baseline (e.g., $y_0 = 600.0$ while $ans\_pos.y - 10 = 605.0$):
1. **Misclassification:** Option 1's figure satisfied `img['pos'] < ans_pos_for_imgs` and was appended to `diag_imgs` (the question stem diagrams).
2. **Image Depletion:** `opt_imgs` contained only **3 images** (Options 2, 3, and 4) instead of 4.
3. **Sequential Slot Collapse:** The assignment loop matched the 3 images to Slots 0 (A), 1 (B), and 2 (C).
4. **Blank Option D:** Slot 3 (Option D) had no image and no selectable text, rendering as a blank card.
5. **Stem Contamination:** The question stem carried Option 1's image alongside the actual problem diagram.

### 2.3 Verified Code References
- `scripts/universal_chsl_importer.py` (lines 407–415):
  ```python
  if ans_pos:
      ans_pos_for_imgs = (ans_pos[0], ans_pos[1] - 10)
      diag_imgs = [img for img in q_imgs if img['pos'] < ans_pos_for_imgs]
      opt_imgs = [img for img in q_imgs if img['pos'] >= ans_pos_for_imgs]
  ```
- `scripts/universal_visual_extractor.py` (lines 171–177):
  ```python
  if ans_y:
      diag_imgs = [img for img in q_imgs if img['rect'].y0 < ans_y]
      opt_imgs = [img for img in q_imgs if img['rect'].y0 >= ans_y]
  ```
- `scripts/universal_chsl_importer.py` (lines 484–497):
  ```python
  unassigned_slots = [s for s in range(4) if s not in assigned_slots]
  unassigned_imgs = [img for idx_img, img in enumerate(opt_imgs_sorted) if idx_img not in used_img_indices]
  for slot, img in zip(unassigned_slots, unassigned_imgs):
      opt_imgs_assigned[slot] = img
  ```

### 2.4 Concrete Architectural Solution: Certified 2D Geometric Classifier
The previous naive vertical-only threshold formula `y_boundary = min(ans_pos.y - 35, ...)` was empirically proven flawed during forensic audit: in TCS iON CBT response sheets, question stem diagrams terminate only 3.0 pt above `Ans.y0` ($y_1 = Ans.y_0 - 3.0$ pt), so setting `Ans - 35` pt cuts 32 pt directly into stem diagrams, falsely misclassifying them as option figures and wiping stems.

To permanently eliminate this defect, the ingestion pipeline adopts the **Certified 2D Geometric Classifier**, combining horizontal column discrimination, vertical extents, aspect ratio clustering, and empty-marker exception guards:

1. **Horizontal Column Discrimination:**
   - **Option Figures:** Must satisfy $x_0 \ge 78$ pt (indented column, typically $x_0 \in [86.0, 88.0]$ pt).
   - **Question Stem Diagrams:** Align to the left margin at $x_0 < 78$ pt (typically $x_0 \approx 57.9$ pt) with wide horizontal extent $W \ge 150$ pt (typically $W \approx 343.4$ pt). Stem figures never reside in the indented option column.

2. **Vertical Extent & Coordinate Boundaries:**
   - **Stem Diagrams:** Satisfy $y_1 \le Ans.y_0$ (strictly above or terminating at the top edge of the `"Ans"` text block).
   - **Option Figures:** Satisfy $y_0 \ge Ans.y_0 - 5$ pt and $x_0 \ge 78$ pt (bounded by the answer section and indented column).
   - **Empty Marker Guard & Safe Fallback:** When scanning option markers (`1.`, `2.`, `3.`, `4.` or tick/cross icons), protect against empty collections or missing coordinate keys to prevent runtime `ValueError: min() arg is an empty sequence`:
     ```python
     y_boundary = min([ans_pos[1] - 5] + [m['pos'][1] for m in option_markers if m.get('pos')])
     ```
     This safely bounds option markers while guaranteeing fallback to `ans_pos[1] - 5` pt if no marker coordinates are found.

3. **4-Option Dimension Clustering & Invariant:**
   - Visual reasoning choices almost universally share matching geometric aspect ratios and bounding box dimensions (e.g., $W \pm 15\%$, $H \pm 15\%$).
   - When 4 indented images ($x_0 \ge 78$ pt) with matching dimensions exist below the stem diagram, they form the complete option set.
   - Never reassign stem diagrams to options based on vertical $y_0$ alone.

4. **Multi-Figure Series Stem Safeguard:**
   - In questions containing multi-figure problem series (e.g., analogies, figure matrices, folding series where $N > 1$ diagram figures exist above `Ans`), all figures with $y_1 \le Ans.y_0$ and $x_0 < 78$ pt belong exclusively to the question stem.
   - Stem diagrams in multi-figure series must never be stolen into option slots, ensuring complete integrity of complex visual problem prompts.

---

## 3. Forensic Defect Class B: Option Ownership & Single-Ownership Guarantee

### 3.1 The Phenomenological Symptom
Confusion between question figures and option figures: option diagrams appearing in the stem carousel, stem diagrams being repeated inside an option card, or images disappearing entirely in multi-step processing.

### 3.2 Exact Failure Mechanism
The PDF extraction pipelines maintained separate, loosely coupled data structures for text blocks and image XObjects. In early iterations of the TypeScript PDF ingestion engine:
1. `assetExtractor.ts` extracted all image XObjects on a page and assigned them default metadata:
   ```ts
   ownership: 'QUESTION' // Hardcoded default
   ```
2. The code expected `questionSegmenter.ts` to refine asset ownership into `OPTION_A`, `OPTION_B`, etc.
3. However, `questionSegmenter.ts` contained no spatial reassignment logic.
4. When `optionSegmenter.ts` ran, it queried:
   ```ts
   const optionAsset = associatedAssets.find((a) => a.ownership === `OPTION_${key.toUpperCase()}`);
   ```
   Because all assets retained `ownership: 'QUESTION'`, `optionAsset` was always `undefined`.

In the Python ingestion scripts, naming conventions (`q{N}_diag.png` vs `q{N}_opt_{a-d}.png`) isolated files on disk, but lack of a formal entity ownership model allowed spatial ambiguities during boundary segmentation to cross-contaminate stem and option sets.

### 3.3 Verified Code References
- `web/src/services/ingestion/pdf/assetExtractor.ts` (line 159):
  ```ts
  ownership: 'QUESTION', // Option-specific assignment refined during segmentation
  ```
- `web/src/services/ingestion/pdf/optionSegmenter.ts` (lines 33–35):
  ```ts
  const optionAsset = associatedAssets.find(
    (a) => a.ownership === `OPTION_${key.toUpperCase()}`
  );
  ```
- `scripts/universal_chsl_importer.py` (lines 476, 491):
  ```python
  fname_opt = f"q{overall_q_num}_opt_{letter}.{ext}"
  ```

### 3.4 Concrete Architectural Solution
1. **Single-Ownership Guarantee Contract:**
   Every extracted asset must belong to exactly one entity. The sets of stem assets and option assets are strictly disjoint:
   $$\text{Assets}_{\text{stem}} \cap \text{Assets}_{\text{option}} = \emptyset$$
2. **Explicit Semantic Block Modeling:**
   - Question stems possess: `diagramUrl?: string` and `diagramUrls?: string[]`.
   - Each option choice in `richOptions` possesses: `imageUrl?: string` and `displayMode: 'IMAGE_ONLY' | 'TEXT_ONLY' | 'IMAGE_WITH_ACCESSIBILITY_TEXT' | 'TEXT_AND_IMAGE'`.
3. **Automated Pipeline Invalidation Rule:**
   No asset path containing `_opt_` may be assigned to `diagramUrl`/`diagramUrls`, and no asset path containing `_diag` may be assigned to `optionImages` or `richOptions[i].imageUrl`.

---

## 4. Forensic Defect Class C: OCR Text vs Visual Image Confusion & Double Rendering

### 4.1 The Phenomenological Symptom
On test player screens, candidates observed:
- Noisy, corrupted OCR strings (e.g. `"Snodveo"`, `'"3'`, `"oO"`, `"71"`) rendered as visible text directly beneath an authentic reasoning image crop.
- On alternative screens (`TestPlayerScreen.tsx`, `ReviewScreen.tsx`), candidates saw *only* the corrupted OCR string and *no image at all*, or completely blank option cards for questions where `options` was empty.

### 4.2 Exact Failure Mechanism
This defect stems from a dual failure across the ingestion pipeline and the frontend presentation layers:

#### A. Ingestion Layer Contamination (`universal_chsl_importer.py`)
In TCS iON CBT response sheets, visual reasoning options contain bitmap images without embedded text streams. When `pytesseract` was run on small option crops, it produced low-confidence OCR fragments.
While the importer correctly structured `richOptions` with `displayMode: 'IMAGE_ONLY'` and `text: ""`, line 580 intentionally leaked the noisy OCR string back into the raw `opt_texts` array:
```python
# scripts/universal_chsl_importer.py:579-580
# For raw options array, preserve OCR text if available for search / legacy consumers
opt_texts[idx_opt] = ocr_metadata or ""
```
This resulted in **787 questions** having corrupted OCR strings in `question.options` alongside valid image URLs in `question.optionImages`.

#### B. Component Fallback Misconfiguration (`StructuredContentRenderer.tsx`)
In `OptionContentRenderer`:
```tsx
const effectiveMode: DisplayMode =
  displayMode ||
  (image && hasText ? 'TEXT_AND_IMAGE' : image ? 'IMAGE_ONLY' : 'TEXT_ONLY');
```
When `displayMode` was undefined or omitted, and both `image` and `hasText` (from `fallbackText={opt}`) were present, the component defaulted to `'TEXT_AND_IMAGE'`.
In `'TEXT_AND_IMAGE'` mode (lines 616–635), the renderer mounted both `<ExamAsset>` and `<StructuredContentRenderer>`, visually displaying the noisy OCR text beneath the image.

#### C. Cross-Screen Vulnerability (`TestPlayerScreen.tsx` & `ReviewScreen.tsx`)
While `CompetitiveExamPlayerScreen.tsx` employed `OptionContentRenderer`, other screens bypassed it entirely:
```tsx
// TestPlayerScreen.tsx lines 299 & 326
{currentQuestion.options.map((opt, optIndex) => (
  ...
  <LatexRenderer content={opt} />
))}
```
```tsx
// ReviewScreen.tsx lines 156 & 187
{q.options.map((opt, optIdx) => (
  ...
  <LatexRenderer content={opt} />
))}
```
Because these screens only inspected `q.options`, they completely ignored `q.optionImages` and `q.richOptions`.

### 4.3 Verified Code References
- `scripts/universal_chsl_importer.py` (lines 500–514, 558, 579–580):
  ```python
  opt_texts[idx_opt] = ocr_metadata or ""
  ```
- `web/src/components/StructuredContentRenderer.tsx` (lines 578–580, 616–635):
  ```tsx
  const effectiveMode: DisplayMode =
    displayMode ||
    (image && hasText ? 'TEXT_AND_IMAGE' : image ? 'IMAGE_ONLY' : 'TEXT_ONLY');
  ```
- `web/src/screens/TestPlayerScreen.tsx` (lines 299–327).
- `web/src/screens/ReviewScreen.tsx` (lines 156–188).

### 4.4 Concrete Architectural Solution
1. **Zero OCR Contamination in Raw Array:**
   In `universal_chsl_importer.py`, if an option is visual (`displayMode == 'IMAGE_ONLY'`), set `opt_texts[idx_opt] = ""` (strictly empty string). OCR text must be stored exclusively in `richOptions[i].ocrText` or accessibility metadata.
2. **Safe Renderer Fallback:**
   In `OptionContentRenderer`, if an image is present, the default mode must be `IMAGE_ONLY` unless explicitly tagged `TEXT_AND_IMAGE`:
   ```tsx
   const effectiveMode: DisplayMode =
     displayMode || (image ? 'IMAGE_ONLY' : 'TEXT_ONLY');
   ```
3. **Cross-Screen Component Unification:**
   Refactor `TestPlayerScreen.tsx` and `ReviewScreen.tsx` to utilize `OptionContentRenderer` (or accept `richOptions` / `optionImages`), ensuring uniform visual rendering across all player and review interfaces.

---

## 5. Forensic Defect Class D: Drawing-Order vs Spatial Sorting & Stem Wipes

### 5.1 The Phenomenological Symptom
Question prompt text was completely erased and replaced with a generic placeholder string, such as `"Question 4"`, forcing candidates to guess what the question was asking.

### 5.2 Exact Failure Mechanism
PDF content streams are organized in drawing order (the sequence of PDF drawing commands generated by layout engines), which often diverges from physical reading order:

```
[PDF Stream Drawing Sequence]
Block 0: Footer "Page 1 of 21" (y0 = 808.6, y1 = 818.0)  <-- Drawn FIRST in stream!
Block 1: "Q.4 The following sentence has been divided..." (y0 = 556.9, y1 = 570.0)
Block 2: "Ans 1. they were asked..." (y0 = 609.5)
```

The historical naive text extraction loop traversed blocks in raw stream order:
```python
prompt_parts = []
for b in q_blocks:
    if ans_pos and b['pos'] >= ans_pos:
        break # Reached the answer block!
    prompt_parts.append(b['text'])
```

When evaluating Block 0:
- `b['pos']` was $(1, 808.6)$ (the page footer at the very bottom of the page).
- `ans_pos` was $(1, 609.5)$.
- Because $808.6 \ge 609.5$, the condition evaluated to `True` on the **very first iteration**.
- The loop terminated immediately. `prompt_parts` remained empty (`[]`).
- The parser fell back to:
  ```python
  if not raw_q_text:
      raw_q_text = f"Question {q_num}"
  ```
This wiped out genuine question stems like 01 Jul Shift 1 Q4.

### 5.3 Verified Code References
- `scripts/universal_chsl_importer.py` (lines 247–254, 383, 400):
  ```python
  # Footer filtering and spatial sorting:
  blocks = [b for b in blocks if b['bbox'][3] < page_h - 45 and b['bbox'][1] > 35]
  blocks.sort(key=lambda b: (b['page'], round(b['bbox'][1], 1), round(b['bbox'][0], 1)))
  ```
- `web/src/screens/SscChslFidelityRegression.test.tsx` (lines 20–55):
  Regression test confirming that 01 Jul Shift 1 Q4 stem extraction preserves full prompt text.

### 5.4 Concrete Architectural Solution
1. **Print Margin Exclusion Filter:**
   Before any question segmentation, strip layout artifacts outside printable content margins:
   - Header margin: discard blocks with $y_1 < 35$ pt.
   - Footer margin: discard blocks with $y_0 > \text{page\_height} - 45$ pt.
2. **Deterministic Spatial Geometric Pre-Sorting:**
   Never process blocks in raw PDF stream order. Sort all text and image blocks by physical layout geometry:
   $$\text{SortKey}(b) = (\text{page\_num},\; \text{round}(y_0, 1),\; \text{round}(x_0, 1))$$
3. **Absolute Prohibition of Placeholder Fallbacks:**
   Eliminate all fallback patterns like `f"Question {q_num}"`. If a question has neither text nor diagram, the pipeline must raise a validation failure and flag `REVIEW_REQUIRED`.

---

## 6. Forensic Defect Class E: Spurious "Click to Enlarge Figure" Prompts

### 6.1 The Phenomenological Symptom
Questions containing only plain text (e.g. English grammar or verbal reasoning) rendered an unexpected white card containing a zoom icon and the button label `"Click to enlarge figure"`, even though no question diagram existed or the displayed image was a misplaced formula from a different question.

### 6.2 Exact Failure Mechanism
This defect resulted from two compounding issues:

#### A. Misassigned / Carried-Over `diagramUrl`
In earlier ingestion runs, raster image crops extracted from one question (or decorative horizontal separator lines and test venue logos) were improperly associated with adjacent text questions.
For example, in commit `dc6a8dd`, plain-text Question 35 in `ssc-chsl-2024-01jul-s1.json` ("The position of how many letters will remain unchanged...") was assigned:
```json
"diagramUrl": "/exam-assets/ssc/chsl/2024/ssc-chsl-2024-01jul-s1/q35_diag.png"
```
The file `q35_diag.png` was an $833 \times 78$ px equation crop belonging to Reasoning Question 17.

#### B. Unconditional Zoom Button in `ExamAsset.tsx`
In `ExamAsset.tsx` (lines 90–111), whenever `variant="diagram"` (the default for question stems), the component unconditionally rendered the zoom control:
```tsx
return (
  <div className={`p-3 bg-white ...`}>
    <img src={resolved} ... />
    <button
      type="button"
      onClick={() => onZoom?.(resolved)}
      className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-surface-muted hover:text-brand-primary"
    >
      <ZoomIn className="w-3.5 h-3.5" />
      <span>Click to enlarge figure</span>
    </button>
  </div>
);
```
In `CompetitiveExamPlayerScreen.tsx` (lines 1075–1098), any URL found in `diagramUrls` or `diagramUrl` was rendered with `variant="diagram"`.

### 6.3 Verified Code References
- `web/src/components/ExamAsset.tsx` (lines 90–111).
- `web/src/screens/CompetitiveExamPlayerScreen.tsx` (lines 1075–1098).
- `web/src/data/exams/ssc-chsl-2024-01jul-s1.json` (historic Q35 regression).

### 6.4 Concrete Architectural Solution
1. **Strict Ingestion Diagram Qualification:**
   An image XObject may be assigned to `diagramUrl` if and only if:
   - Its spatial bounding box sits strictly between the question prompt start and the option area ($y_{q\_start} \le y_0$ and $y_1 \le y_{ans}$).
   - Its physical area exceeds minimum diagram dimensions: $\text{Width} \ge 80\text{ pt}$ and $\text{Height} \ge 40\text{ pt}$.
   - It is not a decorative rule, candidate portrait, barcode, or TCS iON watermarking artifact.
2. **Dimension-Aware Asset Rendering:**
   In `ExamAsset.tsx`:
   - Inspect natural and display dimensions: do not render `"Click to enlarge figure"` on small formulas or icons ($H < 60\text{ px}$).
   - Support `allowZoom={false}` for non-magnifiable figures.
3. **Player Guard:**
   `CompetitiveExamPlayerScreen.tsx` must never render diagram wrappers when `diagramUrl` is null, empty string, or already rendered as a content block.

---

## 7. Forensic Defect Class F: Active Exam Answer-Key Isolation & Client Bundle Exposure

### 7.1 The Phenomenological Symptom
Authoritative answer keys, correct option indices, and detailed explanations for all 3,735 questions were packaged into client-facing JavaScript bundles and exposed in active exam React component props, allowing test-takers to inspect answers via DevTools during an active test session.

### 7.2 Exact Failure Mechanism

```
[Client Bundle Build Time]
catalog.ts: import.meta.glob(['./ssc-chsl-*.json'], { eager: true })
      |
      v  Bakes all 37 JSON files (with correctAnswer, explanation)
      |  into dist/assets/ssc-chsl-2024-CuYgcqgQ.js (5.88 MB)
      v
[Active Exam Session Runtime]
App.tsx: <CompetitiveExamPlayerScreen paper={activeExamPaper} ... />
      |
      |-- React DevTools: $r.props.paper.questions[*].correctAnswer (EXPOSED!)
      |-- Component State: useMemo sanitizes questions in memory,
                           BUT parent props and client bundle remain unquarantined!
```

#### A. Eager Vite Glob Bundling
In `web/src/data/exams/catalog.ts`:
```ts
const paperModules = import.meta.glob<{ default: ExamPaper }>(['./ssc-chsl-*.json', './gate-*.json'], { eager: true });
```
Because `{ eager: true }` was specified, Vite bundled every JSON file directly into client chunks. The entire SSC CHSL 2024 solution key was shipped over the network before the candidate started Question 1.

#### B. Direct Prop Injection in `App.tsx`
In `web/src/App.tsx`:
```tsx
<CompetitiveExamPlayerScreen
  paper={activeExamPaper}
  initialSession={activeExamSession}
  ...
/>
```
`activeExamPaper` was passed as an unquarantined object containing all answers and explanations.

#### C. Ineffective In-Memory Sanitization
While `CompetitiveExamPlayerScreen.tsx` implemented a `useMemo` hook (lines 142–161) to strip `correctAnswer` for internal state `questions`, the complete unsanitized paper remained stored in:
- `props.paper` (readable via `$r.props.paper` in React DevTools or browser memory dumps).
- App-level state `activeExamPaper`.
- The static JS network bundle.

### 7.3 Verified Code References
- `web/src/data/exams/catalog.ts` (lines 576–585).
- `web/src/App.tsx` (lines 1046, 1054–1056).
- `web/src/screens/CompetitiveExamPlayerScreen.tsx` (lines 142–161).

### 7.4 Concrete Architectural Solution
1. **Data Schema Segregation:**
   Split exam data into two distinct schemas:
   - **`ExamPresentationPaper`**: Contains `id`, `examId`, `title`, `durationMinutes`, and questions containing strictly presentation fields (`id`, `questionText`, `options`, `richOptions`, `diagramUrl`, `section`, `marks`). Zero presence of `correctAnswer`, `correctAnswerIndex`, `explanation`, or `solution`.
   - **`ExamSolutionManifest`**: Quarantined mapping file or server-authoritative store mapping `questionId -> { correctAnswer, correctAnswerIndex, explanation }`.
2. **Lazy Dynamic Loading / Network Isolation:**
   Replace eager glob imports in `catalog.ts` with dynamic import functions or runtime API endpoints:
   - `fetchExamPresentation(paperId)`: Loads presentation schema only.
   - `fetchExamSolutions(paperId)`: Fetched strictly post-submission upon navigating to `CompetitiveExamResultsScreen`.
3. **Props Quarantine Contract:**
   `CompetitiveExamPlayerScreen` must type its input prop as `paper: ExamPresentationPaper`. The active exam player component must never have access to answer keys at any level of its prop or state hierarchy.

---

## 8. Corpus Baseline Defect Audit Summary

A deep audit across all 37 papers was conducted by `explorer_m0_2` and validated against the local filesystem:

| Metric | Corpus Baseline Value | Target Certified Value (M10) |
|---|---|---|
| **Total Official Papers** | 37 (36 Tier-1, 1 Tier-2) | 37 |
| **Total Questions** | 3,735 | 3,735 |
| **Unrepresented / Blank Options** | 0 | 0 |
| **Stem Wipes (`Question {N}`)** | 0 | 0 |
| **Empty Stems with Diagrams** | 910 (24.36%) | 910 (verified source visual) |
| **4-Identical Options Bug** | 0 | 0 |
| **Broken Image Paths on Disk** | 0 | 0 |
| **Double-Rendering Risk (Dual text/image)** | 787 questions | 0 (eliminated via clean `options`) |
| **Active Assets on Disk** | 5,764 files | 5,764 verified |
| **Answer Key Isolation Status** | VULNERABLE (bundled) | CERTIFIED QUARANTINED |

---

## 9. Implementation Roadmap & Milestones (M2 – M10)

1. **Milestone 2: Shared Pipeline & Asset Architecture Repair**
   - Implement dynamic upward option bounding and dimension clustering in `universal_chsl_importer.py`.
   - Implement single-ownership validation rules.
   - Cleanse raw `opt_texts` array: set to `""` for `IMAGE_ONLY` options, keeping OCR strictly in `richOptions[i].ocrText`.
   - Establish presentation vs solution schema separation.

2. **Milestone 3: Shared Player & UI Rendering Repair**
   - Safe fallback in `OptionContentRenderer` defaulting to `IMAGE_ONLY` when an image is present.
   - Refactor `TestPlayerScreen.tsx` and `ReviewScreen.tsx` to use `OptionContentRenderer`.
   - Dimension-aware zoom controls in `ExamAsset.tsx`.
   - Quarantine answer keys from active player props.

3. **Milestone 4 & 5: Representative Paper Reprocessing & Verification**
   - Reprocess representative high-risk paper (01 Jul Shift 1) through the repaired pipeline.
   - 3-Layer verification: Source PDF $\to$ Canonical JSON $\to$ Browser DOM.

4. **Milestone 6 & 7: Corpus-Wide Reprocessing & Isolated Audits**
   - Regenerate all 37 papers through certified pipeline.
   - Produce individual audit reports in `docs/audits/ssc-chsl-2024/<paperId>.md`.

5. **Milestone 8 & 9: Adversarial Challenge & Cross-Regression**
   - Stress-test mirror images, cube nets, multi-line options, and page boundaries.
   - Verify zero regressions across GATE 2024, GATE 2025, and SSC CHSL 2025 protected datasets.

6. **Milestone 10: Final Certification**
   - Produce authoritative `docs/SSC_CHSL_2024_FORENSIC_CERTIFICATION_REPORT.md` certified by Success Auditor.

---

*End of Root-Cause Analysis.*
