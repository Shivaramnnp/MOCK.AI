# Canonical Assessment-Policy Layer — Final Graph Consistency & Trust-Boundary Hardening (Pass R4)
**Document Identifier:** `UADUE-SPEC-AP-R4-CONSISTENCY-001`  
**Security Classification:** Restricted Engineering Specification  
**Status:** Architecture Specification Only — Zero Implementation  
**Gate:** Canonical Assessment-Policy Governance Gate (Consistency Hardening Pass R4)  
**Implementation Authorization:** 🔒 **STRICTLY LOCKED / ZERO IMPLEMENTATION**  
**Frozen Baselines:** Phase 2A–2D8 (🟢 Certified & Frozen), Phase 3.1–3.5 (🟢 Closed & Frozen), Phase 3.6 (🔒 Strictly Locked)  
**Date:** 2026-10-08

---

## 1. Executive Summary & Purpose of Pass R4

Pass R3 successfully resolved the authority-universality contradiction by recognizing source-class diversity and retracting rigid institutional assumptions (e.g. "Controller of Examinations"). However, governance review identified two subtle but critical remaining architectural contradictions:

1. **Authoritative Graph Execution Order Regression (R4-01):**  
   While narrative text correctly stated that stage composition is an acyclic policy-defined DAG, the authoritative ASCII diagram visually reintroduced a universal linear sequence:
   $$\text{[Aggregate Scoring]} \longrightarrow \text{[Scaling Stage]} \longrightarrow \text{[Normalization Stage]}$$
   Because the authoritative architecture graph is itself a binding technical specification, future implementers could interpret this visual flow as mandatory pipeline ordering.

2. **Conflation of Declaring Authority and Operational Transport (R4-02):**  
   In `CohortAuthorityRecord`, `SYSTEM_BATCH_DAEMON` appeared as an illustrative `issuerRole`. An automated software process that transports or calculates batch statistics is an operational ingestion actor, not an academic, institutional, or statutory authority declaring the dataset valid.

3. **Mandatory Cryptographic Terminology in Architecture Graph (R4-03):**  
   The graph labeled the evidence transition as `(Attestation & Cryptographic Ingestion)`. While tamper-evident integrity is an architectural requirement, labeling it "Cryptographic Ingestion" prematurely hardcoded a specific cryptographic mechanism into the visual architecture.

**Pass R4 completely eliminates these contradictions, hardens the trust boundary, performs an exhaustive relationship edge audit, and brings the Canonical Assessment-Policy architecture specification to a fully consistent, governance-ready state.**

---

## 2. R4-01: Universal Pipeline Order Elimination & Policy-Declared Stage DAG

### 2.1 The Principle of Zero Pipeline Universalism
Different competitive examinations and institutional testing bodies operate under radically divergent assessment structures:
- **Single-Shift Papers (e.g. UPSC Prelims, GATE Single Session):** Require aggregate scoring, negative-marking balance, and optional dropped-item rescaling, but **zero cohort normalization or equating**.
- **Multi-Shift Equated Exams (e.g. GATE Multi-Session, SSC CHSL):** May apply direct interpolation or formulaic equating directly to raw aggregate marks without intermediate rescaling.
- **Percentile-First Testing (e.g. NTA JEE Main, CUET):** Compute raw distribution percentiles directly from shift scores without linear mark rescaling.

Therefore, **any sequential arrow linking aggregate scoring to scaling to normalization in the canonical engine is an architectural contradiction**.

### 2.2 Formal Policy Stage DAG Topology
Within the Canonical Assessment-Policy Engine, candidate transformations execute as an **Acyclic Directed Graph (DAG)** declared strictly within the pinned policy specification:

$$\mathcal{G}_{\text{stages}} = (V, E), \quad V \subseteq \{ \text{Aggregate}, \, \text{Scale}, \, \text{Normalize}, \, \text{Equate}, \, \text{CustomTransform} \}, \quad E \subset V \times V$$

$$\forall v \in V, \quad \text{InDegree}(v) \ge 0, \quad \text{Cycles}(\mathcal{G}) = \emptyset$$

```text
CANONICAL ASSESSMENT-POLICY ENGINE

Policy-Declared Acyclic Stage DAG
    ├── Aggregate Stage
    ├── Scaling Stage
    ├── Normalization Stage
    ├── Equating Stage
    └── Other Authorized Assessment Stage

"Stage existence and execution ordering are policy-defined."
Zero universal pipeline ordering implied.
```

- **Root Input Invariant:** Every declared stage DAG is strictly rooted in immutable Phase 3.5 delivery raw marks (`totalRawScore`) and Phase 2D-5 item dispositions (`awardedMarks`).
- **Topological Execution:** The engine validates acyclicity ($\text{Cycles} = \emptyset$) at policy compile/pinning time and executes stages in policy-declared topological order.
- **Double-Transformation Prevention:** Type guards enforce that normalized or equated scores cannot be re-fed into normalization algorithms unless explicitly authorized by a multi-tier policy contract.

---

## 3. R4-02: Trust Boundary Hardening — Tripartite Separation

The architecture establishes a strict tripartite separation within cohort observation handling to prevent operational software from quietly assuming statutory or academic authority.

### 3.1 The Three Independent Concepts
1. **AUTHORITY (`AuthorityIdentity`, `AuthorityRole`):**  
   The natural person, academic committee, governing board, or institutional entity possessing the formal jurisdiction to declare that a cohort dataset constitutes authoritative ground truth.
2. **ATTESTATION & INTEGRITY (`AttestationEvidence`):**  
   The verifiable proof (e.g. hash digest, signature token, sealed audit event) establishing that the dataset is authentic, complete across declared shifts, and tamper-evident.
3. **INGESTION ACTOR (`IngestionActor`):**  
   The operational software daemon, API gateway, manual administrative script, or ETL process that transported, parsed, or registered the dataset into the runtime repository.

$$\mathbf{Authority} \neq \mathbf{Attestation} \neq \mathbf{IngestionActor}$$

An automated ingestion script (e.g. `SYSTEM_BATCH_DAEMON`) is an **Ingestion Actor**. It is strictly prohibited from being designated as an **Authority Role**.

### 3.2 Canonical `CohortAuthorityRecord` Contract (Zero-Implementation Specification)

```typescript
/** Pure Architectural Specification — Zero Implementation */
export interface CohortAuthorityRecord {
  /** Unique immutable identifier of the sealed cohort observation dataset */
  readonly cohortRecordId: string;

  /** Source classification of the declaring testing authority */
  readonly authorityClass: 
    | "STATUTORY_GOVERNMENT_COMMISSION"  // e.g. UPSC, SSC, State PSC
    | "PUBLIC_UNIVERSITY_OR_INSTITUTE"   // e.g. IITs, IISc, Central Universities
    | "PRIVATE_TESTING_ORGANIZATION"     // e.g. Prometric, Pearson VUE, ETS
    | "COACHING_OR_ACADEMIC_INSTITUTE"   // e.g. Test preparation academy
    | "INTERNAL_PLATFORM_TEST_AUTHORITY" // e.g. Mock.AI synthetic test authority
    | "HISTORICAL_BENCHMARK_ARCHIVE";    // e.g. Historical public datasets

  // =========================================================================
  // 1. AUTHORITY: The Authorized Declaring Entity
  // =========================================================================
  /** Explicit identity of the authorized declaring individual, committee, or body */
  readonly authorityIdentity: string;

  /** Institutional / statutory role of the declaring authority */
  readonly authorityRole: string; // e.g. "CHIEF_EXAMINER", "PSYCHOMETRIC_LEAD", "EXAMINATION_BOARD" (Source-dependent)

  // =========================================================================
  // 2. ATTESTATION & INTEGRITY: Tamper-Evidence & Verification Proof
  // =========================================================================
  /** Verifiable proof that the record is authentic and tamper-evident */
  readonly attestationEvidence: {
    readonly digestOrPayload: string;
    readonly verificationMethod: 
      | "DIGITAL_SIGNATURE" 
      | "HMAC_TOKEN" 
      | "MUTUAL_TLS_SYSTEM_ATTESTATION" 
      | "ADMINISTRATIVE_AUDIT_LOG"
      | "OTHER_VERIFIABLE_PROOF";
    readonly attestationTimestamp: string; // ISO-8601 UTC
  };

  // =========================================================================
  // 3. INGESTION ACTOR: Operational Software / Transport Process
  // =========================================================================
  /** The operational transport process that ingested or registered the record */
  readonly ingestionActor: {
    readonly actorType: 
      | "SYSTEM_BATCH_DAEMON" 
      | "OPERATIONAL_API_GATEWAY" 
      | "MANUAL_ADMIN_IMPORT" 
      | "CLI_INGESTION_TOOL";
    readonly actorIdentifier: string; // e.g. "batch-worker-01", "ops-runner-prod"
    readonly ingestedAt: string;      // ISO-8601 UTC
  };

  /** Reference to the primary examination or source event */
  readonly sourceReference: string;

  /** Unique cohort dataset identifier bound to paper and cycle */
  readonly cohortIdentity: string;

  /** Target examination cycle */
  readonly examCycle: string;

  /** Explicit list of shift / session identifiers included in this cohort */
  readonly shiftSessionScope: readonly string[];

  /** Total candidate observations verified in this cohort */
  readonly totalCandidateCount: number;

  /** Verifiable proof of dataset completeness across all declared shifts */
  readonly completenessEvidence: {
    readonly isComplete: boolean;
    readonly missingShiftCount: number;
    readonly verifiedShiftCount: number;
  };

  /** Validity interval during which this cohort may be legally evaluated */
  readonly validityInterval: {
    readonly effectiveFrom: string;
    readonly effectiveUntil: string | null;
  };

  /** Predecessor cohort record ID if this represents a re-computation */
  readonly supersedesCohortId: string | null;
}
```

---

## 4. R4-03: Neutralization of Ingestion & Integrity Semantics

In accordance with technology neutrality principles (Invariant I-B):
- The phrase `"Attestation & Cryptographic Ingestion"` is permanently replaced by **`"Attestation / Integrity Verification"`**.
- The architecture requires **verifiable integrity and provenance**, but explicitly refrains from freezing a mandatory cryptographic implementation mechanism at the architectural layer.
- Candidate verification mechanisms include:
  - Cryptographic hashes (SHA-256 / SHA-512)
  - Hash-based message authentication codes (HMAC)
  - Asymmetric digital signatures (Ed25519 / ECDSA / RSA-PSS)
  - Public Key Infrastructure (PKI) certificates
  - Hardware Security Module (HSM) attestations
  - Immutable append-only audit log receipts
- The choice of concrete mechanism is delegated to deployment/security policy configuration (`GOV-AP-007`), preventing premature vendor or algorithmic lock-in.

---

## 5. R4-04: Full Relationship Edge Audit of the Final Authoritative Architecture Graph

### 5.1 The Master Authoritative Architecture Graph
```text
┌────────────────────────────────────────────────────────────────────────┐
│ EXTERNAL EVIDENCE LAYER (Statutory, Institutional, or Test Ground Truth│
│ Official Gazette, Examination Notification, Answer Key, Policy Spec    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ [Relationship: Provenance & Ingestion (B)]
                                    │ (Attestation / Integrity Verification)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ SOURCE AUTHORITY RECORD (Attestation Evidence Layer)                   │
│ Document URI, Integrity Evidence, Issuing Authority Class, Timestamp   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ [Relationship: Operational Interpretation (C)]
                                    │ (Authorized Translation — PolicyInterpreterAuthority)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ AUTHORIZED POLICY INTERPRETATION (Interpretation Layer)                │
│ Operational Translation Resolving Natural Language into Formal Rules   │
└──────────────────┬─────────────────────────────────┬───────────────────┘
                   │                                 │
                   │ [Relationship: Interpretation]  │ [Relationship: Interpretation]
                   ▼ (Item Key Interpretation)       ▼ (Paper Scheme Interpretation)
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│ PHASE 2D-5: CANONICAL ITEM EVALUATOR │  │ CANONICAL ASSESSMENT POLICY  │
│ (FROZEN 🟢 — ITEM TRUTH)             │  │ SPECIFICATION (GOVERNED 🟡)   │
│ • Item Correctness & Dispositions    │  │ • Pinned Policy AST Version  │
│ • Item Awarded Marks                 │  │ • Policy-Declared Stage DAG  │
└──────────────────┬───────────────────┘  └──────────────┬───────────────┘
                   │                                     │
                   │ [Relationship: Data Dependency (D)] │
                   ▼ (Authoritative Item Marks)          │
┌──────────────────────────────────────┐                 │
│ PHASE 3.5: DELIVERY RUNTIME (FROZEN) │                 │
│ • totalRawScore = Σ awardedMarks     │                 │
│ • totalNormalizedScore = NULL        │                 │
└──────────────────┬───────────────────┘                 │
                   │                                     │
                   └──────────────────┬──────────────────┘
                                      │ [Relationship: Execution Input Dependency (D, E)]
                                      │ (Pure Evaluation Event: F(S, P))
                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│ CANONICAL ASSESSMENT-POLICY ENGINE (PURE MATHEMATICAL EVALUATOR)        │
│                                                                        │
│ Policy-Declared Acyclic Stage DAG:                                     │
│                  ┌→ Aggregate Stage                                    │
│                  ├→ Scaling Stage                                      │
│ Policy DAG ──────┼→ Normalization Stage                                │
│                  ├→ Equating Stage                                     │
│                  └→ Other Authorized Assessment Stage                  │
│                                                                        │
│ "Stage existence and execution ordering are policy-defined."           │
│ Zero universal pipeline ordering implied.                             │
│ Emits Pure Derived Assessment Outputs (Scaled / Normalized Marks)      │
└──────────────────┬─────────────────────────────────┬───────────────────┘
                   │                                 │
                   │ [Relationship: Data Dependency] │ [Relationship: Data Dependency]
                   ▼ (Pure Assessment Outputs)       ▼ (Pure Assessment Outputs)
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│ 🟡 QUALIFICATION DOMAIN              │  │ 🟡 RANKING & MERIT DOMAIN    │
│ (UNRESOLVED — GOV-AP-001)            │  │ (UNRESOLVED — GOV-AP-002)    │
│ • Category Reservation Cutoffs       │  │ • Full-Cohort Percentile Rank│
│ • Sectional Minimum Qualifying Marks │  │ • Demographic Tie-Breaking   │
└──────────────────┬───────────────────┘  └──────────────┬───────────────┘
                   │                                     │
                   └──────────────────┬──────────────────┘
                                      │ [Relationship: Read-Only Projection (F)]
                                      │ (Sealed Result Projection DTOs)
                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 3.6: RESULT PROJECTION GATEWAY (STRICTLY LOCKED 🔒)              │
│ Pure Read-Only Scorecard UI & Transcript Projection (Zero Math)        │
└────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Rigorous Edge-by-Edge Relationship Taxonomy Audit

The architecture defines a formal six-class relationship taxonomy:
- **A. Authority:** Jurisdiction/legal right to establish ground truth.
- **B. Provenance:** Lineage tracing back to source documents or upstream immutable baselines.
- **C. Interpretation:** Formal human/authorized mapping converting natural language into unambiguous specifications.
- **D. Dependency:** Data or functional prerequisite input required for execution.
- **E. Execution:** Pure evaluation event in a sandboxed, memory-bounded, zero-I/O runtime.
- **F. Projection:** Read-only formatting and presentation of sealed outputs without transformation.

| # | Edge Source $\to$ Target | Declared Edge Semantics | Taxonomy Code | Invariant & Operational Guarantee |
|---|---|---|---|---|
| **1** | External Evidence $\to$ Source Authority Record | Ingestion & Integrity Verification | **B (Provenance)** | Ingests statutory/institutional source assets with tamper-evident proof. **Zero automatic source-to-code compilation.** |
| **2** | Source Authority Record $\to$ Authorized Policy Interpretation | Formal Operationalization | **C (Interpretation)** | Explicit translation by authorized `PolicyInterpreterAuthority`. Resolves natural language ambiguities into formal specifications. |
| **3** | Policy Interpretation $\to$ Phase 2D-5 Evaluator | Item Key Specification | **A (Authority)** & **C (Interpretation)** | Feeds item-level keys and scoring rules (`positiveMarks`, `negativeMarks`). Frozen in certified Phase 2D-5. |
| **4** | Policy Interpretation $\to$ Assessment Policy Spec | Paper Scheme Specification | **A (Authority)** & **C (Interpretation)** | Establishes paper-level transformation AST, stage DAG topology, and rounding directives. |
| **5** | Phase 2D-5 Evaluator $\to$ Phase 3.5 Delivery | Item Marks Flow | **D (Dependency)** | Phase 3.5 accepts immutable `ScoreEvaluationRecord`s. Computes `totalRawScore = Σ awardedMarks`. `totalNormalizedScore = null`. |
| **6** | Phase 3.5 Delivery + Policy Spec $\to$ Assessment Policy Engine | Pure Evaluation Dispatch | **D (Dependency)** & **E (Execution)** | Dispatches pure evaluation event $F(S, P)$. Engine is a memory-bounded sandbox with exact rational arithmetic. |
| **7** | Inside Assessment Policy Engine | Policy-Declared Stage DAG | **E (Execution)** | Stages execute strictly in policy-declared topological order. **Zero universal ordering implied.** |
| **8** | Assessment Engine $\to$ Qualification Domain | Pure Assessment Handoff | **D (Dependency)** | Emits transformed marks. Qualification Domain evaluates cutoffs against candidate demographic attributes. Unresolved (GOV-AP-001). |
| **9** | Assessment Engine $\to$ Ranking & Merit Domain | Cohort Score Handoff | **D (Dependency)** | Emits transformed marks. Ranking Domain evaluates full-cohort percentiles and tie-breaking. Unresolved (GOV-AP-002). |
| **10**| Assessment Engine / Domains $\to$ Phase 3.6 Gateway | Result Projection | **F (Projection)** | Phase 3.6 maps sealed result DTOs into user scorecards and transcripts. **Zero math, zero mutation.** Strictly locked. |

---

## 6. R4-05: Confirmed Governance Decision Register Baseline

The governance decision register is strictly preserved with all unresolved and source-class-dependent classifications intact:

| Decision ID | Domain Title | Formal Status | Reason for Classification | Blocked Implementation Scope |
|---|---|---|---|---|
| **GOV-AP-001** | Qualification & Eligibility Ownership | **`UNRESOLVED`** | Candidate separate domain; mark transformation engine does not evaluate quotas. | Category cutoffs, reservation quotas, eligibility logic. |
| **GOV-AP-002** | Ranking & Merit List Ownership | **`UNRESOLVED`** | Candidate separate domain; prohibited from entering Phase 3.6. | Full-cohort sorting, percentiles, demographic tie-breakers. |
| **GOV-AP-003** | Statutory Source Authority Model | **`UNRESOLVED / SOURCE-CLASS DEPENDENT`** | Legal hierarchy varies by authority class; universal hierarchy rejected. | Source document ingestion adapters. |
| **GOV-AP-004** | Cohort Data Authority & Ingestion Model | **`UNRESOLVED / SOURCE-CLASS DEPENDENT`** | Issuer role varies by authority class; software daemon is operational actor only. | Multi-session cohort equating evaluators. |
| **GOV-AP-005** | Policy AST / DSL Selection | **`UNRESOLVED`** | 10-criteria evaluation complete; selection pending institutional governance. | Dynamic AST parsers and execution sandboxes. |
| **GOV-AP-006** | Numerical Semantics & Bounds | **`RESOLVED` (Conceptual)** | Exact coprime rational arithmetic required; $2^{256}$ and depth 32 as candidate DoS caps. | Concrete BigInt rational libraries. |
| **GOV-AP-007** | Cryptographic Trust Model | **`DEFERRED`** | Technology-neutral Invariant I-B established; specific PKI/HSM deferred to deployment. | Cryptographic key management modules. |
| **GOV-AP-008** | Historical Replay Specification | **`RESOLVED` (Architectural)** | Pinned execution tuple $\mathcal{E}_{\text{pin}}$ defined across 11 immutable elements. | Long-term virtualization and archive adapters. |
| **GOV-AP-009** | Policy Composition Boundaries | **`RESOLVED` (Architectural)** | Policy-declared acyclic DAG established; zero universal pipeline ordering. | Pipeline orchestrators and stage dispatchers. |
| **GOV-AP-010** | Result Classification Ownership | **`UNRESOLVED`** | Candidate Result Admin domain; decoupled from scoring arithmetic. | Administrative pass/fail/withheld status resolvers. |

---

## 7. R4-06: Strict Non-Expansion Boundary Audit

Pass R4 has strictly maintained the zero-expansion boundary:
- **Zero New Scoring Domains Added:** The nine score domains remain unchanged and technology-neutral.
- **Zero New Statutory Claims Asserted:** No assumptions regarding gazette precedence, court hierarchies, or quota legislation have been introduced.
- **Zero Exam-Specific Formulas Added to Core:** Formulas from GATE, SSC, or UPSC remain explicitly classified as illustrative examples (Tier F).
- **Zero Implementation Technologies Added:** No libraries, runtime dependencies, database schemas, or microservice components have been introduced.

---

## 8. R4-07: Final Self-Audit & Zero-Implementation Certification

A rigorous forensic audit of the repository verifies absolute compliance with the zero-implementation mandate:

```bash
git status --short
```
- **Source Code Files Modified:** 0 (`.ts`, `.tsx`, `.js`, `.py`, `.sql`)
- **Database Tables / Migrations Created:** 0
- **Phase 2 Contracts Modified:** 0 (Phase 2A–2D8 remains 🟢 Certified & Frozen)
- **Phase 3.1–3.5 Delivery Modified:** 0 (Phase 3.5 remains 🟢 Frozen — Raw Score Only)
- **Phase 3.6 Gateway Modified:** 0 (Phase 3.6 remains 🔒 Strictly Locked)
- **Implementation Stubs / Placeholders Created:** 0
- **Dependencies Installed / `package.json` Modified:** 0

All work conducted under Pass R4 consists **exclusively of architectural documentation and formal specification hardening**.

---

## 9. Final Governance Gate Declaration

With the successful resolution of R4-01 through R4-04:

```text
================================================================================
                    FINAL GOVERNANCE GATE CLASSIFICATION
================================================================================

  🟢 CANONICAL ASSESSMENT-POLICY ARCHITECTURE SPECIFICATION
     GOVERNANCE-READY & INTERNALLY CONSISTENT

  🔒 IMPLEMENTATION STATUS:
     STRICTLY LOCKED — ZERO IMPLEMENTATION PERMITTED

================================================================================
```

No implementation authorization is granted or inferred. Any production coding, database schema definition, or formula evaluation implementation requires a separate, explicit governance authorization gate.
