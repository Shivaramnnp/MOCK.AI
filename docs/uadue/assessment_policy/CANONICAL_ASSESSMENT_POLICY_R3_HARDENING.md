# Canonical Assessment-Policy Layer — Authority Universality Hardening (R3)
**Document Identifier:** `UADUE-SPEC-AP-R3-HARDENING-001`  
**Security Classification:** Restricted Engineering Specification  
**Status:** Architecture Specification Only — Zero Implementation  
**Gate:** Canonical Assessment-Policy Governance Gate (Hardening Pass R3)  
**Implementation Authorization:** 🔒 **STRICTLY LOCKED / ZERO IMPLEMENTATION**  
**Date:** 2026-10-08

---

## 1. Executive Summary & Purpose of R3 Hardening

Pass R2 successfully eliminated hardcoded execution pipelines, separated mathematical rationality from BigInt representation, and protected the read-only boundary of Phase 3.6. However, governance review identified that R2 still introduced **institution-specific assumptions masquerading as universal architecture**:
1. It mandated a "Controller of Examinations" signature for cohort statistics, ignoring private testing bodies, universities, and Mock.AI internal assessments.
2. It hardened a universal legal document precedence (`Gazette > Corrigendum > Circular...`), which is not universally legally sound across differing testing authorities.
3. It mandated a "human/committee interpretation", failing to accommodate authorized automated or individual expert interpreters.
4. It defined score domains using concrete examples (e.g., Scaled Score = "dropped-item redistribution") rather than technology-neutral, policy-delegated semantics.

**Pass R3 systematically hardens the architecture to be universal, source-class-independent, and institution-agnostic.**

---

## 2. R3-01 & R4-02: Source-Class-Independent Cohort Authority & Ingestion Actor Separation (GOV-AP-004)

The requirement that cohort statistics must be signed by a "Controller of Examinations" is formally **retracted**. "Controller of Examinations" is an institutional title specific to Indian statutory commissions and universities, not a universal architecture entity.

Furthermore, per **R4-02**, the architecture enforces strict tripartite separation between:
1. **AUTHORITY**: The authorized entity declaring cohort statistics valid (`authorityIdentity`, `authorityRole`).
2. **ATTESTATION / INTEGRITY**: The tamper-evident evidence verifying authenticity (`attestationEvidence`).
3. **INGESTION ACTOR**: The operational system or transport process registering the record (`ingestionActor`).

Operational software processes (e.g., `SYSTEM_BATCH_DAEMON`, `API_GATEWAY`) **must never** be conflated with academic or statutory authorities.

### 2.1 The Hardened `CohortAuthorityRecord`
The architecture establishes an institution-agnostic, source-class-independent model:

```typescript
/** Pure Architectural Specification — Zero Implementation */
export interface CohortAuthorityRecord {
  /** Unique identifier of the sealed cohort observation dataset */
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
  /** Explicit identity of the authorized individual, committee, or body */
  readonly authorityIdentity: string;

  /** Organizational / statutory role of the declaring authority */
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

### 2.2 Authority Delegation Rule & Operational Actor Boundaries
- Who qualifies as an authorized declaring authority (`authorityIdentity`, `authorityRole`) is **delegated entirely to the applicable `EXAM_POLICY_PROFILE`**.
- An operational software daemon (`SYSTEM_BATCH_DAEMON`) can be an `ingestionActor`, but is **strictly prohibited** from masquerading as the declaring authority.
- **Status of GOV-AP-004:** Remains **`UNRESOLVED / SOURCE-CLASS DEPENDENT`**.

---

## 3. R3-02: Source-Specific Authority Precedence (Reopening GOV-AP-003)

The previous hardcoded hierarchy:
$$\text{Gazette} \succ \text{Corrigendum} \succ \text{Circular} \succ \text{Notification} \succ \text{Ruling} \succ \text{Mock.AI Profile}$$
is formally **retracted**. Assuming universal legal precedence across differing jurisdictions, private tests, and foreign exams is legally and architecturally invalid.

### 3.1 The Principle of Source-Specific Authority Precedence
1. **No Universal Precedence**: Document type A does not universally outrank document type B across all testing contexts.
2. **Explicit Profile Precedence**: For each examination authority and cycle, the applicable `EXAM_POLICY_PROFILE` must explicitly establish its source precedence rules, document scopes, and supersession links.
3. **Fail-Closed on Conflict**:
   If two documents conflict and their relative precedence is not explicitly established in the active policy profile:
   $$\text{Precedence Undefined} \implies \mathbf{AUTHORITY\_CONTRADICTION} \implies \mathbf{QUARANTINE}$$
   - The engine must **NEVER guess**.
   - The engine must **NEVER automatically pick the "latest" document**.
   - The attempt or policy compilation is quarantined pending human governance sign-off.
4. **Status of GOV-AP-003:** Formally re-opened and classified as **`UNRESOLVED / SOURCE-CLASS DEPENDENT`**.

---

## 4. R3-03: Generalized Policy Interpretation Authority

The phrase "human/committee interpretation" is formally replaced with:
$$\mathbf{Authorized \, Policy \, Interpretation}$$

Not all testing bodies use committees. A university may use a Department Chair; a private testing body may use a designated psychometrician; a mock testing engine may use an authorized domain lead.

### 4.1 The Conceptual `PolicyInterpreterAuthority`
```typescript
/** Pure Architectural Specification — Zero Implementation */
export interface PolicyInterpreterAuthority {
  /** Identity of the interpreting individual, committee, or system role */
  readonly interpreterIdentity: string;

  /** Scope of interpretation authority */
  readonly authorizationScope: string; // e.g. "TENANT_UPSC_ALL", "MOCK_AI_INTERNAL_TESTS"

  /** Version of the operational interpretation */
  readonly interpretationVersion: string;

  /** Verified pointers to Tier 1 Source Authority Records */
  readonly sourceReferences: readonly string[];

  /** Documented rationale translating source evidence into operational algorithms */
  readonly interpretationRationale: string;

  /** Temporal validity interval */
  readonly effectivePeriod: {
    readonly effectiveFrom: string;
    readonly effectiveUntil: string | null;
  };

  /** Predecessor interpretation version in the supersession DAG */
  readonly supersedesInterpretationId: string | null;
}
```

---

## 5. R3-04: Technology-Neutral Score Domain Language

To prevent specific test practices from hardening into universal mathematical definitions, the nine score domains are redefined in strictly technology-neutral, policy-delegated terms:

| # | Score Domain | Universal Architectural Definition | Delegated Responsibility |
|---|---|---|---|
| **1** | **Raw Score** | Direct algebraic sum of authoritative item-level awarded marks ($\sum_{i=1}^N m_i$). | Evaluated and frozen in Phase 3.5 Delivery. |
| **2** | **Aggregate Score** | A derived paper-level score produced by an authorized aggregation transformation (e.g. section caps, component weights, or optional question rules). | Concrete aggregation algorithm defined in policy. |
| **3** | **Scaled Score** | A derived score produced by an authorized scaling transformation (e.g. valid denominator rescaling, base mark re-anchoring, or dropped-item redistribution). | Concrete scaling algorithm defined in policy. |
| **4** | **Normalized Score** | A derived score produced by an authorized normalization transformation (e.g. cross-shift cohort parameter alignment or statistical distribution mapping). | Concrete normalization formula defined in policy. |
| **5** | **Equated Score** | A derived score produced by an authorized equating transformation (e.g. psychometric form difficulty adjustment, equipercentile equating, or IRT scaling). | Concrete equating model defined in policy. |
| **6** | **Percentile** | A relative distributional metric indicating the percentage of an authorized candidate cohort scoring at or below a given candidate. | Mapped to Ranking & Merit Domain (`GOV-AP-002`). |
| **7** | **Qualification** | A categorical eligibility determination evaluated by comparing candidate performance against authorized qualifying criteria. | Mapped to Qualification Domain (`GOV-AP-001`). |
| **8** | **Rank** | An ordinal position assigned to a candidate within an authorized population according to designated merit ordering and tie-breaking rules. | Mapped to Ranking & Merit Domain (`GOV-AP-002`). |
| **9** | **Result Classification** | An administrative or academic status label (e.g. pass, fail, provisional, withheld) assigned to a completed assessment attempt. | Mapped to Result Administration Domain (`GOV-AP-010`). |

*Core Rule:* Concrete mathematical formulas belong exclusively to the applicable policy profile, not the canonical domain definition.

---

## 6. R3-05 & R4-01/R4-04: The Hardened Authoritative Graph

The revised graph shows the strict separation between Evidence, Interpretation, Executable Specification, and Execution, without embedding institution-specific roles, universal document hierarchies, or fixed pipeline execution order:

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

---

## 7. R3-06: Hardened Governance Decision Register

Decisions `GOV-AP-003` and `GOV-AP-004` are formally returned to **`UNRESOLVED / SOURCE-CLASS DEPENDENT`**:

$$\text{Status} \in \{ \mathbf{RESOLVED}, \, \mathbf{UNRESOLVED}, \, \mathbf{DEFERRED}, \, \mathbf{BLOCKED} \}$$

| Decision ID | Title | Hardened Status | Rationale for Classification | Implementation Scope Blocked |
|---|---|---|---|---|
| **GOV-AP-001** | Qualification & Eligibility Ownership | **`UNRESOLVED`** | Candidate separate domain; mark engine does not evaluate quotas. | Qualification policy evaluators, category cutoffs. |
| **GOV-AP-002** | Ranking & Merit List Ownership | **`UNRESOLVED`** | Candidate separate domain; prohibited from entering Phase 3.6. | Ranking engines, full-cohort sorting, tie-breakers. |
| **GOV-AP-003** | Statutory Source Authority Model | **`UNRESOLVED`** | Precedence is source-class-dependent; universal hierarchy rejected. | Source ingestion adapters. |
| **GOV-AP-004** | Cohort Data Authority & Ingestion | **`UNRESOLVED`** | Generalized `CohortAuthorityRecord` defined; issuer is source-dependent. | Cohort equating evaluators. |
| **GOV-AP-005** | Policy AST / DSL Selection | **`UNRESOLVED`** | 10-criteria comparison complete; DSL selection pending governance. | Dynamic formula parsers and execution sandboxes. |
| **GOV-AP-006** | Numerical Representation & Bounds | **`RESOLVED`** | Exact rational requirements defined; $2^{256}$ and depth 32 as candidate DoS caps. | Concrete math library implementation. |
| **GOV-AP-007** | Cryptographic Trust & Signature Model | **`DEFERRED`** | Separated into Invariant I-B; specific PKI/HSM deferred to deployment. | Cryptographic key adapters. |
| **GOV-AP-008** | Historical Replay Specification | **`RESOLVED`** | Replay defined under 11-element pinned execution specification $\mathcal{E}_{\text{pin}}$. | Replay verification scripts. |
| **GOV-AP-009** | Policy Composition Boundaries | **`RESOLVED`** | Acyclic policy-driven stage composition model established; zero cycles/double-norm. | Pipeline orchestrators and execution dispatchers. |
| **GOV-AP-010** | Result Classification Ownership | **`UNRESOLVED`** | Candidate Result Admin domain; decoupled from scoring math. | Classification status resolvers. |

---

## 8. R3-07: Mandatory Self-Audit Findings

1. `git status` / `git diff` executed: Confirms zero modifications to source files, database migrations, schemas, or configurations.
2. Certified baselines verified: Phase 2A–2D8 certified & frozen; Phase 3.1–3.5 certified & closed; Phase 3.6 strictly locked.
3. Zero implementation verified: Exactly zero `.ts`, `.tsx`, `.js`, or `.sql` files created or modified. All changes are pure documentation under `docs/uadue/assessment_policy/`.

---

```text
================================================================================
FINAL GATE DECISION:
🟡 ARCHITECTURE COMPLETE — GOVERNANCE AUTHORIZATION REQUIRED

Assessment Policy Implementation:  🔒 STRICTLY LOCKED
Qualification Domain:              🔒 STRICTLY LOCKED (GOV-AP-001 Unresolved)
Ranking & Merit Domain:            🔒 STRICTLY LOCKED (GOV-AP-002 Unresolved)
Source Authority Precedence:       🔒 STRICTLY LOCKED (GOV-AP-003 Unresolved)
Cohort Authority Model:            🔒 STRICTLY LOCKED (GOV-AP-004 Unresolved)
Policy DSL Engine:                 🔒 STRICTLY LOCKED (GOV-AP-005 Unresolved)
Phase 3.6 Gateway:                 🔒 STRICTLY LOCKED
================================================================================
```
