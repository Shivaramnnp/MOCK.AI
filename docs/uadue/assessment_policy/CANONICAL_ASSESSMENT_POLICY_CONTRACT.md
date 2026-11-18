# Canonical Assessment-Policy Layer — Input/Output Contracts & Score Semantics
**Document ID:** `UADUE-SPEC-CAP-002`  
**Governance State:** Architecture Specification Only — Zero Implementation  
**Gate:** Canonical Assessment-Policy Governance Gate (Remediation R1)  
**Implementation Authorization:** 🔒 **STRICTLY LOCKED / ZERO IMPLEMENTATION**  
**Date:** 2026-10-08

---

## 1. R1-07: Reconciling Nine Score Domains with Proposed Architecture Modules

A primary failure mode of assessment software is collapsing all post-item calculations into a single ambiguous float called `score` or `normalizedScore`. In real-world institutional assessment, there are **nine distinct mathematical and statutory concepts**.

The architecture must NOT force all nine concepts into the Assessment-Policy Layer. Instead, ownership is mapped strictly according to architectural boundaries:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 1. RAW SCORE (Item Sum)                                                │
│    Σ(awardedMarks) strictly evaluated by Phase 2D-5.                   │
│    Owner: Phase 3.5 Delivery Runtime (FROZEN 🟢)                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ CANONICAL ASSESSMENT-POLICY LAYER                                      │
│                                                                        │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ MODULE 1: AggregateScoringPolicy                                   │ │
│ │ • 2. AGGREGATE SCORE (Authorized aggregation transformation)       │ │
│ │ • 3. SCALED SCORE (Authorized scaling transformation)              │ │
│ └─────────────────────────────────┬──────────────────────────────────┘ │
│                                   │                                    │
│                                   ▼                                    │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ MODULE 2: CohortNormalizationPolicy (Candidate Architecture)       │ │
│ │ • 4. NORMALIZED SCORE (Authorized normalization transformation)    │ │
│ │ • 5. EQUATED SCORE (Authorized equating transformation)            │ │
│ └────────────────────────────────────────────────────────────────────┘ │
└──────────────────┬─────────────────────────────────┬───────────────────┘
                   │                                 │
                   ▼                                 ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│ 🟡 QUALIFICATION DOMAIN              │  │ 🟡 RANKING & MERIT DOMAIN    │
│ (UNRESOLVED — GOV-AP-001)            │  │ (UNRESOLVED — GOV-AP-002)    │
│ • 7. QUALIFICATION (Cutoff checks)   │  │ • 6. PERCENTILE RANK         │
│ • 9. RESULT CLASSIFICATION           │  │ • 8. MERIT RANK & TIE-BREAKS │
│ [Not owned by Assessment Policy]     │  │ [Not owned by Phase 3.6]     │
└──────────────────┬───────────────────┘  └──────────────┬───────────────┘
                   │                                     │
                   └──────────────────┬──────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 3.6: RESULT PROJECTION GATEWAY (STRICTLY LOCKED 🔒)              │
│ Role: Pure Read-Only Scorecard & Transcript Projection (Zero Math)     │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Score Domain vs Policy Module Mapping Table

| Score Domain | Proposed Policy Module | Owner | Justification for Placement |
|---|---|---|---|
| **1. Raw Score** | *None* | **Phase 3.5 (Frozen)** | Pure algebraic sum of Phase 2D-5 item marks; frozen in delivery layer. |
| **2. Aggregate Score** | `AggregateScoringPolicy` | **Canonical Assessment Policy** | Evaluates authorized paper-level aggregation rules (section caps, weights). |
| **3. Scaled Score** | `AggregateScoringPolicy` | **Canonical Assessment Policy** | Evaluates authorized scaling transformations (rescaling, dropped items). |
| **4. Normalized Score** | `CohortNormalizationPolicy` | **Canonical Assessment Policy** | Evaluates authorized normalization transformations across cohort datasets. |
| **5. Equated Score** | `CohortNormalizationPolicy` | **Canonical Assessment Policy** | Evaluates authorized psychometric equating transformations across forms. |
| **6. Percentile** | *Excluded from Assessment Policy* | **🟡 Unresolved (GOV-AP-002)** | Relative rank across multi-candidate population; belongs to Ranking/Merit. |
| **7. Qualification** | *Excluded from Assessment Policy* | **🟡 Unresolved (GOV-AP-001)** | Category cutoffs, reservation rules, and quotas belong to Qualification Domain. |
| **8. Rank** | *Excluded from Assessment Policy* | **🟡 Unresolved (GOV-AP-002)** | Ordinal sorting and demographic tie-breaking belong to Ranking/Merit Domain. |
| **9. Classification** | *Excluded from Assessment Policy* | **🟡 Unresolved (GOV-AP-010)** | Administrative status flags (`PASS`, `WITHHELD`) belong to Result Admin. |

---

## 2. R1-06: Conceptual `EXAM_POLICY_PROFILE` (Illustrative Examples Only)

The architecture does **not** hardcode specific institutional formulas (such as GATE mean/SD or SSC percentile rank) into the core engine contract. Instead, these are modeled as conceptual **`EXAM_POLICY_PROFILE`** instances. They serve as illustrative examples and require authoritative source verification before canonical adoption:

```typescript
/**
 * CONCEPTUAL FUTURE SPECIFICATION ONLY — NO IMPLEMENTATION
 * Exam-specific policies are parameterized profiles, NOT engine code.
 */
export interface ExamPolicyProfile {
  readonly profileId: string;
  readonly institutionalTenant: string; // e.g., "UPSC", "GATE", "SSC"
  readonly examCycle: string;
  readonly aggregateRules: {
    readonly droppedItemRule: "PRO_RATA_RESCALE" | "OMIT_AND_TRUNCATE" | "AWARD_FULL_MARKS" | "REWEIGHT_REMAINING";
    readonly statutoryMaxMarks: string; // Exact rational string
  };
  readonly cohortEquatingRules?: {
    readonly illustrativeMethod: "SAMPLE_MEAN_SD_EQUATING" | "SAMPLE_PERCENTILE_EQUATING";
    readonly parametersRequired: readonly string[];
  };
}
```

*Governance Note:* Any formula referencing specific exam bodies (e.g. GATE $\mu + \sigma$, SSC percentile) is strictly an **example** illustrating the profile contract. It must not be treated as a canonical requirement until official statutory source documents are ingested and verified.

---

## 3. Step 8: Input Contract Specification

The Canonical Assessment-Policy Layer consumes an immutable, strongly-typed input tuple. Every input is strictly classified to prevent untrusted client parameters or unverified defaults from infiltrating policy execution.

```text
Input Tuple S = ⟨ Items, Session, Paper, PolicyVersionId, CohortStats ⟩
```

| Input Field | Data Type | Classification | Source of Truth Authority | Rejection Criteria |
|---|---|---|---|---|
| `itemEvaluations` | `ScoreEvaluationRecord[]` | **SOURCE OF TRUTH** | Phase 2D-5 Scoring Evaluator | Length !== Paper Question Count; Missing signature; Unresolved item disposition. |
| `examSessionId` | `string` | **SOURCE OF TRUTH** | Phase 3.1 `exam_sessions` | Missing in DB; State !== `SUBMITTED` or `EXPIRED`. |
| `tenantId` | `string` | **SOURCE OF TRUTH** | Phase 3.1 Tenant Context | Tenant mismatch against package. |
| `packageId` | `string` | **SOURCE OF TRUTH** | Phase 2D-7 Published Package | Package not found in published registry. |
| `deliveryRawScore` | `string` (Rational) | **DERIVED INPUT** | Phase 3.5 `totalRawScore` | Must equal $\sum \texttt{itemEvaluations[i].awardedMarks}$. Discrepancy rejects. |
| `policyVersionId` | `string` | **SOURCE OF TRUTH** | Pinned Policy Registry | Policy not found, withdrawn, or unapproved. |
| `cohortStatistics`| `CohortStatisticsRecord` | **FROZEN INPUT (Optional)**| Sealed Cohort Registry | Required if policy executes multi-session equating; missing data defers execution. |
| `clientTimestamps`| `number` | 🔴 **UNTRUSTED** | Client Device | **FORBIDDEN:** Zero authority; ignored during policy evaluation. |
| `clientSeq` | `number` | 🔴 **UNTRUSTED** | Client Network Packet | **FORBIDDEN:** Ignored during policy evaluation. |

---

## 4. Step 9: Pure Assessment Output Contract

The Canonical Assessment-Policy Layer outputs pure, strongly-typed assessment records. All downstream qualification or ranking fields have been decoupled into separate candidate contracts pending governance decisions.

```typescript
// Pure Architectural Type Specification — Zero Implementation

export interface PolicyEvaluationMetadata {
  readonly policyId: string;
  readonly policyVersionId: string;
  readonly policyDigest: string;       // SHA-256 of policy AST and rules
  readonly inputDigest: string;        // RFC 8785 SHA-256 of all consumed inputs
  readonly evaluationStatus: "SUCCESS" | "DEFERRED" | "QUARANTINED";
  readonly executionSpecVersion: string; // Pinned execution spec version
}

/** Output of Module 1: AggregateScoringPolicy */
export interface CanonicalAggregateScoreOutput {
  readonly aggregateScoreId: string;
  readonly examSessionId: string;
  readonly totalValidQuestions: number;
  readonly totalExcludedQuestions: number;
  readonly statutoryPaperMarks: string; // Rational string n/d
  readonly validPaperMarks: string;     // Rational string n/d
  readonly unscaledRawScore: string;    // Rational string n/d (from Phase 3.5)
  readonly scaledScoreValue: string;    // Rational string n/d
  readonly scalingMethod: string;       // e.g. "PRO_RATA_RESCALE"
  readonly sectionScores: readonly {
    readonly sectionId: string;
    readonly rawScore: string;
    readonly validMarks: string;
  }[];
  readonly metadata: PolicyEvaluationMetadata;
}

/** Output of Module 2: CohortNormalizationPolicy (Candidate) */
export interface CanonicalNormalizedScoreOutput {
  readonly normalizedScoreId: string;
  readonly aggregateScoreId: string;
  readonly cohortStatisticsDigest: string; // Seal of frozen cohort data
  readonly exactNormalizedValue: string;   // Rational string n/d
  readonly roundedDecimalValue: string;    // Statutory precision string
  readonly metadata: PolicyEvaluationMetadata;
}
```

### 4.1 Candidate Downstream Contracts (Pending Governance Approval)

The following contract is **NOT** part of the Canonical Assessment-Policy Layer. It represents a downstream candidate interface for the Qualification Domain pending **GOV-AP-001**:

```typescript
/** CANDIDATE DOWNSTREAM CONTRACT — GOV-AP-001 PENDING */
export interface CandidateQualificationOutput {
  readonly qualificationId: string;
  readonly assessmentScoreReferenceId: string; // Pointers to normalized or scaled score
  readonly candidateCategory: string;
  readonly categoryCutoffApplied: string;
  readonly isQualified: boolean;
  readonly eligibilityDisposition: "QUALIFIED" | "NOT_QUALIFIED" | "PENDING_VERIFICATION";
}
```

---

## 5. Contract Boundary Guarantees

1. **Non-Collapsing Output Rule:** A `CanonicalAggregateScoreOutput` is **never** merged into a `ScoreEvaluationRecord`. Item scores remain strictly item scores; aggregate scores remain strictly aggregate scores.
2. **Explicit Nullability Invariant:** If an assessment does not specify a multi-shift normalization policy, `CanonicalNormalizedScoreOutput` is **not generated**. The final evaluative score remains the `CanonicalScaledScoreOutput`.
3. **Cryptographic Tamper-Evident Digest:** Every output record contains `inputDigest`, defined as:
   $$\text{inputDigest} = \text{SHA-256}(\text{RFC-8785-Canonical-JSON}(S))$$
   Guaranteeing that any modification to candidate responses or item scores invalidates the policy result seal.
