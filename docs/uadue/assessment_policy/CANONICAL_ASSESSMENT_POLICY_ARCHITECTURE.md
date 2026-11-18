# Canonical Assessment-Policy Layer — Architecture Specification
**Document Identifier:** `UADUE-SPEC-AP-ARCH-001`  
**Security Classification:** Restricted Engineering Specification  
**Status:** Architecture Specification Only — Zero Implementation  
**Gate:** Canonical Assessment-Policy Governance Gate (Remediation R1)

---

## 1. Architectural Vision & Scope

The **Canonical Assessment-Policy Layer** is the dedicated, canonical authority for paper-level scoring policy and multi-session cohort equating in UADUE.

It occupies the architectural space between:
1. **Upstream Item-Level Truth (Phase 2D-5)** and **Deterministic Delivery Aggregation (Phase 3.5)**:
   - Phase 2D-5 evaluates individual items (MCQ, MSQ, NAT) and determines item-level awarded marks and disposition (`NORMAL`, `CANCELLED`, `DROPPED`, `ALL_FULL_MARKS`).
   - Phase 3.5 records delivery execution and aggregates strictly:
     $$\text{totalRawScore} = \sum \text{awardedMarks}$$
     leaving $\text{totalNormalizedScore} = \text{null}$.
2. **Downstream Domains (Qualification, Ranking, and Projection)**:
   - Candidate qualification and ranking are separated into dedicated domains pending governance decisions.
   - Phase 3.6 remains strictly a read-only **Result Projection Gateway**.

```text
┌────────────────────────────────────────────────────────┐
│ Phase 2D-5: Canonical Item Evaluator (FROZEN 🟢)       │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ Phase 3.5: Delivery Raw Score Aggregator (FROZEN 🟢)   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ CANONICAL ASSESSMENT-POLICY LAYER                      │
│ • Module 1: AggregateScoringPolicy                     │
│ • Module 2: CohortNormalizationPolicy (Candidate)      │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼ (Authoritative Assessment Outputs)
┌────────────────────────────────────────────────────────┐
│ 🟡 Separate Downstream Domains (GOV-AP-001 / 002)       │
│ • Qualification / Eligibility Domain                   │
│ • Ranking & Merit Domain                               │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ Phase 3.6: Result Projection Gateway (LOCKED 🔒)       │
│ (Pure read-only scorecard rendering; zero math)        │
└────────────────────────────────────────────────────────┘
```

---

## 2. Step 4: Canonical Assessment Policy Entity Model

The Canonical Assessment Policy entity model is decomposed into pure assessment modules:

```typescript
// Pure Architectural Type Specification — Zero Implementation

export interface CanonicalAssessmentPolicyPackage {
  readonly policyId: string;
  readonly versionString: string;
  readonly tenantId: string;
  readonly paperId: string;
  readonly status: "DRAFT" | "REVIEW" | "APPROVED" | "ACTIVE" | "SUPERSEDED" | "WITHDRAWN";
  readonly aggregatePolicy: AggregateScoringPolicy;
  readonly cohortPolicy?: CohortNormalizationPolicy; // Optional if single session
  readonly policySealDigest: string;
}

export interface AggregateScoringPolicy {
  readonly droppedItemRule: "PRO_RATA_RESCALE" | "OMIT_AND_TRUNCATE" | "AWARD_FULL_MARKS" | "REWEIGHT_REMAINING";
  readonly statutoryPaperMarks: string; // Rational string n/d
  readonly sectionWeightRules: readonly {
    readonly sectionId: string;
    readonly statutoryMaxMarks: string;
  }[];
}

export interface CohortNormalizationPolicy {
  readonly equatingMethod: string; // Pointers to profile method
  readonly statutoryDecimalPlaces: number;
  readonly roundingMode: "ROUND_HALF_UP" | "ROUND_HALF_EVEN" | "TRUNCATE" | "CEIL" | "FLOOR";
}
```

*Governance Boundary:* Candidate qualification rules, category reservation cutoffs, and demographic tie-breakers are **excluded** from this package pending **GOV-AP-001** and **GOV-AP-002**.

---

## 3. R1-10: Policy AST / Domain-Specific Language (DSL) Comparison Matrix

Selection of the Policy AST DSL is an unresolved governance decision (**GOV-AP-005**). No dynamic formula implementation may be built until this decision is made. The candidates are compared across 12 criteria below:

| # | Evaluation Criterion | Google CEL (Common Expression Language) | JsonLogic | Custom Rational AST | JSON-e |
|---|---|---|---|---|---|
| **1** | **Expressiveness** | High (C-like arithmetic, logic, comprehensions) | Medium (Lisp-like prefix JSON operators) | Targeted (Arithmetic $\mathbb{Q}$, statutory rounding) | Medium (Template-driven JSON transforms) |
| **2** | **Determinism** | Strong (Specification forbids side-effects) | Strong (Pure JSON evaluation) | Absolute (Built specifically for $\mathbb{Q}$ determinism) | Strong (Deterministic evaluator) |
| **3** | **Sandboxability** | Excellent (Hermetic memory/execution bounds) | Excellent (Sandboxed JSON walk) | Absolute (Zero external environment access) | Good (Sandboxed JSON walk) |
| **4** | **Rational Number Support** | Poor (Requires custom extension types/bindings) | Poor (Native floats only; requires parser fork) | Native First-Class (Designed around BigInt $\mathbb{Q}$) | Poor (Native floats only) |
| **5** | **Canonical Serialization** | Complex (Protobuf / CEL expression AST) | Excellent (Native RFC 8785 JSON) | Excellent (Strict RFC 8785 JSON representation) | Excellent (Native JSON) |
| **6** | **Security & Injection** | Strong (Non-Turing complete, memory safe) | Strong (Safe against arbitrary execution) | Absolute (Evaluates only closed set of math ops) | Good (No `eval`) |
| **7** | **Dependency Footprint** | Heavy (Requires `@google/cel-js` or WASM) | Low (Small JS library) | Zero (Zero external runtime dependencies) | Low (Small JS library) |
| **8** | **Auditability** | Moderate (Expression strings in AST) | High (Plain readable JSON structure) | Maximum (Explicit typed AST nodes) | High (JSON structure) |
| **9** | **Versioning** | Standard | Standard | Intrinsic (AST schema pinned per version) | Standard |
| **10**| **Backward Compatibility**| High (Well-maintained Google project) | High (Stable specification) | Maximum (Full code ownership within UADUE) | Moderate |
| **11**| **Performance** | High (Pre-compiled AST execution) | High (Lightweight tree-walk) | High (Direct BigInt operations) | High |
| **12**| **Formal Verification** | Industry Standard (Used in Kubernetes/Google) | Limited | High (Small state-space, trivially provable) | Limited |

**Recommendation:** While Custom Rational AST offers zero dependencies and native rational arithmetic, Google CEL offers industry-standard formal verification. **Status: 🟡 GOVERNANCE DECISION REQUIRED (GOV-AP-005).**

---

## 4. Policy Composition & Acyclic Stage DAG Specification (Pass R4)

The Canonical Assessment-Policy Engine executes an acyclic stage graph where stage existence, composition, and execution ordering are determined **exclusively** by the active, pinned policy version. **Zero universal pipeline ordering is implied.**

```text
Phase 3.5 Authoritative Raw Score
       │
       ▼ (Root Input Dependency)
Policy-Declared Acyclic Stage DAG
       ├── Aggregate Stage
       ├── Scaling Stage
       ├── Normalization Stage
       ├── Equating Stage
       └── Other Authorized Assessment Stage

"Stage existence and execution ordering are policy-defined."
       │
       ▼
[Authoritative Sealed Assessment Output Record]
```

### 4.1 Strict Composition Invariants
1. **Unidirectional Dependency Direction**:
   - The Policy Stage DAG consumes Phase 3.5 raw scores and Phase 2D-5 item dispositions as root immutable inputs.
   - Stage dependencies must form a strictly acyclic directed graph (DAG).
2. **Double-Normalization Prevention**:
   The input type to any normalization stage requires an un-normalized context. An already-normalized output cannot be fed back into an equating/normalization engine. Type guards reject duplicate normalization with `INVALID_INPUT`.
3. **No Domain Mutation**:
   No downstream policy domain may mutate an upstream domain's authoritative output. `awardedMarks` and `totalRawScore` remain permanent and unalterable.
4. **Cycle Prevention**:
   Transformation stages are an acyclic DAG. Circular dependencies are rejected at policy validation time with `CIRCULAR_LINEAGE_DETECTED`.

---

## 5. R1-13: Multi-Tenancy Isolation (Requirement vs Implementation)

### Architectural Requirement (Binding)
1. **Absolute Tenant Isolation**:
   Assessment policies, cohort parameters, and candidate attempt evaluations must be strictly partitioned by statutory tenant. A candidate attempt from Tenant A (e.g., UPSC) can **never** match or evaluate against a policy belonging to Tenant B (e.g., GATE).
2. **Precedence Hierarchy**:
   Within a tenant, policies resolve strictly: $\text{Global Template} \prec \text{Statutory Tenant} \prec \text{Exam Cycle} \prec \text{Specific Paper}$.

### Implementation Details (Non-Binding Candidate — No Schema Changes Authorized)
- Relational compound primary keys `(tenant_id, policy_id, version_id)` and PostgreSQL Row-Level Security (RLS) policies are **candidate implementation details**. They are not frozen during this architecture gate.

---

## 6. R1-04: Phase 3.6 Boundary Invariants

Phase 3.6 is strictly the **Result Projection Gateway**:
1. **Phase 3.6 is NOT a Ranking Engine**: It does not sort cohorts or calculate percentiles.
2. **Phase 3.6 is NOT a Merit Engine**: It does not allocate reservation seats or quotas.
3. **Phase 3.6 is NOT a Tie-Break Engine**: It does not evaluate candidate age or alphabetical rules.
4. **Phase 3.6 is a Pure View Projector**: It consumes sealed assessment, qualification, and ranking records and renders them into user interfaces, PDF transcripts, and client DTOs.
