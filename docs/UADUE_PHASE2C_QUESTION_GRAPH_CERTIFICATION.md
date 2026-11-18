# UADUE Phase 2C — QuestionGraph Forensic Status & Audit Report
**Universal Assessment Document Understanding Engine (UADUE)**  
*Phase 2C: QuestionGraph Semantic Reconstruction & Layout Invariant Audit*  
*Date: October 6, 2026*  
*Status: PHASE 2C IMPLEMENTATION ACCEPTED — SEMANTIC CERTIFICATION PENDING FORENSIC REAL-WORLD VALIDATION*

---

## 1. Executive Summary & Gate Decision

| Assessment Dimension | Current Value / Forensic Finding |
|---|---|
| **Phase Scope** | Phase 2C: QuestionGraph Candidate Reconstruction & Layout-Level Invariants |
| **Gate Status** | **PHASE 2C IMPLEMENTATION ACCEPTED — SEMANTIC CERTIFICATION PENDING FORENSIC REAL-WORLD VALIDATION** |
| **Subsequent Phase Status** | **PHASE 2D / CANONICAL QUESTION IR STRICTLY BLOCKED** |
| **Automated Test Suite** | **918 / 918 passing across 77 test suites** (Verifies declared synthetic contracts only) |
| **Phase 2C Invariant Suite** | **19 / 19 passing** (`questionGraphValidation.test.ts`) |
| **Corpus Sample Coverage** | **8 / 147 pages (5.44%)** across 4 authentic exam papers (**INSUFFICIENT FOR FULL CERTIFICATION**) |
| **Bitwise Determinism** | **100% hash equality** (Proves identical rerun execution; **DOES NOT prove semantic truth**) |
| **SSC CHSL 2-Page Sample** | **CRITICAL AUDIT TRIGGER:** 16 questions, 15 options, 38 diagrams (Confirmed false positive cascade) |
| **GATE 2-Page Sample** | **AUDIT TRIGGER:** 9 questions, 24 options (Page footers "36" & numbers "14","7" detected as Qs) |
| **JEE Adv 2-Page Sample** | **AUDIT TRIGGER:** 11 questions, 74 options (Footer "36" & table data detected as Qs) |

> [!CAUTION]
> **GATE DECISION: SEMANTIC CERTIFICATION WITHHELD**  
> While the QuestionGraph architectural contracts (identity decoupling, option candidate ownership, stimulus zero-cloning, table non-flattening, visual asset grounding, and confidence/verification segregation) are accepted as sound, **semantic reconstruction is NOT certified**.
>
> 918 passing tests and bitwise identical SHA-256 hashes prove that the code strictly satisfies its unit mocks. They do **not** prove that the algorithms reconstruct arbitrary real-world assessment documents without hallucinating or misassigning structure.
>
> **Phase 2D (CanonicalQuestionIR), answer extraction, key pairing, database migrations, and production ingestion remain STRICTLY BLOCKED.**

---

## 2. Two-Dimensional Verification Matrix (Forensic Realignment)

All previous claims of "FULLY VERIFIED" have been revoked and replaced with honest forensic distinctions:

```
+-----------------------------------+---------------------------------------------+-----------------------------+
| System Component                  | Algorithm Verification                      | Real-World Corpus Coverage  |
+-----------------------------------+---------------------------------------------+-----------------------------+
| Token Classification              | ALGORITHMALLY VERIFIED AGAINST TEST CONTRACT| SAMPLE AUDITED (8/147 pgs)  |
| Boundary Detection                | ALGORITHMALLY VERIFIED AGAINST TEST CONTRACT| SAMPLE AUDITED (8/147 pgs)  |
| Option Ownership Hypotheses       | ALGORITHMALLY VERIFIED AGAINST TEST CONTRACT| SAMPLE AUDITED (8/147 pgs)  |
| Stimulus Reference Graph          | ALGORITHMALLY VERIFIED AGAINST TEST CONTRACT| SAMPLE AUDITED (8/147 pgs)  |
| Table Candidate Preservation      | ALGORITHMALLY VERIFIED AGAINST TEST CONTRACT| SAMPLE AUDITED (8/147 pgs)  |
| Diagram Candidate Preservation    | ALGORITHMALLY VERIFIED AGAINST TEST CONTRACT| SAMPLE AUDITED (8/147 pgs)  |
| Mathematics Run Preservation      | ALGORITHMALLY VERIFIED AGAINST TEST CONTRACT| SAMPLE AUDITED (8/147 pgs)  |
| Cross-Page Continuation           | ALGORITHMALLY VERIFIED AGAINST TEST CONTRACT| SAMPLE AUDITED (8/147 pgs)  |
| Hypothesis Engine                 | ALGORITHMALLY VERIFIED AGAINST TEST CONTRACT| SAMPLE AUDITED (8/147 pgs)  |
| Ambiguity Tracking                | ALGORITHMALLY VERIFIED AGAINST TEST CONTRACT| SAMPLE AUDITED (8/147 pgs)  |
| Canonical JSON & SHA-256 Sealing  | DETERMINISTICALLY REPRODUCIBLE (100%)       | FULLY VERIFIED (Hash Match) |
+-----------------------------------+---------------------------------------------+-----------------------------+
```

---

## 3. Forensic Trace: Real-World Sample Anomalies Uncovered

A node-level forensic audit of the 8 sampled pages revealed critical discrepancies between unit-test assumptions and real examination PDF structures:

### A. SSC CHSL 2023 Tier 1 (02 Aug Shift 2) — 2 Pages Sample
- **Observation:** 16 question candidates, 15 option candidates, 38 diagram candidates.
- **Root Cause 1 (Options swallowed as Questions):**  
  In the real TCS response sheet, the question prompt starts with `Q.1`, followed by numbered options `1. Business`, `2. Buisnesc`, `3. Buisness`, `4. Busines`. Because `TokenClassifier` matched `^\d+[\.\)]`, each option was classified as a separate `QUESTION_NUMBER`, fracturing a single 4-option question into 5 distinct question candidates!
- **Root Cause 2 (Exam Header as Question):**  
  The exam timing string `"11:45 AM - 12:45 PM"` was falsely matched as a number token and emitted as Question 1.
- **Root Cause 3 (The 38 Diagrams Anomaly):**  
  The PDF is generated via Chrome/WebKit print driver for the TCS web portal. The print driver emitted 14 full-page raster backgrounds (`bbox: [0, -792, 2550, 4200]`) and 24 full-page SVG decorative vector paths. Because `DiagramDetector` clustered every raster/vector node on the page, these background/border artifacts were promoted to 38 distinct `DiagramCandidate` entities.
- **Historical Mock.AI Impact:** Direct trigger of the known **raster-banner cascading ownership failure**.

### B. GATE 2024 Computer Science (CS1) — 2 Pages Sample
- **Observation:** 9 question candidates, 24 option candidates, 61 diagram candidates.
- **Root Cause 1 (Page Footers as Questions):**  
  Footer strings like `"Page 1 of 36"` had the number token `"36"` classified as a `QUESTION_NUMBER`, creating phantom question candidates at the bottom of the page.
- **Root Cause 2 (Data Values as Questions):**  
  Inline numbers in question statements (e.g. `"14"`, `"11"`, `"7"`) were incorrectly promoted to question boundaries, splintering question bodies.

### C. JEE Advanced 2023 Paper 1 — 2 Pages Sample
- **Observation:** 11 question candidates, 74 option candidates, 36 diagram candidates.
- **Root Cause:**  
  Similar footer token leakage (`"36"`, `"35"`) and formula constants (`"6"`, `"12"`, `"17"`) generated false boundaries, causing real question text to be misallocated as 74 spurious option candidates.

---

## 4. Architectural Invariants Formally Accepted

The core structural architecture and phase boundaries remain accepted and locked:

1. **Question Identity Decoupling:** Decoupled into `physicalInstanceId` and candidate source identity. Prohibits `canonicalId`, `canonicalQuestionId`, `correctAnswer`, `markingScheme`.
2. **Option Ownership Decoupling:** Probabilistic multi-candidate ownership with explicit confidence differentials and `AmbiguityRecord` tracking.
3. **Stimulus Zero-Cloning Rule:** Multiple questions reference shared stimuli via `stimulusRefIds` with zero content replication.
4. **Structured Tables:** Preserves Column-I / Column-II matching grids without text flattening.
5. **Authoritative Visual Grounding:** Diagram candidates maintain physical vector/raster coordinates without OCR text substitution.
6. **Glyph-Run Mathematics:** Preserves raw glyph runs without premature LaTeX mutation.
7. **Cross-Page Flow as Evidence:** `CONTINUES_PHYSICALLY` does not assume `SAME_QUESTION`. Competing hypotheses preserved.
8. **Segregation of Confidence from Verification:** High confidence never coerces status to `VERIFIED`.

---

## 5. Mandatory Historical Mock.AI Regression Suite (Required for Certification)

Before QuestionGraph semantic certification can be granted, dedicated, verifiable regression tests must be executed for Mock.AI's documented historical production failures:

### SSC CHSL Production Regressions
- `REG-SSC-01`: **Raster Banner Cascading Ownership:** Ensure full-page background images and header banners are classified as page/UI decoration and not attached as diagrams to question stems.
- `REG-SSC-02`: **Option Numbering vs Question Anchor:** Ensure `1. Option`, `2. Option` under `Q.1` are classified as options, not separate question boundaries.
- `REG-SSC-03`: **Wiped Stems:** Ensure questions with preceding or subsequent tables/options retain non-empty stems.
- `REG-SSC-04`: **Identical Option Allocation:** Verify options are partitioned strictly to their parent candidate.
- `REG-SSC-05`: **Passage / Stimulus Leakage:** Ensure shared passages are not swallowed into Q1's stem.
- `REG-SSC-06`: **TCS Response Status Block Isolation:** Ensure `"Question ID : 123456"`, `"Status : Answered"`, `"Chosen Option : 2"` metadata blocks are classified as exam response metadata and not question stem text.

### GATE Production Regressions
- `REG-GATE-01`: **Flattened Mathematics:** Ensure fractions, sub/superscripts, and operator symbols retain physical glyph clusters.
- `REG-GATE-02`: **Duplicated Option Images:** Ensure unique visual option cards are preserved without duplicate hashing.
- `REG-GATE-03`: **Column-I / Column-II Grids:** Ensure matching tables retain distinct column and row bounding boxes.
- `REG-GATE-04`: **Diagram-Label Leakage:** Ensure spatial callouts within diagrams are not detached as stem text.
- `REG-GATE-05`: **Numerical Answer Type (NAT) Handling:** Ensure NAT questions with 0 options are recognized without inventing synthetic options.

---

## 6. Real-World Corpus Expansion Directive

- Current coverage: **8 / 147 pages (5.44%)** is acknowledged as sample verification only.
- Target coverage for Final Certification: **Substantially increased coverage across the full 147-page corpus** (or complete structural stratification of all sections, question types, and layout variants).
- Every evaluated page must generate a human-verifiable forensic trace:
  $$\text{Source PDF} \to \text{Physical Nodes} \to \text{Candidate Boundaries} \to \text{QuestionGraph} \to \text{Ambiguity / Audit Findings}$$

---

## 7. Sign-Off & Status

- **Architecture Direction:** 🟢 ACCEPTED
- **Invariant & Boundary Enforcement:** 🟢 ACCEPTED
- **Semantic Reconstruction Certification:** 🟡 **PENDING FORENSIC REAL-WORLD VALIDATION**
- **Phase 2D Authorization:** 🔴 **STRICTLY BLOCKED**
