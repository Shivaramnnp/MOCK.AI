# GATE 2025 Complete Forensic Fidelity Audit

## 1. Executive Summary & Scope

An exhaustive, forensic fidelity audit of the entire GATE 2025 dataset was conducted against the official IIT Roorkee Question Papers and Answer Keys stored in:
`/Users/shivarampatel/Downloads/GATE 2025`

### Audit Metrics
* **Total Official Source Papers:** 38 papers
* **Total Official PDF Pages:** 1,722 pages
* **Total Expected Questions:** 2,672 questions
* **Total Ingested Questions:** 2,672 questions (100% paper & question completeness)
* **Total Diagram & Visual Assets:** 491 unique cropped visual assets (436 question stems, 55 option diagrams)
* **Total Answer Keys Audited:** 2,672 questions compared against official IIT Roorkee master keys

---

## 2. Source-of-Truth Authority & Mapping

Every question in Mock.AI is mapped directly to its official source PDF and official master answer key from the `GATE_2025_manifest.csv`:

| Paper Code | Discipline Name | Session | PDF Pages | Questions | Sections | JSON Source |
|---|---|---|---:|---:|---|---|
| **AE** | Aerospace Engineering | General | 34 | 65 | General Aptitude, Aerospace Engineering | `gate-2025-ae.json` |
| **AG** | Agricultural Engineering | General | 32 | 65 | General Aptitude, Agricultural Engineering | `gate-2025-ag.json` |
| **AR** | Architecture and Planning | General | 53 | 81 | General Aptitude, Architecture Core, Part B1/B2 | `gate-2025-ar.json` |
| **BM** | Biomedical Engineering | General | 39 | 65 | General Aptitude, Biomedical Engineering | `gate-2025-bm.json` |
| **BT** | Biotechnology | General | 36 | 65 | General Aptitude, Biotechnology | `gate-2025-bt.json` |
| **CE-1** | Civil Engineering | Forenoon | 43 | 65 | General Aptitude, Civil Engineering | `gate-2025-ce-1.json` |
| **CE-2** | Civil Engineering | Afternoon | 37 | 65 | General Aptitude, Civil Engineering | `gate-2025-ce-2.json` |
| **CH** | Chemical Engineering | General | 37 | 65 | General Aptitude, Chemical Engineering | `gate-2025-ch.json` |
| **CS-1** | Computer Science & IT | Forenoon | 64 | 65 | General Aptitude, Computer Science & IT | `gate-2025-cs-1.json` |
| **CS-2** | Computer Science & IT | Afternoon | 48 | 65 | General Aptitude, Computer Science & IT | `gate-2025-cs-2.json` |
| **CY** | Chemistry | General | 46 | 65 | General Aptitude, Chemistry | `gate-2025-cy.json` |
| **DA** | Data Science & Artificial Intelligence | General | 34 | 65 | General Aptitude, Data Science & AI | `gate-2025-da.json` |
| **EC** | Electronics & Communication | General | 52 | 65 | General Aptitude, Electronics & Communication | `gate-2025-ec.json` |
| **EE** | Electrical Engineering | General | 50 | 65 | General Aptitude, Electrical Engineering | `gate-2025-ee.json` |
| **ES** | Environmental Science & Engg | General | 39 | 65 | General Aptitude, Environmental Science | `gate-2025-es.json` |
| **EY** | Ecology and Evolution | General | 45 | 65 | General Aptitude, Ecology and Evolution | `gate-2025-ey.json` |
| **GE** | Geomatics Engineering | General | 49 | 84 | General Aptitude, Geomatics Core, Part B1/B2 | `gate-2025-ge.json` |
| **GG-1** | Geology & Geophysics - Geology | General | 39 | 65 | General Aptitude, Geology Core, Part B1 | `gate-2025-gg-1.json` |
| **GG-2** | Geology & Geophysics - Geophysics | General | 42 | 65 | General Aptitude, Geophysics Core, Part B2 | `gate-2025-gg-2.json` |
| **IN** | Instrumentation Engineering | General | 65 | 65 | General Aptitude, Instrumentation | `gate-2025-in.json` |
| **MA** | Mathematics | General | 49 | 65 | General Aptitude, Mathematics | `gate-2025-ma.json` |
| **ME** | Mechanical Engineering | General | 41 | 65 | General Aptitude, Mechanical Engineering | `gate-2025-me.json` |
| **MN** | Mining Engineering | General | 39 | 65 | General Aptitude, Mining Engineering | `gate-2025-mn.json` |
| **MT** | Metallurgical Engineering | General | 51 | 65 | General Aptitude, Metallurgical Engineering | `gate-2025-mt.json` |
| **NM** | Naval Architecture & Marine | General | 39 | 65 | General Aptitude, Naval Architecture | `gate-2025-nm.json` |
| **PE** | Petroleum Engineering | General | 38 | 65 | General Aptitude, Petroleum Engineering | `gate-2025-pe.json` |
| **PH** | Physics | General | 39 | 65 | General Aptitude, Physics | `gate-2025-ph.json` |
| **PI** | Production & Industrial Engg | General | 35 | 65 | General Aptitude, Production & Industrial | `gate-2025-pi.json` |
| **ST** | Statistics | General | 36 | 65 | General Aptitude, Statistics | `gate-2025-st.json` |
| **TF** | Textile Engineering & Fibre | General | 35 | 65 | General Aptitude, Textile Engineering | `gate-2025-tf.json` |
| **XE** | Engineering Sciences | General | 106 | 175 | General Aptitude, Engg Math (A), Sections B-H | `gate-2025-xe.json` |
| **XH-C1** | Humanities - Economics | General | 40 | 65 | General Aptitude, Reasoning (B1), Economics | `gate-2025-xh-c1.json` |
| **XH-C2** | Humanities - English | General | 40 | 65 | General Aptitude, Reasoning (B1), English | `gate-2025-xh-c2.json` |
| **XH-C3** | Humanities - Linguistics | General | 44 | 65 | General Aptitude, Reasoning (B1), Linguistics | `gate-2025-xh-c3.json` |
| **XH-C4** | Humanities - Philosophy | General | 42 | 65 | General Aptitude, Reasoning (B1), Philosophy | `gate-2025-xh-c4.json` |
| **XH-C5** | Humanities - Psychology | General | 43 | 65 | General Aptitude, Reasoning (B1), Psychology | `gate-2025-xh-c5.json` |
| **XH-C6** | Humanities - Sociology | General | 45 | 65 | General Aptitude, Reasoning (B1), Sociology | `gate-2025-xh-c6.json` |
| **XL** | Life Sciences | General | 76 | 122 | General Aptitude, Chemistry (P), Sections Q-U | `gate-2025-xl.json` |

---

## 3. Forensic Findings by Audit Dimension

### 3.1 Paper and Question Integrity
* **Completeness:** All 38 papers exist in `web/src/data/exams/gate-2025-*.json` and contain their exact expected question counts (2,672 total questions).
* **Question Numbering:** Fully sequential (1 to N) with no skips, duplicate question numbers, or boundary drift across page breaks.

### 3.2 Scoring Marks & Question Types
* All 2,672 questions accurately preserve their official IIT Roorkee marks configuration:
  * 1-mark questions: 1.0 mark (+1.0 / -0.33 for MCQ; +1.0 / 0 for MSQ and NAT)
  * 2-mark questions: 2.0 marks (+2.0 / -0.67 for MCQ; +2.0 / 0 for MSQ and NAT)
* Official question types (MCQ, MSQ, NAT) are 100% matched against the answer keys.

### 3.3 Answer Key Fidelity
* **Semantic Match Rate:** 100% (2,672 / 2,672).
* **MTA (Marks to All):** Handled consistently with `isMta: true` and `correctAnswer: "MTA"`. (Official answer keys denote these with `MTA*`).
* **Alternative MSQ Sets:** Handled with structured `correctAnswerSets` (e.g., TF Q49 allows `[['D'], ['A', 'D']]`; XH-C5 Q42 allows `[['A', 'D'], ['C', 'D']]`).
* **NAT Ranges:** Handled with `answerRange: { min, max }` matching official tolerances.

### 3.4 Content Type Misclassification (Root Cause Confirmed)
* **Defect:** In `scripts/gate_forensic_pipeline.py`, any formula or line containing `\pi`, `\sigma`, `\rho`, or `▷◁` was naively classified as `relational_algebra`.
* **Impact:** In GATE 2025 DA Q36, a probability question involving variance $\sigma^2$ was misclassified as `type: "relational_algebra"` and displayed with a "RELATIONAL ALGEBRA EXPRESSION" badge.
* **Resolution:** Relational algebra detection must be restricted strictly to database queries featuring natural join operators (`\bowtie`, `⋈`, `▷◁`) or projection/selection over named database relations. Statistical variance and Greek letters must be classified as `type: "math"`.

### 3.5 Math Typography & Raw LaTeX Leaks
* **Defect:** 126 questions contained un-delimited LaTeX strings (e.g. `\sqrt -1`, `\lim`, `\infty`, `\mathbb{R}^{n \times n}`, `\begin{cases}`, subscripts/superscripts) inside text blocks.
* **Impact:** The client-side `LatexRenderer.tsx` escaped these strings via `escapeHtml()`, rendering literal raw LaTeX commands in the test screen.
* **Resolution:** Upgrade `LatexRenderer.tsx` and `StructuredContentRenderer.tsx` to recognize and render all naked LaTeX environments, scientific notation, calculus operators, and blackboard bold symbols through KaTeX.

### 3.6 Visual Asset Verification
* **491 Total Assets:**
  * 436 question stem figures and diagrams.
  * 55 option diagrams (options A, B, C, D).
* **Integrity:** Every asset exists on disk under `web/public/exam-assets/gate/2025/<code_lower>/`.
* **Ownership:** 0 duplicated visual assets across distinct questions; every diagram is uniquely owned by its respective question or option.
