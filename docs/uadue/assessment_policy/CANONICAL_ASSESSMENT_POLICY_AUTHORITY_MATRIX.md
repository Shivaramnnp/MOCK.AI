# Canonical Assessment-Policy Layer — Authority Ownership Matrix & Current Authority Inventory
**Document ID:** `UADUE-SPEC-CAP-001`  
**Governance State:** Architecture Specification Only — Zero Implementation  
**Gate:** Canonical Assessment-Policy Governance Gate (Consistency Hardening Pass R4)  
**Implementation Authorization:** 🔒 **STRICTLY LOCKED / ZERO IMPLEMENTATION**  
**Frozen Baselines:** Phase 2A–2D8 (🟢 Certified & Frozen), Phase 3.1–3.5 (🟢 Closed & Frozen), Phase 3.6 (🔒 Strictly Locked)  
**Date:** 2026-10-08

---

## 1. R4-01 & R4-04: Authoritative Architecture Graph & Relationship Semantics

The architecture enforces strict separation between **Evidence**, **Interpretation**, **Executable Policy**, and **Runtime Evaluation**. An official statutory or institutional document can **never** directly become executable software logic without an authorized policy interpretation step.

Furthermore, **zero universal pipeline ordering is implied**. The Canonical Assessment-Policy Engine executes an acyclic stage graph where stage existence, composition, and execution ordering are determined **exclusively** by the active, pinned policy version.

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
│ Document URI, Digest SHA-256, Issuing Authority Class, Timestamp       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (Authorized Translation — PolicyInterpreterAuthority)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ AUTHORIZED POLICY INTERPRETATION (Interpretation Layer)                │
│ Operational Translation Resolving Natural Language into Formal Rules   │
└──────────────────┬─────────────────────────────────┬───────────────────┘
                   │                                 │
                   │ [Relationship: Interpretation (C)]
                   │                                 │ [Relationship: Interpretation (C)]
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

### 1.1 R4-04: Authoritative Graph Relationship Edge Taxonomy Audit

Every relationship edge in the authoritative architecture graph is rigorously classified according to formal relationship semantics:

| Edge From $\to$ To | Declared Relationship | Formal Taxonomy Code | Invariant & Operational Guarantee |
|---|---|---|---|
| **External Evidence $\to$ Source Authority Record** | Ingestion & Integrity Verification | **B (Provenance)** | Documents are ingested with tamper-evident integrity evidence (hash, MAC, signature, audit log). Zero automatic code generation. |
| **Source Authority Record $\to$ Policy Interpretation** | Operational Translation | **C (Interpretation)** | Explicit interpretation performed by `PolicyInterpreterAuthority`. Translates natural language into unambiguous formal specifications. |
| **Policy Interpretation $\to$ Phase 2D-5** | Item Key Translation | **A (Authority)** & **C (Interpretation)** | Governs single-item answer keys and item marks. Frozen and certified in upstream Phase 2D-5. |
| **Policy Interpretation $\to$ Assessment Policy Spec** | Paper Scheme Translation | **A (Authority)** & **C (Interpretation)** | Governs paper-level and multi-shift transformation rules, DAG structure, and rounding directives. |
| **Phase 2D-5 $\to$ Phase 3.5 Delivery** | Item Marks Flow | **D (Dependency)** | Phase 3.5 consumes authoritative `ScoreEvaluationRecord`s. Computes `totalRawScore = Σ awardedMarks`. `totalNormalizedScore = null`. |
| **Phase 3.5 + Policy Spec $\to$ Assessment Engine** | Pure Evaluation Dispatch | **D (Dependency)** & **E (Execution)** | Pure mathematical function evaluation $F(S, P)$ within a hermetic sandbox. Zero I/O, exact rational arithmetic. |
| **Inside Assessment Policy Engine (Stage DAG)** | Policy-Declared Execution | **E (Execution)** | Stages (Aggregate, Scale, Normalize, Equate, etc.) execute in topological order defined exclusively by the active policy version. **Zero universal ordering.** |
| **Assessment Engine $\to$ Qualification Domain** | Pure Score Handoff | **D (Dependency)** | Assessment engine emits pure transformed marks. Qualification Domain evaluates candidate category eligibility. Unresolved domain (GOV-AP-001). |
| **Assessment Engine $\to$ Ranking & Merit Domain** | Cohort Score Handoff | **D (Dependency)** | Assessment engine emits pure scores. Ranking Domain evaluates full-cohort sorting and percentiles. Unresolved domain (GOV-AP-002). |
| **Assessment Engine / Domains $\to$ Phase 3.6** | Result Projection | **F (Projection)** | Phase 3.6 maps sealed result DTOs into read-only UI scorecards and transcripts. Zero score calculation or mutation. Strictly locked. |

---

## 2. R3-04: Technology-Neutral Score Domain Semantics

The nine distinct score concepts are formalized below with zero assumptions of specific exam formulas:

| # | Score Domain | Universal Architectural Definition | Authoritative Owner | Required Inputs | Output Metric | Cohort Req? | Demographic Req? | Scope | Governance Status |
|---|---|---|---|---|---|---|---|---|---|
| **1** | **Raw Score** | Direct algebraic sum of authoritative item-level awarded marks ($\sum m_i$) | Phase 3.5 Delivery | Phase 2D-5 `awardedMarks[]` | `totalRawScore` | No | No | Local | **🟢 FROZEN** |
| **2** | **Aggregate Score** | Derived paper score produced by an authorized aggregation transformation | Canonical Assessment Policy | Phase 3.5 raw marks + section rules | `aggregateScore` | No | No | Local | **ARCHITECTURE PROPOSED** |
| **3** | **Scaled Score** | Derived score produced by an authorized scaling transformation | Canonical Assessment Policy | Aggregate score + scaling parameters | `scaledScore` | No | No | Local | **ARCHITECTURE PROPOSED** |
| **4** | **Normalized Score** | Derived score produced by an authorized normalization transformation | Canonical Assessment Policy | Scaled score + sealed cohort stats | `normalizedScore` | **Yes** | No | Local | **ARCHITECTURE PROPOSED** |
| **5** | **Equated Score** | Derived score produced by an authorized equating transformation | Canonical Assessment Policy | Raw/Scaled score + form parameters | `equatedScore` | **Yes** | No | Local | **ARCHITECTURE PROPOSED** |
| **6** | **Percentile** | Relative percentage of authorized cohort scoring at or below candidate | **Ranking & Merit Domain** | Candidate score + sorted cohort | `percentileRank` | **Yes** | No | Global | **🟡 UNRESOLVED (GOV-AP-002)** |
| **7** | **Qualification** | Categorical eligibility determined against authorized qualifying criteria | **Qualification Domain** | Candidate mark + qualifying cutoffs | `isQualified` | No | **Yes** | Local | **🟡 UNRESOLVED (GOV-AP-001)** |
| **8** | **Rank** | Ordinal position in authorized cohort applying merit order and tie-breaks | **Ranking & Merit Domain** | All candidate marks + tie-breaks | `meritRank` | **Yes** | **Yes** | Global | **🟡 UNRESOLVED (GOV-AP-002)** |
| **9** | **Classification** | Administrative or academic status label (pass, fail, withheld, etc.) | **Result Admin Domain** | Qualification + audit flags | `classification` | No | **Yes** | Local | **🟡 UNRESOLVED (GOV-AP-010)** |

---

## 3. Technology-Neutral Security & Integrity Invariants

### Invariant I-A: Security & Privilege Separation
- **Separation of Duties**: The author of a policy cannot approve or activate that policy (4-eyes principle enforced).
- **Least Privilege**: The policy evaluation engine executes in a hermetic, zero-I/O sandbox with read-only policy access.
- **Unauthorized Activation Prevention**: Policies can only be activated by verified administrative credentials.

### Invariant I-B: Integrity Evidence
- **Architectural Requirement**: All policy packages, input state tuples, and evaluation result records must carry verifiable, tamper-evident integrity evidence.
- **Mechanism (Candidate Choice)**: Verification mechanism is an implementation choice (hash digests, MACs, digital signatures, or HSM certificates). No specific vendor or technology is hardcoded as an architectural invariant.

---

## 4. Current Authority Inventory Across Certified Baselines

| Authority Domain | Upstream Certified Source | Authoritative Data Owner | Certified Immutable Fields | Unresolved Information |
|---|---|---|---|---|
| **Question Content IR** | Phase 2C / 2D-3 `CanonicalQuestionIR` | Phase 2 Ingestion | `canonicalQuestionId`, `representations`, `questionType`, `options` | Zero paper-level marks. |
| **Answer Key Truth** | Phase 2D-4 `AnswerCandidate` | Phase 2 Answer Resolver | `candidateAnswerId`, `parsedPayload`, `evidenceClass` | Zero aggregate math. |
| **Item Scoring Rules** | Phase 2D-5 `ScoringPolicyVersion` | Phase 2 Scoring Authority | `policyVersionId`, `rules[]` (`positiveMarks`, `negativeMarks`) | Zero paper total marks, zero section rules. |
| **Item Evaluation Outcome** | Phase 2D-5 `ScoreEvaluationRecord` | Phase 2 Scoring Evaluator | `evaluationId`, `awardedMarks`, `isCorrect`, `scoringDisposition` | Single-item scope only. |
| **Operational Delivery** | Phase 3.1–3.4 DB records | Phase 3 Delivery Orchestrator | `examSessionId`, `candidate_response_events`, `candidate_question_states` | Delivery facts only. |
| **Raw Score Aggregation** | Phase 3.5 `candidate_evaluation_runs` | Phase 3 Scoring Delivery | `totalRawScore = Σ awardedMarks`, `totalNormalizedScore = null` | Normalization unowned. |
| **Paper-Level Transformations** | **Canonical Assessment Policy** | Assessment Policy Layer | `scaledScore`, `normalizedScore`, `equatedScore` | Formal engine implementation locked. |
| **Qualification & Ranking** | **Unresolved Domains** | Separate Governance Gates | `qualificationStatus`, `allIndiaRank` | Architecture and ownership pending GOV-AP-001/002. |
| **Result Projection** | Phase 3.6 Gateway | Result Projection Gateway | Read-only Scorecard Views, PDF reports | Strictly locked. |

---

## 5. Architectural Boundary Principles

1. **Principle of Non-Inversion:** A downstream layer never instructs an upstream layer on what is correct. The Assessment-Policy Layer never modifies Phase 2D-5 item truth.
2. **Principle of Opaque Item Consumption:** The Assessment-Policy Layer consumes Phase 2D-5 `ScoreEvaluationRecord`s as immutable opaque facts (`awardedMarks`, `scoringDisposition`). It never inspects question stems, option text, or candidate keystrokes.
3. **Principle of Explicit Interpretation:** An official document is evidence; it cannot become executable code without formal operational interpretation by an authorized interpreter.
4. **Principle of Source-Specific Authority:** Document precedence, issuer roles, and attestation methods are established explicitly per examination profile. No universal legal hierarchy is assumed.
5. **Principle of Zero Domain Inflation:** An architectural component must never quietly absorb adjacent responsibilities. Assessment transforms marks; Qualification determines eligibility; Ranking orders cohorts; Phase 3.6 projects views.
