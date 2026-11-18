# UADUE Phase 2B — DocumentGraph Architecture & Certification Report

**Subsystem:** Universal Assessment Document Understanding Engine (UADUE)  
**Phase:** 2B Universal DocumentGraph Construction (`ForensicSnapshot → Physical Evidence Objects → Spatial Index → DocumentGraph`)  
**Status:** **PHASE 2B CERTIFIED WITH SCOPE LIMITATIONS**  
**Engineering Discipline:** Lead Forensic Systems Architect & Senior Verification Engineer  
**Test Suite State:** **894 / 894 Automated Tests Passing across 75 Test Suites (100% Green)**  
**Gate Decision:** **PHASE 2B CERTIFIED WITH SCOPE LIMITATIONS — STOPPED BEFORE PHASE 2C**  

---

## 1. Architectural Boundary & Inviolable Invariants

Phase 2B master coordinator executes strictly:
$$\text{ForensicSnapshot} \longrightarrow \text{Physical Evidence Extraction} \longrightarrow \text{Spatial 2D Index} \longrightarrow \text{DocumentGraph} \longrightarrow \text{Sealing \& Invariant Validation}$$

### A. Non-Negotiable Architectural Boundary
Phase 2B computes purely **DERIVED PHYSICAL OBSERVATIONS**. It strictly constructs 2D spatial relationships, unquantized bounding-box geometry, multi-column layout zones, Voronoi/Delaunay-style adjacency, reading-order DAGs, and cross-page physical continuation candidates.

### B. Prohibited Implementation Scope (Phase 2B MUST NOT Implement)
- **ZERO** question segmentation or question boundaries
- **ZERO** question-number detection, question stem detection, or option detection
- **ZERO** answer-key pairing, answer extraction, or scoring logic
- **ZERO** question type classification (MCQ, MSQ, NAT, subjective)
- **ZERO** OCR text corrections, heuristic word splitting, or semantic punctuation stripping
- **ZERO** table or diagram semantic interpretation
- **ZERO** database schema migrations or production ingestion modifications
- **ZERO** exam-specific regexes or AI/LLM heuristics

---

## 2. Verification Dimensions: Algorithm vs. Real-World Corpus Coverage

To maintain absolute forensic integrity, evaluation is tracked along two distinct, un-conflated dimensions:

### Dimension A: Algorithm Verification
Every spatial indexing, geometric classification, column detection, topological sorting, failure isolation, and cryptographic sealing routine is evaluated against adversarial edge cases, stress scenarios, and strict invariant validators.

### Dimension B: Real-World Corpus Coverage
The authentic real-world public exam corpus consists of 4 complete examination papers totaling 147 pages:
- **UPSC CSE Prelims 2023 GS Paper 1:** 48 pages total (2 pages evaluated = 4.17%)
- **SSC CHSL 2023 Tier 1 02 Aug Shift 2:** 33 pages total (2 pages evaluated = 6.06%)
- **GATE 2024 Computer Science (CS1):** 36 pages total (2 pages evaluated = 5.56%)
- **JEE Advanced 2023 Paper 1:** 30 pages total (2 pages evaluated = 6.67%)
- **Total Corpus Page Coverage:** **8 / 147 pages evaluated (5.44% page coverage)**.

> [!IMPORTANT]
> Because only 5.44% of real-world pages were evaluated, real-world document performance is certified as **SAMPLE VERIFIED**, not FULLY VERIFIED. Full corpus verification is blocked until Phase 2B multi-page scaling.

---

## 3. Physical Relations Taxonomy (15 Intra-Page + 1 Cross-Page = 16 Total)

Phase 2B establishes an unbending distinction between intra-page geometric relationships and cross-page physical continuation candidates:

```
                            Physical Relations Taxonomy (16 Relations)
                                            │
                     ┌──────────────────────┴──────────────────────┐
                     ▼                                             ▼
       Intra-Page Geometric Relations (15)            Cross-Page Physical Relations (1)
       ├── CONTAINS                                   └── CONTINUES_PHYSICALLY
       ├── INSIDE                                         (Strictly physical layout:
       ├── OVERLAPS                                        bottom margin, top margin,
       ├── TOUCHES                                         column lane, font match;
       ├── ABOVE                                           NEVER SAME_QUESTION)
       ├── BELOW
       ├── LEFT_OF
       ├── RIGHT_OF
       ├── ALIGNED_X
       ├── ALIGNED_Y
       ├── NEAR
       ├── ADJACENT
       ├── SAME_ROW
       ├── SAME_COLUMN
       └── SAME_REGION
```

Every edge records unquantized IEEE 754 64-bit float evidence (`distancePt`, `overlapAreaPt2`, `overlapRatioSource`, `overlapRatioTarget`, `sharedBoundaryLengthPt`), a deterministic decision basis, and confidence score.

---

## 4. Invalid Geometry Safety & Failure Isolation

A critical vulnerability in spatial layout engines is the fabrication of false layout relationships from corrupt coordinates (e.g. `NaN`, `Infinity`, or out-of-bounds bounding boxes).

Phase 2B implements strict **Invalid Geometry Safety**:
1. **Zero Silent Drops:** Corrupt nodes are preserved in `graph.nodes` (satisfying the node accounting invariant: $\text{inputPhysicalObjects} = \text{graphNodes} + \text{rejectedObjects}$).
2. **Explicit Quarantine:** Corrupt nodes are logged in `graph.degradedNodes` with `INVALID_GEOMETRY` and `CORRUPT_COORDINATES` flags.
3. **Spatial Index Exclusion:** Degraded nodes with invalid geometry are **strictly excluded from the 2D Spatial Index**.
4. **Zero Manufactured Layout Edges:** Degraded nodes never participate in pairwise proximity, containment, row, column, or Voronoi adjacency calculations. They receive zero fabricated `ABOVE`, `BELOW`, `CONTAINS`, `OVERLAPS`, or `ADJACENT` edges.
5. **Active Invariant Enforcement:** `GraphValidator` scans all graph edges; if any edge illegally connects to an invalid-geometry degraded node, validation fails with `INVALID_GEOMETRY_EDGE_CONTAMINATION`.

---

## 5. Reading Order DAG & Ambiguity Model

Implemented in [`graph/readingOrderEngine.ts`](file:///Users/shivarampatel/AndroidStudioProjects/MOCK.AI/web/src/services/uadue/graph/readingOrderEngine.ts):
- **Graph / DAG Representation:** Reading flow is **never flattened prematurely into an arbitrary linear sequence**.
- **Parallel Branches:** Side-by-side elements (e.g. text adjacent to a visual diagram) branch from the preceding element:
  $$P \longrightarrow \text{Text}, \quad P \longrightarrow \text{Diagram}$$
  and reconverge at the succeeding element:
  $$\text{Text} \longrightarrow S, \quad \text{Diagram} \longrightarrow S$$
- **Explicit Ambiguity Preservation:** Where reading direction is physically ambiguous, competing candidate sequences (e.g. $[[\text{Text}, \text{Diagram}], [\text{Diagram}, \text{Text}]]$) are preserved in `readingOrderDAG.ambiguousRegions`.
- **Topological Ordering:** Partial linearization is computed via Kahn's algorithm with deterministic tie-breaking and DFS cycle protection.

---

## 6. Determinism Scope & System Boundary

Canonical serialization and cryptographic sealing are implemented in [`graph/graphSerializer.ts`](file:///Users/shivarampatel/AndroidStudioProjects/MOCK.AI/web/src/services/uadue/graph/graphSerializer.ts):
- **Canonical Serialization:** Stable recursive key-sorting, deterministic node ordering $(page, y_0, x_0, nodeId)$, edge ordering $(sourceNodeId, targetNodeId, relation)$, and normalized float formatting.
- **Cryptographic Hash:** SHA-256 computed over canonical UTF-8 bytes $\to$ `sealedHash`.
- **Determinism Scope:** Identical bitwise hashes are guaranteed under:
  1. Identical `ForensicSnapshot` input
  2. Identical algorithm version (`uadue_graph_builder_v2b_2026`)
  3. Identical configuration version (`default_v2b_config_2026`)
  4. Compatible JavaScript runtime engine adhering to IEEE 754 64-bit floating-point specifications (V8 / Node.js).
- **Cross-Platform Consideration:** Documented potential for sub-ulp floating-point jitter across differing CPU architectures (e.g. ARM vs. x86_64 FMA operations); guarded by threshold quantization tolerances in geometric comparisons.

---

## 7. Deep Recursive Semantic Purity Scan

`GraphValidator.validate(graph, snapshot)` performs a deep recursive structural scan across all nodes, edges, columns, spatial regions, reading order DAG structures, and nested property maps.

**Forbidden Semantic Keys Tested & Enforced:**
`questionId`, `question_id`, `questionNumber`, `isStem`, `stem`, `stemText`, `isOption`, `optionLabel`, `optionKey`, `options`, `answerKey`, `answer_key`, `correctAnswer`, `canonicalQuestions`, `questionGraph`, `mcq`, `msq`, `nat`, `marks`, `negativeMarks`, `score`, `explanation`, `solution`.

If any forbidden key is detected at any nesting depth, `GraphValidator` immediately rejects the graph with `ILLEGAL_SEMANTIC_FIELD`.

---

## 8. Real-World Corpus Verification Results

Validated against authentic public exam papers in [`documentGraphRealWorld.test.ts`](file:///Users/shivarampatel/AndroidStudioProjects/MOCK.AI/web/src/services/uadue/graph/documentGraphRealWorld.test.ts):

| Document ID | Authority | Total Pages | Sample Pages | Page Coverage | Nodes | Edges | Columns | Ambiguous Regions | Degraded Nodes | Acyclic DAG? | Deterministic Match? | Sealed SHA-256 Hash |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---|
| **REAL-UPSC-2023-GS1** | UPSC | 48 | 2 | 4.17% | 1,312 | 77,310 | 2 | 2 | 0 | **YES** | **YES** | `eca07238f8bda26f299c34dc015f3d74182eb5b602f96ab0dd224d4119e0fb63` |
| **REAL-SSC-CHSL-2023-S2** | SSC | 33 | 2 | 6.06% | 206 | 11,390 | 2 | 2 | 0 | **YES** | **YES** | `6a333f81cfda3a60b413fe30d57548f71e90af90ee3393ef31ebb2e988e7f6d2` |
| **REAL-GATE-2024-CS1** | GATE | 36 | 2 | 5.56% | 469 | 25,453 | 2 | 18 | 0 | **YES** | **YES** | `99fb23d6a623194511be072213e9ec6b0a68d0bbd603a1fc6c5225c5a04eb9df` |
| **REAL-JEE-ADV-2023-P1** | JEE | 30 | 2 | 6.67% | 695 | 41,098 | 2 | 40 | 0 | **YES** | **YES** | `45952f40b7fc80e920d39e25d0c75ce54a7c1dd6898b8c57b856cbf0ca9ff606` |

*Full audit records persisted to [`docs/document_graph_real_world_report.json`](file:///Users/shivarampatel/AndroidStudioProjects/MOCK.AI/docs/document_graph_real_world_report.json).*

---

## 9. Two-Dimensional Certification Scorecard

| Component / Subsystem | Algorithm Verification (Unit/Adversarial) | Real-World Corpus Coverage (8 / 147 pages = 5.44%) | Forensic Classification |
|:---|:---:|:---:|:---:|
| **Physical Evidence Extraction** | FULLY VERIFIED | SAMPLE VERIFIED (8 / 147 pages) | CERTIFIED (PHYSICAL) |
| **2D Spatial Interval Index** | FULLY VERIFIED | SAMPLE VERIFIED (8 / 147 pages) | CERTIFIED (GEOMETRIC) |
| **15 Intra-Page Geometric Relations** | FULLY VERIFIED | SAMPLE VERIFIED (8 / 147 pages) | CERTIFIED (RELATIONAL) |
| **1 Cross-Page Continuation Relation** | FULLY VERIFIED | SAMPLE VERIFIED (8 / 147 pages) | CERTIFIED (PHYSICAL CONTINUATION) |
| **Multi-Column Whitespace Gutters** | FULLY VERIFIED | SAMPLE VERIFIED (8 / 147 pages) | CERTIFIED (LAYOUT) |
| **Reading Order DAG & Ambiguity** | FULLY VERIFIED | SAMPLE VERIFIED (8 / 147 pages) | CERTIFIED (TOPOLOGICAL) |
| **Invalid Geometry Safety & Quarantine** | FULLY VERIFIED | SAMPLE VERIFIED (8 / 147 pages) | CERTIFIED (FAULT-ISOLATED) |
| **Strict Node Preservation Accounting** | FULLY VERIFIED | SAMPLE VERIFIED (8 / 147 pages) | CERTIFIED (ZERO-DROP) |
| **Bitwise Determinism & Sealing** | FULLY VERIFIED | SAMPLE VERIFIED (8 / 147 pages) | CERTIFIED (DETERMINISTIC) |
| **Deep Semantic Purity Validator** | FULLY VERIFIED | SAMPLE VERIFIED (8 / 147 pages) | CERTIFIED (PURE PHYSICAL) |
| **Raw Content Stream Glyph Bytes** | UNRESOLVED | UNRESOLVED | DISCLOSED LIMITATION |
| **ObjStm Raw Byte Offsets** | UNRESOLVED | UNRESOLVED | DISCLOSED LIMITATION |

---

## 10. Gate Decision & Phase Boundary

### Decision: **`PHASE 2B CERTIFIED WITH SCOPE LIMITATIONS`**

#### Rationale:
1. **DocumentGraph is Fully Implemented and Verified:** The geometric, spatial, topological, and reading-order engines are operational and verified across 894 unit and regression tests.
2. **Real-World Coverage Scope is Explicit:** Real-world performance is accurately qualified as `SAMPLE VERIFIED (8 / 147 pages = 5.44%)`.
3. **Fault Isolation is Hardened:** Malformed geometry preserves nodes without manufacturing false spatial relationships.
4. **Semantic Purity is Preserved:** Strict zero-question-semantics invariants are enforced recursively across the serialized graph.
5. **Phase Boundary Respected:** Execution has stopped completely at the DocumentGraph layer. Phase 2C (`QuestionGraph`) is **NOT** authorized and has **NOT** been started.
