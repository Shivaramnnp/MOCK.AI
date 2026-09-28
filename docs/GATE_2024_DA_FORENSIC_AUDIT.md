# GATE 2024 DA — Complete Forensic Fidelity Audit
## Data Science & Artificial Intelligence (DA) | IISc Bengaluru

---

## 1. Executive Summary & Source-of-Truth Authority

An exhaustive, forensic fidelity audit of the **GATE 2024 Data Science & Artificial Intelligence (DA)** paper was conducted against official IISc Bengaluru source files.

### Authoritative Master Source Files
* **Official Question Paper PDF:**
  * Path: `/Users/shivarampatel/Downloads/GATE 2024/Question Papers/DA/GATE_2024_DA_Question_Paper.pdf`
  * Pages: 41
  * SHA-256: `8ba7f11014fc63413961cde0592da1ac67babf0bb0b488db33b5b86ade1db27b`
* **Official Answer Key PDF:**
  * Path: `/Users/shivarampatel/Downloads/GATE 2024/Answer Keys/DA/GATE_2024_DA_Answer_Key.pdf`
  * Pages: 2
  * SHA-256: `3dc72f5afde9eb2e87607c98d9e057a61ccd9ff798b6fe1ad831d1cee3cdb69d`
* **Target Ingestion Data:**
  * Path: `web/src/data/exams/gate-2024-da.json`
  * Total Questions: 65 (100% complete)

### Audit Metrics
| Metric | Expected Value | Audited Value | Status |
| :--- | :--- | :--- | :--- |
| Total Questions | 65 | 65 | VERIFIED |
| General Aptitude (GA) Questions | 10 (Q1–Q10) | 10 (Q1–Q10) | VERIFIED |
| Subject-Specific (DA) Questions | 55 (Q11–Q65) | 55 (Q11–Q65) | VERIFIED |
| Multiple Choice Questions (MCQ) | Official Key match | 37 | VERIFIED |
| Multiple Select Questions (MSQ) | Official Key match | 7 | VERIFIED |
| Numerical Answer Type (NAT) | Official Key match | 21 | VERIFIED |
| Total Visual Assets Extracted | 16 | 16 | VERIFIED |
| Automated Boundary Checks Passed | 10 / 10 | 10 / 10 | VERIFIED |

---

## 2. 10-Point Automated Question Boundary Validation

The forensic ingestion pipeline executes a 10-point automated boundary and structural validation suite across all 65 questions:

| # | Validation Dimension | Check Description | Result |
| :--- | :--- | :--- | :--- |
| 1 | **Sequential Question Numbers** | Questions 1 through 65 strictly sequential with zero missing or duplicate IDs | PASS (1–65) |
| 2 | **No Next-Question Leak** | Question stems do not leak text or headers from subsequent questions | PASS |
| 3 | **No Adjacent Stem Bleed** | Option text does not bleed into subsequent prompt stems across page breaks | PASS |
| 4 | **Option Boundary Integrity** | MCQs and MSQs have exactly 4 options; NATs have 0 options | PASS |
| 5 | **Official Answer Key Match** | 100% semantic agreement with IISc Bengaluru master answer key | PASS |
| 6 | **Range Header Cleanliness** | Stripped all "Q.1 – Q.5 carry 1 mark each" exam metadata from stems | PASS |
| 7 | **Option Non-Emptiness** | Zero empty string options across all 44 MCQ/MSQ questions | PASS (0 empty) |
| 8 | **Math Delimiter Balance** | Strict `\(` / `\)` and `$$` delimiter balance across all stems and options | PASS |
| 9 | **Watermark Cleanliness** | IISc organizing institute page watermarks neutralized | PASS |
| 10 | **Visual Asset Integrity** | All 16 referenced PNG assets exist on disk with valid dimensions & SHA256 | PASS |

---

## 3. High-Fidelity Forensic Targets & Diagnostics

### 3.1 Q4 — Infinite Series Mathematical Fidelity
* **Source Problem:** The prompt contains an infinite geometric/harmonic sub-series:
  $$2 + \frac{1}{2} + \frac{1}{3} + \frac{1}{4} + \frac{1}{8} + \frac{1}{9} + \frac{1}{16} + \frac{1}{27} + \dots$$
* **Pipeline Defect:** In earlier ingestions, denominators shared horizontal baselines, causing a naive "running text underline" heuristic to kill fractions $1/4$, $1/8$, and $1/9$, flattening them into detached numbers (`1 4 + 1 8 + 1 9`).
* **Forensic Repair:** Enforced tight vertical bounds (`abs(w[3] - hl.y0) < 6.0` and `abs(w[1] - hl.y1) < 6.0`) and added multi-fraction co-occurrence recognition for series equations. Denominators $16$ and $27$ exponent regex corruption was eliminated.
* **Verification:** All 7 fractions ($\frac{1}{2}, \frac{1}{3}, \frac{1}{4}, \frac{1}{8}, \frac{1}{9}, \frac{1}{16}, \frac{1}{27}$) render cleanly. Options `['11/3', '7/2', '13/4', '9/2']` are intact.

### 3.2 Q9 — Dice Net Visual Single-Ownership
* **Source Problem:** Question displays 3 views of a dice in the stem, and 4 unfolded nets as options A, B, C, D.
* **Pipeline Defect:** Conflicting visual ownership caused option figures to be duplicated in prompt diagram blocks or rendered twice.
* **Forensic Repair:** Enforced Single-Ownership Asset Model:
  * Prompt diagram URL: `/exam-assets/gate/2024/da/q9_diag.png` (508x192)
  * Option images: `q9_opt_a.png`, `q9_opt_b.png`, `q9_opt_c.png`, `q9_opt_d.png`
  * Text options: `['', '', '', '']` with zero double-rendering in exam player.
* **Verification:** Exactly one visual per entity; zero duplication.

### 3.3 Q16 — Structured Table Block vs Flattened Text
* **Source Problem:** Matching question with Column 1 vs Column 2:
  * $(p)$ First In First Out $\leftrightarrow$ $(i)$ Stacks
  * $(q)$ Lookup Operation $\leftrightarrow$ $(ii)$ Queues
  * $(r)$ Last In First Out $\leftrightarrow$ $(iii)$ Hash Tables
* **Pipeline Defect:** Flattened into unstructured text paragraph because single-row matching tables failed multi-row validation heuristics.
* **Forensic Repair:** Added newline-separated item row splitting supporting parenthesized items `(p)` and `(i)`.
* **Verification:** Generates structured `table` block with headers `["Column 1", "Column 2"]` and 3 paired rows.

### 3.4 Q38 & Q41 — Python Code Blocks & Indentation
* **Source Problem:** Questions 38 and 41 contain Python functions (`def count(child_dict, i):` and `def fun(D, s1, s2):`).
* **Pipeline Defect:** Code blocks were flattened or stripped of leading indentation, and prompt outros were discarded.
* **Forensic Repair:** Preserved leading whitespace from PDF font spans and accurately partitioned `intro`, `code_block`, and `outro` using vertical bounding boxes.
* **Verification:** Python indentation (4 spaces) is preserved in `pseudocode` content blocks with complete intro and outro text.

### 3.5 Q55 — Relational Database Schema & Option Extraction
* **Source Problem:** Relational schema with primary keys underlined (`Movie(ID, CustomerRating)`, `Genre(ID, Name)`), SQL query, and 4 indexing options starting with `A`, `B`, `C`, `D` on separate lines.
* **Pipeline Defect:** Option labels formatted as standalone letters `A\n...` failed legacy option regex; `B+` was falsely matched as an option prefix and stripped to `^{+} tree`; primary key underlines were falsely matched as fractions.
* **Forensic Repair:** Updated `OPTION_REGEX` to accept newline-separated option labels; refined option prefix stripping to prevent stripping content characters; added horizontal span boundary check to distinguish text underlines from fractions.
* **Verification:** All 4 options are non-empty and correctly formatted; full question prompt and SQL query are preserved.

---

## 4. Deliverables Index

* **Question Audit Manifest:** `docs/GATE_2024_DA_QUESTION_AUDIT.csv`
* **Visual Asset Manifest:** `docs/GATE_2024_DA_VISUAL_AUDIT.csv`
* **Math Rendering Audit:** `docs/GATE_2024_DA_MATH_AUDIT.md`
* **Forensic Repair Report:** `docs/GATE_2024_DA_REPAIR_REPORT.md`
* **Automated Regression Suite:** `web/src/data/exams/gateForensicFidelity.test.ts`
