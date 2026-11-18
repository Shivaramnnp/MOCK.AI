# UADUE Phase 2D — Traceability Completeness & Information Preservation Audit
**Universal Assessment Document Understanding Engine (UADUE)**
**Document Version:** 2.0.0-CONTRACT-CORRECTED
**Classification:** Stage A Design Specification — Information Transformation Audit
**Implementation Status:** **NOT AUTHORIZED (Stage B Implementation Gate Pending)**

---

## 1. Information Transformation Charter

A critical vulnerability of document processing architectures is conflating **byte preservation** with **semantic accuracy**.

Phase 2D formally distinguishes three independent concepts:

$$\begin{aligned}
\text{Concept A [Source Preservation]}: & \quad \text{Original source PDF stream bytes and DocumentGraph nodes remain 100\% immutable}. \\
\text{Concept B [Traceability Completeness]}: & \quad \text{Every canonical source-derived element resolves to its complete physical evidence set } \mathbf{\Pi}(e). \\
\text{Concept C [Semantic Losslessness]}: & \quad \text{The canonical model preserves all pedagogical nuances required by the product}.
\end{aligned}$$

$$\mathbf{Theorem\ [Semantic\ Independence]}: \quad \text{Concept A} \land \text{Concept B} \not\implies \text{Concept C}$$

*Proof:* A parser may flawlessly preserve raw bytes (Concept A) and maintain perfect cryptographic pointer chains to those bytes (Concept B), while incorrectly classifying a 4-option MCQ as a Numerical Answer Type (failing Concept C). Therefore, **Provenance Completeness cannot certify Semantic Correctness**. Semantic correctness requires empirical real-world validation.

---

## 2. Traceability Completeness Specification

$$\forall e \in \text{CanonicalElement}, \quad \operatorname{claimsSource}(e) \implies \exists \mathbf{\Pi}(e) = \{ \pi_1, \pi_2, \dots, \pi_k \},\ k \ge 1$$
where each $\pi_i = \langle \text{FamilyId}, \text{CandidateId}_i, \text{NodeId}_{i,j}, \text{EvidenceId}_{i,j,m}, \text{ByteRange}_i \rangle$.

Because every canonical element retains its `sourceOptionCandidateIds`, `sourceInstanceId`, `assetId`, and `evidenceChain`, complete physical lineage is guaranteed.

---

## 3. Transformation Information Classification Matrix

Every transformation from $\text{Physical Candidate} \longrightarrow \text{Logical Family} \longrightarrow \text{Canonical Question}$ is classified under seven rigorous categories:

| Source Artifact Dimension | Raw Physical Source | Layer 3 (QuestionGraph) | Layer 5 (CanonicalQuestionIR) | Information Classification | Design Handling & Preservation Rule |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **Printed Number Label** | `Q. 15`, `(a)`, `१६.` | `sourcePrintedLabel`, `detectedNumber` | `sourceQuestionNumber`, `authenticKey`, `discrepancies[]` | **PRESERVED** | Retained in `sourcePrintedLabel`; discrepancy logged; never overwritten. |
| **Stem Text & Typography** | Case, punctuation, symbols | `includedPhysicalNodeIds`, `stemNodeIds` | `prompt.text`, `prompt.contentBlocks[]` | **PRESERVED** | Zero text mutation; whitespace and punctuation retained verbatim. |
| **Option Markers & Keys** | `(A)`, `1.`, `(i)`, `(क)` | `OptionCandidate.markerLabel` | `CanonicalOptionIR.authenticKey` + `key` | **PRESERVED + NORMALIZED** | Authentic key preserved in `authenticKey`; normalized index in `key`. |
| **Mathematical Formulas** | Matrices, integrals, fractions | `MathCandidate.glyphRunIds`, `bbox` | `CanonicalContentBlock.latex` + raw glyphs | **DERIVED** | KaTeX AST generated; underlying glyph IDs preserved in `AssetGraph`. |
| **Visual Diagrams & Curves** | Vector paths, raster images | `DiagramCandidate.authoritativeSourceAssetIds` | `associatedAssetIds[]` $\to$ `AssetGraphNode` | **PRESERVED** | Sliced vector paths and raster bounding crops anchored to `AssetGraph`. |
| **Table Grids & Alignment** | Row/Col spans, cell borders | `TableCandidate.cells[]`, `gridGeometry` | `CanonicalContentBlock.tableData` | **DERIVED** | Grid AST synthesized; cell geometry mapped. |
| **Shared Stimulus / Passage** | Multi-question shared text | `StimulusCandidate.supportedQuestionIds` | `stimulus.contentBlocks[]` (zero cloning) | **PRESERVED + AGGREGATED** | Stored under unique `stimulusId`; child questions reference ID without duplication. |
| **Multilingual Pairs** | Hindi Verso + English Recto | `QuestionRelationshipCandidate` edges | `multilingualRepresentations` dictionary | **DERIVED** | Unified via verified relationship edges with script disjointness. |
| **Official Authority IDs** | TCS / Exam Board QID | `officialQuestionId` | `CanonicalQuestionIR.officialQuestionId` | **PRESERVED** | Mapped 1-to-1 from assessment metadata. |
| **Watermarks & Page Headers** | Translucent backgrounds, running footers | `PAGE_BACKGROUND`, `HEADER_FOOTER` | Excluded from pedagogical prompt | **DISCARDED (WITH PROVENANCE)** | Excluded from question prompt with explicit provenance exclusion log. |

---

## 4. Empirical Evaluation Across Exam Archetypes

- **UPSC CSE Prelims:** Hindi Devanagari text on even pages and English text on odd pages are preserved with separate font dictionaries, glyph indices, and bounding boxes. Discrepancies (e.g. Hindi Q16 vs English Q15 on Page 6) are preserved and ledgered.
- **SSC CHSL:** Jumbled sentence tokens `(P), (Q), (R), (S)` preserved inside stem AST blocks without misclassification as options. Visual options retain isolated raster crops.
- **GATE:** Mathematical formulas retain visual bounding boxes and KaTeX ASTs. NAT numerical ranges retain floating-point precision.
- **JEE Advanced:** Matrix match Column I and Column II structures are preserved as two-dimensional relational tables. Scoring rules remain decoupled.
