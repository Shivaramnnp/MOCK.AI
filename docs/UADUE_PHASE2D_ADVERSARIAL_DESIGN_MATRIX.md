# UADUE Phase 2D — Adversarial Stress & Edge-Case Design Matrix
**Universal Assessment Document Understanding Engine (UADUE)**
**Document Version:** 3.0.0-TOPOLOGY-HARDENED
**Classification:** Stage A Design Specification — 30 Adversarial Scenarios & 5 Topology Hardening Cases
**Implementation Status:** **NOT AUTHORIZED (Stage B Implementation Gate Locked)**

---

## 1. Adversarial Test Matrix Charter

The Phase 2D canonicalization engine is designed under the **Principle of Forensic Robustness**: no layout distortion, typographical bug, script mismatch, or PDF stream anomaly may cause silent failure, data corruption, or process crashes.

### 1.1 Component Lifecycle Classification
All components and recovery mechanisms in this matrix are categorized according to their formal lifecycle state:
- **Design Concept / Architecture:** Formal specification in this document (`[DESIGN-SPECIFIED]`).
- **Implementation Component:** Module to be built during Stage B (`[IMPLEMENTATION-SPECIFIED]`).
- **Test Requirement:** Test specification to be verified during Stage B (`[TEST-SPECIFIED]`).
- **Verification Status:** Currently pending implementation (`REQUIRES IMPLEMENTATION VERIFICATION` or `REQUIRES REAL-WORLD SEMANTIC VALIDATION`).

---

## 2. Five Core Relational Topology Adversarial Cases

### Case A: The English-Hindi-English Triangle (Transitivity Prohibition)
- **Setup:** English Candidate A, Hindi Candidate B, English Candidate C.
- **Observed:** $(A, B)$ verified `LANGUAGE_REPRESENTATION_OF`; $(B, C)$ verified `LANGUAGE_REPRESENTATION_OF`; $(A, C)$ has NO direct proof.
- **Contract Rule:** `LANGUAGE_REPRESENTATION_OF` is strictly non-transitive.
- **Expected Outcome:** A and B share Family $\mathcal{F}_1$. B and C share Family $\mathcal{F}_2$ only if independently verified. A and C must NOT become equivalent through transitivity. Error logged if multi-family collision occurs.
- **Status:** `[TEST-SPECIFIED]` / `REQUIRES IMPLEMENTATION VERIFICATION`.

### Case B: SAME_LOGICAL_QUESTION + VARIANT_OF Chain
- **Setup:** Candidate A, Candidate B, Candidate C.
- **Observed:** $(A, B) = \text{SAME\_LOGICAL\_QUESTION}$; $(B, C) = \text{VARIANT\_OF}$.
- **Contract Rule:** `VARIANT_OF` is non-transitive and prohibits family creation.
- **Expected Outcome:** A and B form Family $\mathcal{F}_A$; C forms distinct Family $\mathcal{F}_C$. C links to $\mathcal{F}_A$ only as variant metadata.
- **Status:** `[TEST-SPECIFIED]` / `REQUIRES IMPLEMENTATION VERIFICATION`.

### Case C: SAME_LOGICAL_QUESTION + RELATED_BUT_DISTINCT Chain
- **Setup:** Candidate A, Candidate B, Candidate C.
- **Observed:** $(A, B) = \text{SAME\_LOGICAL\_QUESTION}$; $(B, C) = \text{RELATED\_BUT\_DISTINCT}$.
- **Contract Rule:** `RELATED_BUT_DISTINCT` is non-transitive and explicitly bars family creation.
- **Expected Outcome:** A and B form Family $\mathcal{F}_A$; C is isolated into its own family $\mathcal{F}_C$. Graph connectivity does not leak across distinct questions.
- **Status:** `[TEST-SPECIFIED]` / `REQUIRES IMPLEMENTATION VERIFICATION`.

### Case D: Double Continuation Chain (Monotonic Verification)
- **Setup:** Candidate A (Page 1 bottom), Candidate B (Page 2 top), Candidate C (Page 2 middle).
- **Observed:** $(A, B) = \text{CONTINUATION\_OF}$; $(B, C) = \text{CONTINUATION\_OF}$.
- **Contract Rule:** `CONTINUATION_OF` is transitive IF AND ONLY IF reading order and page sequence are strictly monotonic: $\operatorname{Page}(A) \le \operatorname{Page}(B) \le \operatorname{Page}(C) \land \operatorname{Seq}(A) < \operatorname{Seq}(B) < \operatorname{Seq}(C)$.
- **Expected Outcome:** Valid transitive chain merged into single physical candidate $Q_{\text{merged}} = \operatorname{Nodes}(A) \cup \operatorname{Nodes}(B) \cup \operatorname{Nodes}(C)$.
- **Status:** `[TEST-SPECIFIED]` / `REQUIRES IMPLEMENTATION VERIFICATION`.

### Case E: Shared Stimulus Child Isolation
- **Setup:** Stimulus S, Child Candidate A, Child Candidate B.
- **Observed:** $(A, S) = \text{SHARED\_STIMULUS\_CHILD\_OF}$; $(B, S) = \text{SHARED\_STIMULUS\_CHILD\_OF}$.
- **Contract Rule:** `SHARED_STIMULUS_CHILD_OF` is hierarchical (tree link) and non-transitive.
- **Expected Outcome:** Shared stimulus does NOT make A and B the same question. A and B remain completely separate `LogicalQuestionFamily` entities referencing shared `stimulusId = S`.
- **Status:** `[TEST-SPECIFIED]` / `REQUIRES IMPLEMENTATION VERIFICATION`.

---

## 3. The 30 Adversarial Scenarios

### Scenario 1: Mismatched Option Count in Bilingual Pairs
- **Failure Mode:** English recto has 4 options `(a, b, c, d)`, but Hindi verso printed only 3 options due to a typesetting omission.
- **Detection Component:** `OptionCardinalityComparator` `[IMPLEMENTATION-SPECIFIED]` flags mismatch ($N_{\text{eng}} = 4 \ne N_{\text{hin}} = 3$).
- **Invariant Guaranteed:** $\mathbf{Inv_3\ [Discrepancy\ Honesty]}$.
- **Recovery Contract:** Link as `LANGUAGE_REPRESENTATION_OF` via hard evidence (spread, numeral, script); append `DiscrepancyRecord(OPTION_CARDINALITY_MISMATCH)`; preserve authentic 3 options in Hindi and 4 options in English without synthetic option injection.
- **Status:** `REQUIRES IMPLEMENTATION VERIFICATION`.

### Scenario 2: Discontinuous Question Numbering
- **Failure Mode:** Document skips Q13 entirely, or prints two Q16s sequentially.
- **Detection Component:** `SequenceContinuityAuditor` `[IMPLEMENTATION-SPECIFIED]` checks $\Delta = Q_{n} - Q_{n-1}$.
- **Invariant Guaranteed:** $\mathbf{Inv_1\ [Source\ Non-Destruction]} \land \mathbf{Inv_3}$.
- **Recovery Contract:** Retain physical `sourcePrintedLabel` and `detectedNumber`; synthesize canonical question with explicit `DiscrepancyRecord(NUMBERING_DISCONTINUITY)`; do NOT renumber source sequence.
- **Status:** `REQUIRES IMPLEMENTATION VERIFICATION`.

### Scenario 3: Cross-Page Question Split Across Column Boundaries
- **Failure Mode:** Stem begins at the bottom of Column 2 on Page 4; options `(A)` and `(B)` are on Page 4; options `(C)` and `(D)` appear at top of Column 1 on Page 5.
- **Detection Component:** `CONTINUATION_OF` edge verified via reading-order DAG flow and unclosed question state across page boundaries.
- **Invariant Guaranteed:** $\mathbf{Inv_2\ [Traceability\ Completeness]}$.
- **Recovery Contract:** Merge physical candidate node references across pages into single `QuestionCandidate`; preserve `startPageNumber = 4, endPageNumber = 5, isMultiPage = true`.
- **Status:** `REQUIRES IMPLEMENTATION VERIFICATION`.

### Scenario 4: Shared Stimulus with Nested Sub-Questions & Multi-Page Continuation
- **Failure Mode:** A 500-word reading passage spans across Page 8 and Page 9, followed by Questions 41–45.
- **Detection Component:** `StimulusCandidate` spans multi-page bounding hull; `SHARED_STIMULUS_CHILD_OF` edges connect Q41–Q45.
- **Invariant Guaranteed:** $\mathbf{Inv_2} \land \text{Zero Content Duplication}$.
- **Recovery Contract:** Stimulus content block stored once under unique `stimulusId`; canonical questions reference `stimulusId` without duplicating passage text in child prompts.
- **Status:** `REQUIRES IMPLEMENTATION VERIFICATION`.

### Scenario 5: Formula with Inline Parentheses Resembling Option Keys
- **Failure Mode:** Math formula contains `f(a) = g(b) + (c)` where `(a), (b), (c)` resemble option markers.
- **Detection Component:** `GlyphMathContextDetector` `[IMPLEMENTATION-SPECIFIED]` verifies parenthetical tokens are inside math bounding box with mathematical font metrics.
- **Invariant Guaranteed:** Semantic role isolation.
- **Recovery Contract:** Parentheses classified as `MATH_CANDIDATE`; option classifier ignores inline math tokens; stem integrity preserved.
- **Status:** `REQUIRES IMPLEMENTATION VERIFICATION`.

### Scenario 6: Visual Options Embedded Inside Raster Graphics
- **Failure Mode:** Question stem is text, but 4 options are four visual image tiles with `(A), (B), (C), (D)` rendered inside pixel bitmaps.
- **Detection Component:** `VisualOptionDetector` `[IMPLEMENTATION-SPECIFIED]` identifies 4 aligned raster/vector bounding boxes in option grid topology.
- **Invariant Guaranteed:** `AssetGraph` visual fidelity.
- **Recovery Contract:** Options created with `CanonicalOptionIR.assetId` pointing to sliced `AssetGraphNode` visual crops; authentic keys mapped from visual OCR.
- **Status:** `REQUIRES IMPLEMENTATION VERIFICATION`.

### Scenario 7: Multi-Column Options on Facing Pages
- **Failure Mode:** In a bilingual paper, options are laid out in a 2x2 grid in Hindi on the left and a 2x2 grid in English on the right.
- **Detection Component:** `SpatialGridClusterer` `[IMPLEMENTATION-SPECIFIED]` identifies 2D grid matrix coordinates $(x_0, y_0, x_1, y_1)$ for each option candidate.
- **Invariant Guaranteed:** Spatial reading order determinism.
- **Recovery Contract:** `OptionCandidate.isMultiColumnOption = true`; canonical options ordered sequentially $(0, 1, 2, 3)$ preserving authentic 2D layout metadata.
- **Status:** `REQUIRES IMPLEMENTATION VERIFICATION`.

### Scenario 8: Jumbled Sentence Questions Matching Option Markers
- **Failure Mode:** Stem contains: `Arrange the following: (P) He went (Q) to school (R) by bus (S) today. Options: (A) PQRS (B) SRPQ...`
- **Detection Component:** Contextual state machine tracks `STEM_CANDIDATE` until explicit option list header or terminal option block is encountered.
- **Invariant Guaranteed:** Zero stem truncation.
- **Recovery Contract:** `(P), (Q), (R), (S)` preserved inside `prompt.contentBlocks`; only `(A), (B), (C), (D)` classified as `CanonicalOptionIR`.
- **Status:** `REQUIRES IMPLEMENTATION VERIFICATION`.

### Scenario 9: Table Matching Questions with Roman Numerals Inside Options
- **Failure Mode:** Question has Column I `(A, B, C, D)` and Column II `(i, ii, iii, iv)`; options read: `(1) A-i, B-ii (2) A-iii, B-iv...`
- **Detection Component:** `TableCandidate` detects two-column key-value structure; Roman numerals assigned to table cells; numeric keys assigned to options.
- **Invariant Guaranteed:** Structured table AST integrity.
- **Recovery Contract:** Preserves `TableData` AST inside stem prompt; option keys accurately extracted as `1, 2, 3, 4`.
- **Status:** `REQUIRES IMPLEMENTATION VERIFICATION`.

### Scenario 10: Assertion-Reasoning Questions with Dependent Sub-Clauses
- **Failure Mode:** Stem contains `Assertion (A): ... Reason (R): ...` followed by standard 4 relation options.
- **Detection Component:** `AssertionReasonPatternMatcher` `[IMPLEMENTATION-SPECIFIED]` recognizes structured premise-conclusion clause pair.
- **Invariant Guaranteed:** `questionType = 'ASSERTION_REASON'`.
- **Recovery Contract:** Structured sub-clauses preserved as distinct blocks in `prompt.contentBlocks`; options bound to standard causality options.
- **Status:** `REQUIRES IMPLEMENTATION VERIFICATION`.

### Scenario 11: Corrupted OCR Font Stream with CID Fallback
- **Failure Mode:** PDF uses non-standard embedded Type 0 / CID font with missing `ToUnicode` CMap.
- **Detection Component:** Adapter detects raw CID character codes without Unicode mappings; triggers glyph geometry fallback.
- **Invariant Guaranteed:** Zero character corruption.
- **Recovery Contract:** Preserves vector glyph contours; routes glyphs to visual OCR / MathPix fallback; flags `verification.status = 'REVIEW_REQUIRED'`.
- **Status:** `REQUIRES REAL-WORLD SEMANTIC VALIDATION`.

### Scenario 12: Inverted / Dark Mode PDF Stream Rendering
- **Failure Mode:** Paper printed with black background and white text for computer-based test display.
- **Detection Component:** `ColorSpaceAnalyzer` `[IMPLEMENTATION-SPECIFIED]` detects luminance inversion in content stream operators.
- **Invariant Guaranteed:** Bounding box spatial accuracy.
- **Recovery Contract:** Coordinates normalized to standard top-left origin; text decoded normally; raster assets extracted with authentic color palette.
- **Status:** `REQUIRES REAL-WORLD SEMANTIC VALIDATION`.

### Scenario 13: Non-Standard Hindi Devanagari Numbering (१, २, ३) with Latin Options
- **Failure Mode:** Question numbered with Devanagari numeral `१५.` but options printed as Latin `(A), (B), (C), (D)`.
- **Detection Component:** `ScriptClassifier` `[IMPLEMENTATION-SPECIFIED]` identifies mixed-script tokens across stem and options.
- **Invariant Guaranteed:** Multi-script representation fidelity.
- **Recovery Contract:** `sourcePrintedLabel = "१५."`, `detectedNumber = 15`; option authentic keys stored as `(A), (B), (C), (D)` without forced translation.
- **Status:** `REQUIRES IMPLEMENTATION VERIFICATION`.

### Scenario 14: Retracted / Cancelled Questions (MTA - Marks To All)
- **Failure Mode:** Exam authority officially invalidates Q42 due to ambiguous drafting.
- **Detection Component:** Ingestion of official errata or MTA answer key flag.
- **Invariant Guaranteed:** $\mathbf{Inv_5\ [Answer\ Decoupling]}$.
- **Recovery Contract:** Question IR fully preserved; `answer.isMta = true`; scoring engine awards full marks without deleting pedagogical content.
- **Status:** `REQUIRES IMPLEMENTATION VERIFICATION`.

### Scenario 15: Multiple Official Answer Keys (Provisional vs Final Dispute)
- **Failure Mode:** Provisional key gave option `(B)`; after candidate challenges, final key changed to `(C)`.
- **Detection Component:** Multiple answer key provenance layers attached to same `canonicalId`.
- **Invariant Guaranteed:** Answer versioning immutability.
- **Recovery Contract:** Canonical question maintains immutable `id`; answer entity records `provenance: 'FINAL_REVISED_KEY'` with previous provisional history in audit trail.
- **Status:** `REQUIRES IMPLEMENTATION VERIFICATION`.

### Scenario 16: Numerical Answer Type (NAT) with Non-Standard Decimal Delimiters
- **Failure Mode:** GATE paper contains NAT question accepting range `3.14` to `3.16`, but printed in European format `3,14` in some documentation.
- **Detection Component:** `NumericAnswerValidator` `[IMPLEMENTATION-SPECIFIED]` normalizes decimal comma to standard IEEE-754 floating point.
- **Invariant Guaranteed:** `questionType = 'NUMERICAL_ANSWER_TYPE'`.
- **Recovery Contract:** `answer.numericRange = { min: 3.14, max: 3.16 }`; raw string preserved in provenance record.
- **Status:** `REQUIRES IMPLEMENTATION VERIFICATION`.

### Scenario 17: Multiple Correct Options (MSQ) with Partial Marking Permutations
- **Failure Mode:** JEE Advanced question has multiple correct answers `(A, C, D)` with complex partial marking $+1, +2, +4, -2$.
- **Detection Component:** `QuestionTypeClassifier` `[IMPLEMENTATION-SPECIFIED]` detects MSQ topology from official instructions.
- **Invariant Guaranteed:** Scoring rule isolation.
- **Recovery Contract:** `answer.correctKeys = ['A', 'C', 'D']`; scoring matrix stored in `scoring.ruleName = 'JEE_ADVANCED_MSQ_2023'`.
- **Status:** `REQUIRES IMPLEMENTATION VERIFICATION`.

### Scenario 18: Embedded Vector Glyphs Inside Mathematical Fraction Bars
- **Failure Mode:** Fraction numerator and denominator contain square root symbols drawn as separate vector stroke paths rather than text fonts.
- **Detection Component:** `VectorPathClusterer` `[IMPLEMENTATION-SPECIFIED]` detects bounding intersection between line strokes and text glyphs.
- **Invariant Guaranteed:** Math AST integrity.
- **Recovery Contract:** Synthesizes `\frac{\sqrt{x}}{y}` LaTeX AST block referencing underlying stroke path IDs in `AssetGraph`.
- **Status:** `REQUIRES IMPLEMENTATION VERIFICATION`.

### Scenario 19: Side-by-Side Bilingual Columns Within a Single Page
- **Failure Mode:** Left column of Page 10 is Hindi; right column is English for the same question numbers.
- **Detection Component:** `ColumnLayoutClassifier` `[IMPLEMENTATION-SPECIFIED]` detects 2-column layout with distinct scripts per column on the *same* physical page.
- **Invariant Guaranteed:** Relational topology flexibility.
- **Recovery Contract:** `PARALLEL_COLUMN_LAYOUT` evidence connects candidates on same page; unifies into single `LogicalQuestionFamily`.
- **Status:** `REQUIRES IMPLEMENTATION VERIFICATION`.

### Scenario 20: Asymmetric Diagram Placement (Diagram Missing in Hindi Verso)
- **Failure Mode:** English question has a circuit diagram; Hindi question text simply states "(चित्र देखें)" without reprinting the diagram.
- **Detection Component:** `VisualAssetMatcher` `[IMPLEMENTATION-SPECIFIED]` notes diagram present in Candidate B (English) but absent in Candidate A (Hindi).
- **Invariant Guaranteed:** Shared asset referencing.
- **Recovery Contract:** Canonical question binds diagram asset globally; Hindi representation references shared `assetId`; logs `DiscrepancyRecord(MISSING_DIAGRAM_IN_VARIANT, INFO)`.
- **Status:** `REQUIRES REAL-WORLD SEMANTIC VALIDATION`.

### Scenario 21: Page Boundary Cutting a Math Matrix in Half
- **Failure Mode:** First 2 rows of a 4x4 matrix appear on Page 12; last 2 rows appear on Page 13.
- **Detection Component:** `MathContinuityAuditor` `[IMPLEMENTATION-SPECIFIED]` flags unclosed matrix bracket `\begin{pmatrix}` at page bottom.
- **Invariant Guaranteed:** Lossless equation assembly.
- **Recovery Contract:** `CONTINUATION_OF` stitches matrix rows into single valid KaTeX matrix AST.
- **Status:** `REQUIRES REAL-WORLD SEMANTIC VALIDATION`.

### Scenario 22: Question Stem Containing Code Snippets with Syntax Highlighting
- **Failure Mode:** Computer science exam includes Python/C++ code with indentation and syntax coloring.
- **Detection Component:** `CodeBlockDetector` `[IMPLEMENTATION-SPECIFIED]` identifies monospace font family and whitespace-sensitive layout.
- **Invariant Guaranteed:** Indentation preservation.
- **Recovery Contract:** Emits `CanonicalContentBlock(type: 'CODE', text: '...', language: 'python')` preserving exact indentation spaces.
- **Status:** `REQUIRES IMPLEMENTATION VERIFICATION`.

### Scenario 23: Watermark Text Intercepting Question Bounding Box
- **Failure Mode:** Diagonal "CONFIDENTIAL" or coaching institute watermark overlays question text.
- **Detection Component:** `WatermarkClassifier` `[IMPLEMENTATION-SPECIFIED]` detects translucent or background vector path repeated across all pages.
- **Invariant Guaranteed:** Stem text cleanliness.
- **Recovery Contract:** Layer 2 DocumentGraph marks nodes as `PAGE_BACKGROUND`; excluded from `QuestionCandidate` stem node IDs.
- **Status:** `REQUIRES REAL-WORLD SEMANTIC VALIDATION`.

### Scenario 24: Footnote / Errata at Page Footer Referencing a Question Stem
- **Failure Mode:** Footer contains `*Note: In question 4, consider g = 9.8 m/s^2`.
- **Detection Component:** `FooterPatternMatcher` `[IMPLEMENTATION-SPECIFIED]` detects footnote marker `*` matching symbol in question stem.
- **Invariant Guaranteed:** Semantic context preservation.
- **Recovery Contract:** Footnote text appended as explanatory block in `prompt.contentBlocks` with explicit source reference.
- **Status:** `REQUIRES REAL-WORLD SEMANTIC VALIDATION`.

### Scenario 25: Ambiguous Option Ownership Between Adjacent Questions in Single Column
- **Failure Mode:** Two single-column questions are tightly packed; option `(D)` of Q1 is close to stem of Q2.
- **Detection Component:** `SpatialGapEvaluator` `[IMPLEMENTATION-SPECIFIED]` calculates relative Voronoi proximity and reading-order DAG flow.
- **Invariant Guaranteed:** Zero cross-question option contamination.
- **Recovery Contract:** Option assigned based on strict option cardinality $(4/4)$ and numbering boundary constraints; ambiguity logged in `AmbiguityRecord`.
- **Status:** `REQUIRES IMPLEMENTATION VERIFICATION`.

### Scenario 26: Section Header Collision with Descriptive Question Stem
- **Failure Mode:** Section title reads `SECTION B — ANALYTICAL REASONING`, resembling a descriptive question stem.
- **Detection Component:** `SectionHeaderClassifier` `[IMPLEMENTATION-SPECIFIED]` matches typography (bold/large font), centered alignment, and absence of question numbering.
- **Invariant Guaranteed:** Structural hierarchy integrity.
- **Recovery Contract:** Assigned to `sectionName`; excluded from question list.
- **Status:** `REQUIRES IMPLEMENTATION VERIFICATION`.

### Scenario 27: Negative Marking Override on Specific Sub-Questions
- **Failure Mode:** Standard questions have $-0.25$ negative marking, but Q20–Q25 have zero negative marking.
- **Detection Component:** Ingestion of section instruction block overriding default scoring matrix.
- **Invariant Guaranteed:** Per-question scoring granularity.
- **Recovery Contract:** `CanonicalQuestionIR.scoring.negativeMarks = 0` set explicitly for affected items.
- **Status:** `REQUIRES IMPLEMENTATION VERIFICATION`.

### Scenario 28: MCQ with "(E) None of the above" Conditionally Present
- **Failure Mode:** 5-option MCQ paper where some questions have 4 options and others have 5 options.
- **Detection Component:** `OptionCandidateClassifier` `[IMPLEMENTATION-SPECIFIED]` dynamically binds all observed option markers without hardcoded 4-option assumption.
- **Invariant Guaranteed:** Dynamic cardinality support.
- **Recovery Contract:** `CanonicalQuestionIR.options` array contains exactly 5 elements with authentic keys `A, B, C, D, E`.
- **Status:** `REQUIRES IMPLEMENTATION VERIFICATION`.

### Scenario 29: Mixed English-Hindi Terminology Inside Technical Stem (Hinglish)
- **Failure Mode:** Hindi stem contains technical English terms in Latin script (e.g. `निम्नलिखित "Transistor" परिपथ में...`).
- **Detection Component:** `ScriptClassifier` `[IMPLEMENTATION-SPECIFIED]` identifies inline Latin text spans within Devanagari paragraph nodes.
- **Invariant Guaranteed:** Full Unicode text fidelity.
- **Recovery Contract:** Single cohesive string preserving both Unicode ranges without character splitting or encoding corruption.
- **Status:** `REQUIRES REAL-WORLD SEMANTIC VALIDATION`.

### Scenario 30: Zero-Byte or Truncated PDF Stream Recovery
- **Failure Mode:** PDF download was interrupted, truncating the last 2 pages of a 30-page document.
- **Detection Component:** PDF parser detects premature EOF or corrupted xref table.
- **Invariant Guaranteed:** Graceful degradation and audit reporting.
- **Recovery Contract:** Valid pages 1–28 processed; missing pages recorded as `PARTITION_TRUNCATED`; overall document status flagged as `REVIEW_REQUIRED` with fatal error boundary.
- **Status:** `REQUIRES REAL-WORLD SEMANTIC VALIDATION`.
