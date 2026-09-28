# Forensic Visual & Structural Fidelity Audit: GATE 2025 DA
**Document ID:** `AUDIT-GATE-2025-DA-FIDELITY-001`  
**Date:** September 27, 2026  
**Auditor:** Antigravity Forensic Audit Agent  
**Working Mode:** STRICT READ-ONLY FORENSIC VALIDATION — ZERO CODE MODIFICATIONS  
**Target Paper:** GATE 2025 Data Science & Artificial Intelligence (`gate-2025-da.json`)  
**Official Source QP:** `/Users/shivarampatel/Downloads/GATE 2025/Question Papers/DA/GATE_2025_DA_Question_Paper.pdf`  
**Official Source AK:** `/Users/shivarampatel/Downloads/GATE 2025/Answer Keys/DA/GATE_2025_DA_Answer_Key.pdf`  
**Application Server:** `http://localhost:4173/` (Vite Production Preview)  

---

## A. Executive Summary

This independent forensic audit was conducted to strictly evaluate the actual, live visual fidelity and structural data integrity of the **GATE 2025 DA** paper following recent content-model and ingestion pipeline changes. Per strict operating constraints, **no application code or dataset files were altered during this audit**.

### Verification of Previously Observed Defects
1. **GATE 2025 DA Q3 (4×4 Pixel Matrix):** **VERIFIED FIXED.**
   - The double-rendering defect has been completely resolved. The active exam UI renders exactly **one** 4×4 pixel matrix.
   - The opening sentence (*"A 4 × 4 digital image has pixel intensities (U) as shown in the figure. The number of pixels with U ≤ 4 is:"*) is fully preserved and displayed above the figure. KaTeX math symbols render properly.
2. **GATE 2025 DA Q4 (Venn Geometry Diagram Labels):** **VERIFIED FIXED.**
   - Diagram-internal labels (*"2 R"*, *"4 Q 1 P"*, *"3"*) no longer leak into the question text.
   - The Diagram Ownership Heuristic correctly expanded the crop boundary to encapsulate all internal labels inside `q4_diag.png`.
   - The standalone question text now consists solely of the author's prompt statement.
3. **GATE 2025 DA Q6 (Matching Table Structure):** **VERIFIED FIXED.**
   - The previous defect where Column-I and Column-II matching statements were flattened into an unreadable continuous paragraph is resolved.
   - A structured two-column HTML table is rendered with clear `Column-I` and `Column-II` headers, distinct rows (P, Q, R, S vs 1, 2, 3, 4), and proper column borders.

### Overall Integrity Metrics
- **Total Questions Audited:** 65 of 65 questions (100%).
- **Answer Key Conformity:** 65 of 65 questions match the official IIT Roorkee Answer Key with **0 discrepancies** (100% accuracy across MCQ single options, MSQ multi-select sets, and NAT numerical tolerance intervals).
- **Marking Scheme Accuracy:** 100% match (30 1-mark questions with -0.33 penalty for MCQs; 35 2-mark questions with -0.66 penalty for MCQs; 0 penalty for MSQs/NATs).
- **Harvested Visual Assets:** Exactly 8 diagram images harvested, perfectly matching the 8 visual questions in the source PDF (0 false positives, 0 missing visuals).
- **Data Duplication:** 0 duplicate URLs, 0 duplicate content blocks, 0 orphaned assets, 0 missing files.
- **Residual Ingestion Defects Identified:** 5 issues documented for subsequent repair (Q9 math power syntax, Q31 horizontal fraction extraction, Q43 undelimited LaTeX in options, soft line-wrap hyphens in 6 questions, minor layout border in Q10 crop).

---

## B. Source vs Generated Data Audit (65 Questions)

A systematic verification of all 65 questions in `web/src/data/exams/gate-2025-da.json` against `GATE_2025_DA_Question_Paper.pdf` and `GATE_2025_DA_Answer_Key.pdf` was executed.

### Question Inventory & Classification Matrix

| Q# | Section | Type | Marks | Neg Marks | Visual / Structural Elements | Official AK Key / Range | JSON Correct Answer | Status |
|:---|:---|:---:|:---:|:---:|:---|:---|:---|:---:|
| **Q1** | GA | MCQ | 1.0 | -0.33 | Text | C | C | MATCH |
| **Q2** | GA | MCQ | 1.0 | -0.33 | Text | B | B | MATCH |
| **Q3** | GA | MCQ | 1.0 | -0.33 | Diagram (`q3_diag.png`) | B | B | MATCH |
| **Q4** | GA | MCQ | 1.0 | -0.33 | Diagram (`q4_diag.png`) | A | A | MATCH |
| **Q5** | GA | MCQ | 1.0 | -0.33 | Text | A | A | MATCH |
| **Q6** | GA | MCQ | 2.0 | -0.66 | Table (`Column-I` / `Column-II`) | C | C | MATCH |
| **Q7** | GA | MCQ | 2.0 | -0.66 | Text | B | B | MATCH |
| **Q8** | GA | MCQ | 2.0 | -0.66 | Diagram (`q8_diag.png`) | C | C | MATCH |
| **Q9** | GA | MCQ | 2.0 | -0.66 | Math Formulas | A | A | MATCH |
| **Q10** | GA | MCQ | 2.0 | -0.66 | Diagram (`q10_diag.png` Bar Chart) | B | B | MATCH |
| **Q11** | DA | MCQ | 1.0 | -0.33 | Math | A | A | MATCH |
| **Q12** | DA | MCQ | 1.0 | -0.33 | Text | C | C | MATCH |
| **Q13** | DA | MCQ | 1.0 | -0.33 | Math | A | A | MATCH |
| **Q14** | DA | MCQ | 1.0 | -0.33 | Text | A | A | MATCH |
| **Q15** | DA | MCQ | 1.0 | -0.33 | Math | B | B | MATCH |
| **Q16** | DA | MCQ | 1.0 | -0.33 | Text | C | C | MATCH |
| **Q17** | DA | MCQ | 1.0 | -0.33 | Math | C | C | MATCH |
| **Q18** | DA | MCQ | 1.0 | -0.33 | Math | B | B | MATCH |
| **Q19** | DA | MCQ | 1.0 | -0.33 | Math | B | B | MATCH |
| **Q20** | DA | MCQ | 1.0 | -0.33 | Math | A | A | MATCH |
| **Q21** | DA | MCQ | 1.0 | -0.33 | Text | C | C | MATCH |
| **Q22** | DA | MCQ | 1.0 | -0.33 | Text | D | D | MATCH |
| **Q23** | DA | MCQ | 1.0 | -0.33 | Text | D | D | MATCH |
| **Q24** | DA | MCQ | 1.0 | -0.33 | Math | C | C | MATCH |
| **Q25** | DA | MSQ | 1.0 | 0.0 | Text | B;C | B;C | MATCH |
| **Q26** | DA | MSQ | 1.0 | 0.0 | Text | C;D | C;D | MATCH |
| **Q27** | DA | MSQ | 1.0 | 0.0 | Text | B;C | B;C | MATCH |
| **Q28** | DA | MSQ | 1.0 | 0.0 | Text | A;C | A;C | MATCH |
| **Q29** | DA | MSQ | 1.0 | 0.0 | Text | B;D | B;D | MATCH |
| **Q30** | DA | MSQ | 1.0 | 0.0 | Text | B;D | B;D | MATCH |
| **Q31** | DA | NAT | 1.0 | 0.0 | Math | 0.25 to 0.25 | 0.25 to 0.25 | MATCH |
| **Q32** | DA | NAT | 1.0 | 0.0 | Math | 0.5 to 0.5 | 0.5 to 0.5 | MATCH |
| **Q33** | DA | NAT | 1.0 | 0.0 | Math | 3.0 to 3.0 | 3.0 to 3.0 | MATCH |
| **Q34** | DA | NAT | 1.0 | 0.0 | Math | 0.285 to 0.287 | 0.285 to 0.287 | MATCH |
| **Q35** | DA | NAT | 1.0 | 0.0 | Math | 0.39 to 0.41 | 0.39 to 0.41 | MATCH |
| **Q36** | DA | MCQ | 2.0 | -0.66 | Math | C | C | MATCH |
| **Q37** | DA | MCQ | 2.0 | -0.66 | Math | B | B | MATCH |
| **Q38** | DA | MCQ | 2.0 | -0.66 | Math | A | A | MATCH |
| **Q39** | DA | MCQ | 2.0 | -0.66 | Math | B | B | MATCH |
| **Q40** | DA | MCQ | 2.0 | -0.66 | Math | B | B | MATCH |
| **Q41** | DA | MCQ | 2.0 | -0.66 | Math | A | A | MATCH |
| **Q42** | DA | MCQ | 2.0 | -0.66 | Diagram (`q42_diag.png`) | C | C | MATCH |
| **Q43** | DA | MCQ | 2.0 | -0.66 | Diagram (`q43_diag.png`) | B | B | MATCH |
| **Q44** | DA | MCQ | 2.0 | -0.66 | Diagram (`q44_diag.png`) | D | D | MATCH |
| **Q45** | DA | MCQ | 2.0 | -0.66 | Math | A | A | MATCH |
| **Q46** | DA | MCQ | 2.0 | -0.66 | Math | A | A | MATCH |
| **Q47** | DA | MSQ | 2.0 | 0.0 | Math | A;B;D | A;B;D | MATCH |
| **Q48** | DA | MSQ | 2.0 | 0.0 | Math | A;C | A;C | MATCH |
| **Q49** | DA | MSQ | 2.0 | 0.0 | Math | A;C;D | A;C;D | MATCH |
| **Q50** | DA | MSQ | 2.0 | 0.0 | Math | A;B;D | A;B;D | MATCH |
| **Q51** | DA | MSQ | 2.0 | 0.0 | Math | A;B | A;B | MATCH |
| **Q52** | DA | MSQ | 2.0 | 0.0 | Math | B;C | B;C | MATCH |
| **Q53** | DA | MSQ | 2.0 | 0.0 | Text | B;C | B;C | MATCH |
| **Q54** | DA | MSQ | 2.0 | 0.0 | Math | A;B;C | A;B;C | MATCH |
| **Q55** | DA | MSQ | 2.0 | 0.0 | Math | A;D | A;D | MATCH |
| **Q56** | DA | MSQ | 2.0 | 0.0 | Math | B;D | B;D | MATCH |
| **Q57** | DA | MSQ | 2.0 | 0.0 | Math | A;B;D | A;B;D | MATCH |
| **Q58** | DA | MSQ | 2.0 | 0.0 | Diagram (`q58_diag.png`) | A;B | A;B | MATCH |
| **Q59** | DA | NAT | 2.0 | 0.0 | Math | 0.0 to 0.0 | 0.0 to 0.0 | MATCH |
| **Q60** | DA | NAT | 2.0 | 0.0 | Math | 100.0 to 100.0 | 100.0 to 100.0 | MATCH |
| **Q61** | DA | NAT | 2.0 | 0.0 | Math | 66.6 to 66.7 | 66.6 to 66.7 | MATCH |
| **Q62** | DA | NAT | 2.0 | 0.0 | Math | 1.0 to 1.0 | 1.0 to 1.0 | MATCH |
| **Q63** | DA | NAT | 2.0 | 0.0 | Math | 160.0 to 160.0 | 160.0 to 160.0 | MATCH |
| **Q64** | DA | NAT | 2.0 | 0.0 | Code / Pseudocode | 6.0 to 6.0 | 6.0 to 6.0 | MATCH |
| **Q65** | DA | NAT | 2.0 | 0.0 | Math | 10.0 to 10.0 | 10.0 to 10.0 | MATCH |

**Result:** **65 / 65 Questions Matched (100%)**.

---

## C. Visual Asset Harvest Audit (Every Image)

A thorough scan of all 34 pages of `GATE_2025_DA_Question_Paper.pdf` revealed that exactly **8 questions** contain graphical drawings or charts. Exactly 8 images were extracted into `web/public/exam-assets/gate/2025/da/`. Each asset was inspected directly.

### Visual Asset Inspection Log

| Asset File | Resolution | Source Page | Visual Content Description | Diagram Labels In Image? | Cropped / Missing Lines? | Non-diagram Clutter / Watermarks? | Forensic Assessment |
|:---|:---:|:---:|:---|:---:|:---:|:---:|:---:|
| `q3_diag.png` | 286 × 289 | Page 3 | 4×4 pixel intensity grid with 16 numerical values | YES (All 16 numbers inside grid) | NO (All border grid lines intact) | NONE (Clean white background) | **VERIFIED** |
| `q4_diag.png` | 890 × 635 | Page 3 | Venn-style geometric overlap (Rectangle, Triangle, Ellipse) | YES (`1`, `2`, `3`, `4`, `P`, `Q`, `R`) | NO (Apex of triangle & curves intact) | NONE (Watermark neutralized) | **VERIFIED** |
| `q8_diag.png` | 444 × 439 | Page 5 | 12-sided dodecagon inscribed in dashed circle | YES (Triangles `1`–`12`, label `$d$`) | NO (All dashed arcs & vertices intact) | NONE (Clean background) | **VERIFIED** |
| `q10_diag.png` | 1070 × 660 | Page 6 | Bar chart: Number of shifts vs patients per shift | YES (Y-axis 0–50, X-axis 5–8, bars 20, 40, 30, 10) | NO (Full axes, labels, and bars intact) | MINOR (Faint vertical line at left edge, $x=72$, from PDF table grid) | **PARTIALLY VERIFIED** |
| `q42_diag.png` | 735 × 276 | Page 22 | Neural network graph: input nodes $u, v$, hidden/output ReLU units $R$, weights $a$–$f$ | YES (Inputs $u, v$, weights $a$–$f$, units $R$, output wire $y$) | NO (All circular nodes, arrows, weights intact) | NONE (Prompt text excluded from crop) | **VERIFIED** |
| `q43_diag.png` | 895 × 410 | Page 23 | Alpha-Beta Game Trees (Tree-1 and Tree-2) | YES (`MAX`, `MIN`, nodes `A`–`E`, values `1, 2, 5, x, y`, subtitles `Tree-1`, `Tree-2`) | NO (Pruned branch dashes & triangles intact) | NONE (Prompt text excluded) | **VERIFIED** |
| `q44_diag.png` | 1004 × 424 | Page 24 | A* Search State Graph with edge costs and heuristic boxes | YES (Nodes $S, A, B, C, D, G$, edge weights, $h(n)$ heuristic tables) | NO (Directed arrows and rectangular tags intact) | NONE (Clean) | **VERIFIED** |
| `q58_diag.png` | 557 × 251 | Page 30 | Undirected weighted graph with 8 vertices | YES (Vertices $a, b, c, d, e, f, g, h$, edge weights) | NO (All undirected edges intact) | NONE (Clean) | **VERIFIED** |

- **Missing Visual Assets:** 0.
- **Unintended Extra/False Visuals:** 0.

---

## D. Rendered UI Audit (Live Browser Screenshots)

Using Playwright headless browser testing at 1440×900 against `http://localhost:4173/`, actual DOM viewports were captured and verified.

### 1. Question 3 (`gate_2025_da_q3_rendered.png`)
- **Inspection:** Exactly one 4×4 pixel matrix diagram is displayed within an interactive zoom container.
- **Prompt:** Full text *"A 4 × 4 digital image has pixel intensities (U) as shown in the figure. The number of pixels with U ≤ 4 is:"* is rendered above the figure. KaTeX math symbols render crisply.
- **Options:** Options A (3), B (8), C (11), D (9) are rendered cleanly.
- **Double Rendering:** **0 instances.** Deduplication confirmed.

### 2. Question 4 (`gate_2025_da_q4_rendered.png`)
- **Inspection:** Venn diagram figure displays properly with all internal numbers (`1, 2, 3, 4`) and region identifiers (`P, Q, R`).
- **Prompt:** Standalone prompt is clean: *"In the given figure, the numbers associated with the rectangle, triangle, and ellipse are 1, 2, and 3, respectively. Which one among the given options is the most appropriate combination of P, Q, and R ?"*
- **Orphaned Labels:** Leaked labels *"2 R"*, *"4 Q 1 P"*, and *"3"* have been completely removed from the text container.

### 3. Question 6 (`gate_2025_da_q6_rendered.png`)
- **Inspection:** Matching question renders as an authentic two-column table.
- **Headers:** Clear headers for `Column-I` and `Column-II`.
- **Rows:** 4 matching rows cleanly separated by row dividers. No flattened paragraph text.
- **Options:** 4 distinct permutation choices rendered below the table.

### 4. Question 8 (`gate_2025_da_q8_rendered.png`)
- **Inspection:** Geometry diagram renders cleanly. Dodecagon inscribed in dashed circle is sharp.
- **Prompt:** Representative figure disclaimer (*"Note: The figure shown is representative."*) is properly placed in the prompt text.
- **Options:** Choices rendered cleanly.

### 5. Question 9 (`gate_2025_da_q9_rendered.png`)
- **Inspection:** Options $2^{-1}, 2^0, 2^3, 2^{15}$ render via KaTeX.
- **Defect Noted:** The equation in the prompt displays as `3^{x2}= 27 \times 9^{x}` in plain text because it lacks LaTeX math delimiters (`$`), and uses `x2` instead of `x^2`. Furthermore, $\frac{2^{x^2}}{(2^x)^2}$ is written as `\frac{2^{x2}}{(2x)^2}`.

### 6. Question 10 (`gate_2025_da_q10_rendered.png`)
- **Inspection:** Bar chart renders as a visual diagram block rather than a garbled table. Axis labels and bar heights are legible.
- **Observation:** A thin border line exists on the leftmost edge of the image crop ($x=72$).

### 7. Question 42 (`gate_2025_da_q42_rendered.png`)
- **Inspection:** Neural network architecture graph displays clearly.
- **Math Options:** Partial derivatives $\frac{\partial y}{\partial a}$ and $\frac{\partial y}{\partial f}$ render via KaTeX in each option.
- **Prompt:** Output label $y$ and weight designations are not leaked as stray lines.

### 8. Question 43 (`gate_2025_da_q43_rendered.png`)
- **Inspection:** Alpha-beta game trees (Tree-1 and Tree-2) render with all node labels and utility numbers.
- **Defect Noted:** Options display literal LaTeX code like `x \in [1, \infty ) and y \in (- \infty , 2]` without KaTeX math formatting due to missing math delimiters in `options` JSON array.

---

## E. Diagram Ownership Heuristic Evaluation

The Diagram Ownership Heuristic in `scripts/gate_forensic_pipeline.py` governs the decision boundary between diagram-internal labels and standalone prompt text.

### Heuristic Architecture
1. **Initial Seed:** Detects vector drawing bounding boxes (`prompt_drws`) and image rects (`prompt_imgs`) within the prompt area.
2. **Iterative Expansion Loop:**
   - Evaluates adjacent text lines in PDF text dict within vertical and horizontal proximity thresholds.
   - **Exclusion Filters:** Disqualifies lines containing prompt anchor keywords (`which one`, `consider`, `given `, `suppose`, `what is`, `the value of`, `for what ranges`, `denotes the`) or length $> 40$ characters.
   - **Absorption Conditions:**
     - Side/interior labels: Vertically inside bounds and within 50px horizontally (e.g. `MAX`, `MIN`, `y`).
     - Bottom captions: Within 15px below bounds with $> 10\text{px}$ horizontal overlap (e.g. `Tree-1`, `Tree-2`).
     - Top labels: Within 10px above bounds with horizontal indentation.
3. **Line Collection Filter:** Any line intersecting or contained within `diagram_crop_rect` is omitted from `questionText`.

### Test on 10 Edge Cases with Diagrams/Structures

| Q# | Expected Diagram Content | Resulting Prompt Content | Decision Made | Verdict |
|:---:|:---|:---|:---|:---:|
| **Q3** | 16 pixel intensity numbers | Opening sentence & question prompt | Internal matrix numbers absorbed into image crop | **PASS** |
| **Q4** | Labels 1, 2, 3, 4, P, Q, R | Geometric shape prompt | Diagram labels absorbed into image crop | **PASS** |
| **Q8** | Numbers 1–12, side length $d$ | Inscribed dodecagon description & Note | Figure numbers absorbed; representative note kept in prompt | **PASS** |
| **Q10** | Axis labels, bar values 20, 40, 30, 10 | Patient consultation count & Note | Chart text absorbed; question statement and note kept in prompt | **PASS** |
| **Q42** | Input/weight/unit labels $u, v, a-f, R, y$ | Network specification & given values | Graph wiring labels absorbed into crop; parameter assignments kept in prompt | **PASS** |
| **Q43** | `MAX`, `MIN`, `Tree-1`, `Tree-2`, node tags | Game tree description & alpha-beta prompt | Tree levels and captions absorbed into crop; problem statement kept in prompt | **PASS** |
| **Q44** | Nodes $S, A, B, C, D, G$, costs, $h(n)$ tables | Search problem statement | State graph annotations absorbed into crop; prompt kept in prompt | **PASS** |
| **Q58** | Vertices $a$–$h$, edge weights | Undirected graph statement | Graph topology absorbed into crop; question text kept in prompt | **PASS** |
| **Q6** | Table (`Column-I` / `Column-II`) | Statement matching prompt | Identified as genuine table block; no diagram cropped | **PASS** |
| **Q64** | Indented pseudocode block | Stack operations problem statement | Identified as pseudocode block; no diagram cropped | **PASS** |

### Test on 10 Negative Control Questions (No Diagram in PDF)

| Q# | Topic | Source PDF Visual Presence | JSON `diagramUrl` | JSON `contentBlocks` Types | Text Swallowed? | Verdict |
|:---:|:---|:---:|:---:|:---:|:---:|:---:|
| **Q1** | GA English Analogy | NONE | `null` | `['text']` | NO (Full prompt & 4 options retained) | **PASS** |
| **Q2** | GA English Grammar | NONE | `null` | `['text']` | NO (Full prompt & 4 options retained) | **PASS** |
| **Q5** | GA Rectangle Geometry (Textual) | NONE | `null` | `['text']` | NO (Full prompt & 4 options retained) | **PASS** |
| **Q7** | GA Person Weight Function | NONE | `null` | `['text']` | NO (Full prompt & 4 options retained) | **PASS** |
| **Q9** | GA Exponent Algebra | NONE | `null` | `['text']` | NO (Full prompt & 4 options retained) | **PASS** |
| **Q11** | DA Conditional Expectation | NONE | `null` | `['text']` | NO (Full prompt & 4 options retained) | **PASS** |
| **Q12** | DA Gaussian Elimination | NONE | `null` | `['text']` | NO (Full prompt & 4 options retained) | **PASS** |
| **Q15** | DA Propositional Logic | NONE | `null` | `['text']` | NO (Full prompt & 4 options retained) | **PASS** |
| **Q20** | DA Standard Normal Variable | NONE | `null` | `['text']` | NO (Full prompt & 4 options retained) | **PASS** |
| **Q25** | DA Multi-Select Concept | NONE | `null` | `['text']` | NO (Full prompt & 4 options retained) | **PASS** |

**Conclusion:** The Diagram Ownership Heuristic correctly classified all 20 cases. It introduces zero false-positive diagram harvests and does not swallow question prompts or options.

---

## F. Renderer Duplication Audit Matrix

Every code path in the Mock.AI front-end that can render question visual assets was audited.

| Screen / Component | File Location | Rendering Path | Deduplication Mechanism | Verified No Double Render? |
|:---|:---|:---|:---|:---:|
| **Competitive Exam Player** | `CompetitiveExamPlayerScreen.tsx:887-917` | `StructuredContentRenderer` + Standalone fallback `ExamAsset` | `contentBlockAssetUrls = new Set(...)`; filters `unrenderedDiagramUrls = diagramUrls.filter(!contentBlockAssetUrls.has(url))` | **YES (Verified)** |
| **Competitive Exam Results** | `CompetitiveExamResultsScreen.tsx:796-826` | `StructuredContentRenderer` + Standalone fallback `ExamAsset` | `contentBlockAssetUrls = new Set(...)`; filters `unrenderedDiagramUrls = diagramUrls.filter(!contentBlockAssetUrls.has(url))` | **YES (Verified)** |
| **Structured Content Renderer** | `StructuredContentRenderer.tsx:239-250` | `MixedContentRenderer` processes blocks sequentially | Case `'diagram'` and `'image'` dispatch exclusively to `ImageRenderer`; ignores `diagramUrl` prop | **YES (Verified)** |
| **Test Player (Practice Mode)** | `TestPlayerScreen.tsx:278-285` | `LatexRenderer` | Practice questions use `Question` model without `contentBlocks`; no competitive diagram rendering path | **N/A (Practice Only)** |
| **Results Screen (Practice Mode)**| `ResultsScreen.tsx` | Standard card list | Practice question model; no competitive exam asset collisions | **N/A (Practice Only)** |
| **Review Screen (Practice Mode)** | `ReviewScreen.tsx` | Standard review card | Practice question model; no competitive exam asset collisions | **N/A (Practice Only)** |
| **Exam Asset Component** | `ExamAsset.tsx` | Renders `<img />` with zoom modal and error fallback | Pure presentation leaf component; does not trigger duplicate renders | **YES (Verified)** |

**Architectural Assessment:** Deduplication is implemented structurally at the data-contract and container boundary. Both `CompetitiveExamPlayerScreen` and `CompetitiveExamResultsScreen` construct a `Set` of all image URLs declared in `contentBlocks` and filter standalone `diagramUrls` to zero when already represented in structured blocks.

---

## G. Data Duplication Findings

A full programmatic audit of `web/src/data/exams/gate-2025-da.json` against `web/public/exam-assets/gate/2025/da/` produced the following metrics:

- **Total Questions in Dataset:** 65
- **Questions with Duplicate URLs in `diagramUrls`:** 0
- **Duplicate Content Blocks:** 0
- **Referenced Visual Assets in JSON:** 8
- **Visual Assets on Disk:** 8
- **Missing Visual Assets (in JSON, not on disk):** 0
- **Orphaned Visual Assets (on disk, not referenced in JSON):** 0

---

## H. Automated Test Quality Audit

An analysis of `web/src/data/exams/gateForensicFidelity.test.ts` was performed.

### Classification of the 15 Automated Tests

| Test Suite / Description | Line Range | Classification Category | Forensic Evaluation |
|:---|:---:|:---:|:---|
| `should have 65 questions and complete paper metadata` | L5–L9 | **Category A (Shallow JSON)** | Only asserts metadata lengths and string codes. |
| `Q3: should retain the complete prompt without dropping first sentence` | L14–L18 | **Category B (Source-vs-Output)** | Verifies full prompt presence against regression. |
| `Q3: should have exactly one visual diagram block in contentBlocks` | L20–L24 | **Category A (Shallow JSON)** | Asserts block array count equals 1. |
| `Q3: should have matching diagramUrl metadata matching contentBlock` | L26–L28 | **Category A (Shallow JSON)** | Asserts URL string equality. |
| `Q3: should have exactly 4 valid options` | L30–L32 | **Category B (Source-vs-Output)** | Asserts exact option array match `['3', '8', '11', '9']`. |
| `Q4: should not leak internal figure labels into questionText` | L38–L46 | **Category B (Source-vs-Output)** | Checks absence of `"2 R"`, `"4 Q 1 P"`, `"3"`, asserts exact prompt. |
| `Q4: should have exactly one diagram block in contentBlocks` | L48–L52 | **Category A (Shallow JSON)** | Asserts block array count equals 1. |
| `Q4: should have exactly 4 valid options` | L54–L57 | **Category B (Source-vs-Output)** | Asserts option count and option string match. |
| `Q6: should have a structured table block with Column-I and Column-II` | L63–L71 | **Category B (Source-vs-Output)** | Verifies table headers and exact cell contents. |
| `Q6: should have 4 distinct matching options` | L73–L80 | **Category B (Source-vs-Output)** | Verifies all 4 permutation options match PDF. |
| `Q10: should classify bar chart as diagram, not table` | L86–L94 | **Category B (Source-vs-Output)** | Verifies semantic classification (diagram vs table). |
| `Q10: should have full prompt text without chart labels leaked` | L96–L99 | **Category B (Source-vs-Output)** | Verifies prompt and representative note retention. |
| `Q42: should not leak output node label y into standalone prompt` | L106–L109 | **Category B (Source-vs-Output)** | Verifies label absorption. |
| `Q42: should reconstruct partial derivative fraction options` | L111–L114 | **Category B (Source-vs-Output)** | Verifies math fraction syntax reconstruction. |
| `Q43: should absorb MAX, MIN, and Tree titles into diagram` | L116–L120 | **Category B (Source-vs-Output)** | Verifies label and title absorption. |

### Summary Breakdown
- **Category A (JSON Structure / Shallow):** 4 tests (**26.7%**)
- **Category B (Source-vs-Output Fidelity / Meaningful):** 11 tests (**73.3%**)
- **Category C (Rendered UI Behavior in DOM / Deep):** 0 tests (**0.0%**)

> [!NOTE]
> `gateForensicFidelity.test.ts` operates exclusively on in-memory JSON data. Live DOM rendering and deduplication behavior are exercised separately in `CompetitiveExamFlow.test.tsx` and via Playwright browser verification.

---

## I. Defects Found

Per instructions, **none of these defects have been modified or patched**. They are cataloged below for prioritized resolution in the next engineering pass.

| Defect ID | Question # | Source PDF Page | Affected JSON Field / Asset | Observed Phenomenon | Root Cause | Severity |
|:---|:---:|:---:|:---|:---|:---|:---:|
| **DEF-001** | **Q9** | Page 5 | `questionText` | Prompt displays `3^{x2}= 27 \times 9^{x}` as plain text; fraction displayed as `\frac{2^{x2}}{(2x)^2}` | Missing LaTeX math delimiters (`$`) and dropped exponent power markers (`x2` vs $x^2$, $(2x)^2$ vs $(2^x)^2$). | **Medium** |
| **DEF-002** | **Q31** | Page 16 | `questionText` | Prompt reads: *"choos- ing Box-1 is1 2, Box-2 is 1 6, and Box-3 is 1 3."* | Horizontal fraction bar was not detected by text extractor, producing concatenated digits `1 2`, `1 6`, `1 3` instead of $\frac{1}{2}$, $\frac{1}{6}$, $\frac{1}{3}$. | **High** |
| **DEF-003** | **Q43** | Page 23 | `options` | Options render literal LaTeX commands e.g. `x \in [1, \infty ) and y \in (- \infty , 2]` in the UI. | Options array strings lack LaTeX math delimiters (`$`), preventing KaTeX from rendering $\in$ and $\infty$. | **Medium** |
| **DEF-004** | **Q12, Q16, Q24, Q31, Q44, Q65** | Pages 8, 10, 13, 16, 24, 34 | `questionText` | Words split across line breaks in PDF retain hyphens: `elimina- tion`, `depen- dencies`, `differen- tiable`, `choos- ing`, `asso- ciated`, `per- formed`. | Ingestion pipeline does not de-hyphenate words broken across PDF line wraps. | **Low** |
| **DEF-005** | **Q10** | Page 6 | `web/public/exam-assets/gate/2025/da/q10_diag.png` | Faint vertical line visible along left edge of image ($x=72$). | Bounding box crop for bar chart included the adjacent left border line of the PDF layout table. | **Low** |

---

## J. Regressions vs Improvements

### Improvements Confirmed
1. **Q3 Duplication Completely Eliminated:** The double-rendered matrix observed in previous screenshots is gone.
2. **Q3 Opening Prompt Restored:** The missing opening sentence is fully restored.
3. **Q4 Diagram Label Leakage Fixed:** Stray strings `"2 R"`, `"4 Q 1 P"`, and `"3"` are completely removed from the prompt.
4. **Q6 Tabular Presentation Restored:** Column-I / Column-II matching data renders as a clean HTML table.
5. **Answer Key Parity:** 100% agreement with IIT Roorkee official key across all 65 questions.

### Regressions
- **Zero regressions detected.** Existing test suites (34 test files, 268 tests) pass without failure, and the Vite production build compiles with zero errors.

---

## K. Independent Verdict per Area

| Audit Area | Independent Classification | Justification |
|:---|:---:|:---|
| **1. Source vs Generated Data (65 Qs)** | **VERIFIED** | 100% conformity with official Answer Key; question types, marks, and negative marks are exact. |
| **2. Visual Asset Harvest** | **VERIFIED** | Exactly 8 diagrams harvested from 8 graphical questions in PDF; 0 false positives, 0 missing visuals. |
| **3. Rendered UI (Q3, Q4, Q6)** | **VERIFIED** | Browser screenshots prove deduplication, label absorption, and tabular presentation are fully functioning. |
| **4. Ingestion Math & Fraction Fidelity** | **PARTIALLY VERIFIED** | Q31 has dropped horizontal fraction lines (`1 2` vs $\frac{1}{2}$); Q9 has exponent syntax errors; Q43 has undelimited option math. |
| **5. Diagram Ownership Heuristic** | **VERIFIED** | Correctly segments figure labels without dropping question prompts across 10 edge cases and 10 control questions. |
| **6. Renderer Deduplication Matrix** | **VERIFIED** | Structural Set-based URL deduplication verified in both `CompetitiveExamPlayerScreen` and `CompetitiveExamResultsScreen`. |
| **7. Data Duplication Audit** | **VERIFIED** | 0 duplicate URLs, 0 duplicate blocks, 0 orphaned assets, 0 missing files. |
| **8. Automated Test Quality** | **PARTIALLY VERIFIED** | Tests strongly verify source-vs-output fidelity (73.3%), but operate on JSON objects in memory rather than real DOM nodes. |
| **OVERALL SYSTEM VERDICT** | **PARTIALLY VERIFIED** | Core P0 visual duplication defects are verified fixed. Ingestion pipeline has minor residual math/fraction defects that require a targeted pipeline enhancement. |

---

## L. Next Actions (Strictly Prioritized — Do Not Fix Yet)

1. **Priority 1 (High): Fix In-Line Horizontal Fraction Extraction (`scripts/gate_forensic_pipeline.py`)**
   - Enhance `detect_fractions_and_underlines()` to detect isolated fraction lines within running prose blocks to resolve Q31 ($\frac{1}{2}, \frac{1}{6}, \frac{1}{3}$).
2. **Priority 2 (Medium): Fix Exponent Reconstruction for Standalone Equations**
   - Repair superscript extraction in `extract_rich_line()` for Q9 so that $3^{x^2} = 27 \times 9^x$ and $\frac{2^{x^2}}{(2^x)^2}$ receive proper LaTeX wrapping.
3. **Priority 3 (Medium): Delimit Mathematical Options**
   - Update `parse_option_block()` to automatically wrap options containing mathematical symbols ($\in$, $\infty$, $\le$, $\ge$) in `\(` ... `\)` or `$`.
4. **Priority 4 (Low): Add PDF Line-Break De-Hyphenation**
   - Implement regex replacement `r'(\b[a-zA-Z]{3,})-\s+([a-zA-Z]{3,}\b)' -> r'\1\2'` for words broken across lines.
5. **Priority 5 (Low): Inset Q10 Left Crop Boundary**
   - Adjust Q10 crop rect by $+2\text{px}$ on $x_0$ to exclude the table border line.

---

## M. Verification Sign-Off

- **Audit Completion Timestamp:** 2026-09-27T16:15:00+05:30  
- **Test Suite Status:** 34 / 34 test files passed, 268 / 268 tests passed (100%)  
- **Build Status:** Vite v6.4.1 Production Build Succeeded (zero TypeScript errors)  
- **Audit Tooling:** Playwright v1.50, PyMuPDF v1.25.3, Chromium Headless  
- **Sign-Off Assessment:** The core visual fidelity issues (Q3 matrix duplication, Q4 label leakage, Q6 table flattening) are **definitively resolved in the active UI**. A small set of math/fraction ingestion defects remains and is fully documented above.
