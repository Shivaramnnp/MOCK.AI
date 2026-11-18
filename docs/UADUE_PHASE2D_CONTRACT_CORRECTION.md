# UADUE Phase 2D — Critical Contract Correction & Rigor Realignment
**Universal Assessment Document Understanding Engine (UADUE)**
**Document Version:** 3.0.0-TOPOLOGY-HARDENED
**Classification:** Pre-Implementation Contract Correction & Architectural Realignment
**Implementation Authorization Status:** **NOT AUTHORIZED (Stage B Implementation Gate Locked)**

---

## 1. Executive Summary & Review Charter

During the architectural review of the Phase 2D design specifications, critical contract overclaims, formulation errors, and transitivity ambiguities were identified. This document formally establishes the corrected, mathematically hardened contracts and realigns the verification hierarchy with the proven Phase 2C evidence model under a **Two-Stage Authorization Framework**.

### Core Corrections & Topology Hardening:
1. **Invertibility Contract Replaced with Traceability Completeness:** Eliminated the invalid $\exists!$ (bijective / unique inverse path) claim. Canonical elements map to **one or more** physical source contributors ($\mathbf{\Pi}(e) = \{ \pi_1, \dots, \pi_k \}$).
2. **Confidence-Gating Decoupled from Verification:** Repudiated the rule that probabilistic confidence ($\ge 0.85$) authorizes identity or family unification. Replaced with an **Evidence-Driven State Model** where verification is strictly separate from algorithmic confidence belief.
3. **Graph Connected Components $\ne$ Logical Question Families:** Graph connectivity is merely evidence, not identity. A `LogicalQuestionFamily` is an explicitly evaluated, rule-governed derived entity.
4. **Explicit Candidate Family Membership Vector:** Every `QuestionCandidate` must declare its explicit `candidateFamilyMembership[]` containing verification state, relationship evidence, supporting relationships, and conflicting relationships.
5. **Rigorous Transitivity Boundaries:** `LANGUAGE_REPRESENTATION_OF`, `VARIANT_OF`, `SHARED_STIMULUS_CHILD_OF`, and `RELATED_BUT_DISTINCT` are strictly **NON-TRANSITIVE**. $A \leftrightarrow B \land B \leftrightarrow C \not\implies A \leftrightarrow C$.
6. **Versioned CONTINUATION_OF Model:** Replaced static "irreversible once sealed" phrasing with a versioned lifecycle supporting immutable sealed snapshots and audited historical revisions.
7. **Two-Stage Authorization Enacted:** Separated **Stage A (Architecture Authorization)** from **Stage B (Implementation Authorization)**. Implementation remains **NOT AUTHORIZED** until Stage B is explicitly triggered.

---

## 2. Invertibility & Traceability Completeness Contract Correction

### 2.1 Original Faulty Contract
The preliminary specification asserted:
$$\forall c \in \text{CanonicalQuestionIR}, \quad \exists ! \mathcal{P}(c \to \text{Family} \to \text{Candidate} \to \text{DocGraph} \to \text{Bytes})$$

### 2.2 Forensic Problem Identification
The $\exists!$ ("there exists a unique path") formulation is mathematically false for assessment document canonicalization:
- A canonical question may legitimately derive from **multiple physical source candidates** (e.g. Hindi Verso candidate $Q_A$ + English Recto candidate $Q_B$).
- A single canonical stem or option block may be a composite assembly of text spans, inline math bounding boxes, and diagram assets distributed across multiple pages.
- Asserting a unique inverse path implies a 1-to-1 bijection between a canonical element and a single physical source object, which causes conceptual collapse when dealing with multilingual or multi-page continuations.

### 2.3 Corrected Contract: Traceability Completeness & Source Invariance

$$\begin{aligned}
\mathbf{Def\ 1\ [Source\ Invariance]}: & \quad \forall \mathcal{S}_{\text{bytes}}, \quad \mathcal{M}_{\text{Canonicalization}}(\mathcal{S}) \implies \mathcal{S} \text{ remains byte-for-byte immutable}. \\
\mathbf{Def\ 2\ [Traceability\ Completeness]}: & \quad \forall e \in \text{CanonicalElement}, \quad \operatorname{claimsSource}(e) \implies \exists \mathbf{\Pi}(e) = \{ \pi_1, \pi_2, \dots, \pi_k \},\ k \ge 1 \\
& \quad \text{where each } \pi_i = \langle \text{FamilyId}, \text{CandidateId}_i, \text{NodeId}_{i,j}, \text{EvidenceId}_{i,j,m}, \text{ByteRange}_i \rangle.
\end{aligned}$$

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        TRACEABILITY / PROVENANCE COMPLETENESS MODEL                     │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                   Canonical Question
                                          │
                                          ▼
                                Canonical Element (e.g. Stem / Option)
                                          │
                                          ▼
                         Provenance Mapping Set: Π(e) = { π₁, π₂, ... πₖ }
                                          │
                    ┌─────────────────────┴─────────────────────┐
                    ▼                                           ▼
             Provenance Mapping π₁                       Provenance Mapping π₂
         (English Source Contribution)               (Hindi Source Contribution)
                    │                                           │
                    ▼                                           ▼
           Physical Candidate A                        Physical Candidate B
      (Page 7, Recto, Sequence Index 15)          (Page 6, Verso, Sequence Index 16)
                    │                                           │
                    ▼                                           ▼
          DocumentGraph Nodes A                       DocumentGraph Nodes B
      (TextSpan, GlyphRuns, Box 2D)               (TextSpan, GlyphRuns, Box 2D)
                    │                                           │
                    ▼                                           ▼
           Source Evidence A                           Source Evidence B
     (PdfOperator, CoordinateMatrix)             (PdfOperator, CoordinateMatrix)
                    │                                           │
                    ▼                                           ▼
           Original PDF Bytes A                        Original PDF Bytes B
         (Immutably Referenced)                      (Immutably Referenced)
```

---

## 3. Decoupling Confidence from Relationship Verification

### 3.1 Corrected Evidence-Driven State Model

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [State 1] RELATIONSHIP_CANDIDATE                                                       │
│   Pairwise relationship hypothesis proposed by spatial / reading-order heuristics.     │
│   Contains algorithmic confidence score (0.00 - 1.00).                                 │
└────────────────────────────────────┬───────────────────────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [State 2] EVIDENCE_EVALUATION                                                          │
│   Rigorous evaluation of physical tokens against the 4-Tier Evidence Hierarchy:        │
│   - HARD Evidence Tokens Count (E_hard)                                                │
│   - SUPPORTING Evidence Tokens Count (E_supp)                                          │
│   - CONFLICTING Evidence Tokens Count (E_conf)                                         │
└────────────────────────────────────┬───────────────────────────────────────────────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           ▼                         ▼                         ▼
┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐
│ E_conf > 0            │ │ E_hard < 2 OR         │ │ E_hard >= 2 AND       │
│                       │ │ Ambiguity Detected    │ │ E_conf == 0           │
│        ▼              │ │        ▼              │ │        ▼              │
│ RELATIONSHIP_REJECTED │ │ RELATIONSHIP_PLAUSIBLE│ │ RELATIONSHIP_PROVEN   │
│ (Permanently Barred   │ │ (Flagged for Review;  │ │ (Formally Verified)   │
│  from Synthesis)      │ │  No Auto-Synthesis)   │ │                       │
└───────────────────────┘ └───────────────────────┘ └───────────┬───────────┘
                                                                │
                                                                ▼
                                                   ┌────────────────────────┐
                                                   │ Eligible for           │
                                                   │ Logical Question       │
                                                   │ Family Synthesis       │
                                                   └────────────────────────┘
```

---

## 4. Formal Relationship Semantics & Transitivity Boundaries

| Relationship Type | Directionality | Symmetry | Transitivity ($R(A,B) \land R(B,C) \implies R(A,C)$) | Can Create Family? | Can Merge Physical Nodes? | Implies Canonical Equivalence? |
| :--- | :---: | :---: | :--- | :---: | :---: | :---: |
| `SAME_LOGICAL_QUESTION` | Bidirectional | **SYMMETRIC** | **TRANSITIVE IF AND ONLY IF** $\operatorname{Variant}(A) \equiv \operatorname{Variant}(B) \equiv \operatorname{Variant}(C) \land \operatorname{OfficialId}(A) \equiv \operatorname{OfficialId}(B) \equiv \operatorname{OfficialId}(C)$. Otherwise **NON-TRANSITIVE**. | **YES** | **NO** | **YES** |
| `LANGUAGE_REPRESENTATION_OF` | Bidirectional | **SYMMETRIC** | **NON-TRANSITIVE**. $A \leftrightarrow B \land B \leftrightarrow C \not\implies A \leftrightarrow C$. (See Theorem 1). | **YES** | **NO** | **YES** (Multi-Script) |
| `VARIANT_OF` | Bidirectional | **SYMMETRIC** | **NON-TRANSITIVE**. Parameter variations form distinct items ($A \sim_{\text{var}} B \land B \sim_{\text{var}} C \not\implies A \sim_{\text{var}} C$). | **NO** | **NO** | **NO** (Distinct Canonical Questions) |
| `CONTINUATION_OF` | Unidirectional ($A \to B$) | **ASYMMETRIC** | **TRANSITIVE IF AND ONLY IF** Directed sequence chain is topologically acyclic and pages/reading order are strictly monotonic: $\operatorname{Page}(A) \le \operatorname{Page}(B) \le \operatorname{Page}(C) \land \operatorname{Seq}(A) < \operatorname{Seq}(B) < \operatorname{Seq}(C)$. Otherwise **NON-TRANSITIVE**. | **NO** | **YES** (Merges physical node sets) | **NO** (Forms 1 physical candidate) |
| `SHARED_STIMULUS_CHILD_OF` | Unidirectional ($Q \to S$) | **ASYMMETRIC** | **NON-TRANSITIVE**. Two child questions $Q_1, Q_2$ sharing stimulus $S$ does NOT make $Q_1 \sim Q_2$. | **NO** | **NO** | **NO** (Distinct Child Questions) |
| `POSSIBLE_DUPLICATE_CANDIDATE` | Bidirectional | **SYMMETRIC** | **NON-TRANSITIVE**. Suspected duplicates require manual review; never transitively merged. | **NO** | **NO** | **NO** |
| `REVISED_KEY_FOR` | Unidirectional ($K \to Q$) | **ASYMMETRIC** | **NON-TRANSITIVE**. Key revision applies strictly to target question IR. | **NO** | **NO** | **NO** (Answer Overlay) |
| `RELATED_BUT_DISTINCT` | Bidirectional | **SYMMETRIC** | **NON-TRANSITIVE**. Proximity or theme overlap does not propagate. | **NO** | **NO** | **NO** (Isolated Families) |
| `UNKNOWN_RELATIONSHIP` | Unidirectional | **ASYMMETRIC** | **NON-TRANSITIVE**. Unverified relation; no propagation. | **NO** | **NO** | **NO** |

---

## 5. Candidate Family Membership Vector

```typescript
export interface CandidateFamilyMembership {
  familyId: string;
  relationshipId: string;
  relationshipType: 'SAME_LOGICAL_QUESTION' | 'LANGUAGE_REPRESENTATION_OF';
  verificationState: 'VERIFIED' | 'REVIEW_REQUIRED' | 'PROVISIONAL';
  roleInFamily: 'PRIMARY_REFERENCE' | 'LANGUAGE_VARIANT' | 'CANONICAL_EQUIVALENT';
  supportingRelationships: string[]; // IDs of direct verified relationship edges
  conflictingRelationships: string[]; // IDs of flagged conflicting edges
  provenance: {
    sourceSnapshotId: string;
    evaluatedAt: number;
    algorithmId: string;
    algorithmVersion: string;
  };
}
```

---

## 6. Five Relational Topology Adversarial Cases

1. **Case A (The English-Hindi-English Triangle):** English A $\leftrightarrow$ Hindi B proven; Hindi B $\leftrightarrow$ English C proven; English A $\leftrightarrow$ English C unproven. A and C must NOT become equivalent via transitivity.
2. **Case B (SAME_LOGICAL_QUESTION + VARIANT_OF):** Transitivity barred; variants remain distinct families.
3. **Case C (SAME_LOGICAL_QUESTION + RELATED_BUT_DISTINCT):** Distinct questions isolated permanently.
4. **Case D (Double CONTINUATION_OF):** Transitive merging allowed if and only if page and sequence monotonicity is proven.
5. **Case E (SHARED_STIMULUS_CHILD_OF):** Children referencing same passage remain completely distinct questions.

---

## 7. Two-Stage Authorization Framework

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ STAGE A: ARCHITECTURE & CONTRACT AUTHORIZATION                                         │
│   Status: 🟢 ACCEPTED & FROZEN (Under Hardened Contracts in v3.0.0)                    │
└────────────────────────────────────┬───────────────────────────────────────────────────┘
                                     │
                                     ▼
══════════════════════════════════════════════════════════════════════════════════════════
  ⛔ STAGE B GATE: IMPLEMENTATION AUTHORIZATION (CURRENT STATUS: STRICTLY NOT AUTHORIZED)
══════════════════════════════════════════════════════════════════════════════════════════
```
