# Canonical Assessment-Policy Layer — Architecture Closure Specification (R2)
**Document Identifier:** `UADUE-SPEC-AP-R2-CLOSURE-001`  
**Security Classification:** Restricted Engineering Specification  
**Status:** Architecture Specification Only — Zero Implementation  
**Gate:** Canonical Assessment-Policy Governance Gate (Closure Pass R2)  
**Implementation Authorization:** 🔒 **STRICTLY LOCKED / ZERO IMPLEMENTATION**  
**Date:** 2026-10-08

---

## 1. R2-01: The External Authority Chain

A critical defect in naive assessment architectures is assuming that downloading an official examination PDF or government gazette allows software to "directly execute" scoring. Real-world legal documents are written in human natural language, contain judicial caveats, and leave operational edge-cases implicit. 

The architecture formalizes a strict, seven-stage **Immutable External Authority Chain**:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 1. SOURCE FACT (Statutory / Institutional Evidence)                    │
│    Official Gazette, Examination Notification, PDF Brochure,           │
│    Answer Key Document, Official Corrigendum, Court Judgment           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼ Attested into
┌────────────────────────────────────────────────────────────────────────┐
│ 2. SOURCE AUTHORITY RECORD (Attestation Evidence Record)               │
│    Cryptographic digest of source asset (SHA-256), permanent URI,      │
│    issuing authority metadata, statutory publication timestamp         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼ Operationalized via
┌────────────────────────────────────────────────────────────────────────┐
│ 3. POLICY INTERPRETATION (Formal Operational Translation)              │
│    Domain expert / legal consensus resolving natural language prose    │
│    into unambiguous operational logic, section rules, and cutoffs      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼ Bound into
┌────────────────────────────────────────────────────────────────────────┐
│ 4. POLICY VERSION (Immutable Version & Lineage Entity)                 │
│    Semantic version + revision sequence (Major.Minor.Patch+revN),      │
│    statutory validity window (effectiveFrom, effectiveUntil), DAG link │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼ Compiled / Represented as
┌────────────────────────────────────────────────────────────────────────┐
│ 5. EXECUTABLE MACHINE REPRESENTATION (Machine-Executable Rule Spec)     │
│    Pinned AST, rational coefficients, statutory rounding directive,    │
│    resource guards, and execution bounds                               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼ Evaluated against candidate attempt
┌────────────────────────────────────────────────────────────────────────┐
│ 6. CANDIDATE EVALUATION (Pure Mathematical Invocation Event)           │
│    Hermetic in-memory execution: Output = F(S, P)                      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼ Emits
┌────────────────────────────────────────────────────────────────────────┐
│ 7. DERIVED RESULT (Authoritative Assessment Receipt)                  │
│    Immutable scaled / normalized score record with input digest,       │
│    policy seal, and calculation traces                                 │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Formal Properties Across Chain Layers

| Stage | Chain Layer | Classification | Can Be Disputed? | Can Be Superseded? | Can Be In-Place Mutated? |
|---|---|---|---|---|---|
| **1** | **Source Fact** | **Evidence** | Yes (via Judicial Review / High Court writ) | Yes (via official Corrigendum) | 🔴 **Never** (Historical document) |
| **2** | **Source Authority Record** | **Evidence Receipt** | Yes (Digest or metadata challenge) | Yes (Corrigendum link) | 🔴 **Never** (Cryptographic hash) |
| **3** | **Policy Interpretation** | **Interpretation** | Yes (Candidate / Committee objection) | Yes (Revised Interpretation) | 🔴 **Never** (Archived review record) |
| **4** | **Policy Version** | **Lineage Node** | Yes (Administrative appeal) | Yes (New Version in DAG) | 🔴 **Never** (Immutable database record) |
| **5** | **Executable Machine Spec** | **Executable** | Yes (Formal verification audit) | Yes (Compiled from new Version) | 🔴 **Never** (Immutable AST payload) |
| **6** | **Candidate Evaluation** | **Execution Event** | Yes (Evaluation dispute) | Yes (Re-evaluation run) | 🔴 **Never** (Ephemeral function call) |
| **7** | **Derived Result** | **Result Receipt** | Yes (RTI / Scoring dispute) | Yes (Superseded by newer run) | 🔴 **Never** (Append-only audit ledger) |

### 1.2 Formal Proof: Why Official Documents Cannot Directly Become Executable Policies
1. **Linguistic Non-Determinism**: Statutory notices contain ambiguous phrases (e.g., *"marks will be normalized using standard statistical methods"* or *"questions found defective will be cancelled and marks distributed proportionately"*). Natural language lacks formal mathematical operational semantics.
2. **Missing Operational Parameters**: A gazette notice frequently states that *"equating will be applied"*, but does not specify whether standard deviation is sample-based ($N-1$) or population-based ($N$), or whether intermediate rounding is applied per question or across sums.
3. **Requirement of Domain Interpretation**: Translating legal and psychometric prose into an executable algorithm requires human psychometricians and legal authorities to formalize an **Interpretation**. Any software attempting to bypass Stage 3 by directly parsing PDF text into executable code introduces algorithmic hallucination and arbitrary scoring behavior.

---

## 2. R2-02: Technology-Neutral Score Domain Semantics

The nine distinct score concepts are formalized below with zero assumptions of specific exam formulas:

```text
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│ THE NINE DECOUPLED SCORE DOMAINS                                                                  │
├──────────────────────┬────────────────────────────────────┬───────────────────────────────────────┤
│ 1. Raw Score         │ 4. Normalized Score                │ 7. Qualification                      │
│ 2. Aggregate Score   │ 5. Equated Score                   │ 8. Rank                               │
│ 3. Scaled Score      │ 6. Percentile                      │ 9. Result Classification              │
└──────────────────────┴────────────────────────────────────┴───────────────────────────────────────┘
```

| # | Domain | Mathematical Meaning | Authoritative Owner | Required Inputs | Output Metric | Cohort Required? | Demographics Required? | May Modify Marks? | Scope | Frozen Status | Governance Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **1** | **Raw Score** | Direct algebraic sum of item awarded marks: $\sum_{i=1}^N m_i$ | Phase 3.5 Delivery | Phase 2D-5 `awardedMarks[]` | `totalRawScore` | No | No | No | Candidate-Local | **🟢 FROZEN** | **RESOLVED** |
| **2** | **Aggregate Score** | Application of paper section caps, component weights, and optional rules | Canonical Assessment Policy | Phase 3.5 raw marks + section rules | `aggregateScore` | No | No | Yes (Weights) | Candidate-Local | 🔒 Locked | **ARCHITECTURE PROPOSED** |
| **3** | **Scaled Score** | Single-session mark redistribution when items are dropped/cancelled | Canonical Assessment Policy | Aggregate score + valid item counts | `scaledScore` | No | No | Yes (Rescaling) | Candidate-Local | 🔒 Locked | **ARCHITECTURE PROPOSED** |
| **4** | **Normalized Score** | Statistical transformation adjusting for multi-shift cohort variations | Canonical Assessment Policy | Scaled score + sealed cohort distribution | `normalizedScore` | **Yes** | No | Yes (Shift adjust) | Candidate-Local | 🔒 Locked | **ARCHITECTURE PROPOSED** |
| **5** | **Equated Score** | Psychometric form equating adjusting for test difficulty differences | Canonical Assessment Policy | Raw/Scaled score + form parameters | `equatedScore` | **Yes** | No | Yes (Form adjust) | Candidate-Local | 🔒 Locked | **ARCHITECTURE PROPOSED** |
| **6** | **Percentile** | Cumulative distribution rank: percentage of cohort scoring $\le$ candidate | **Ranking & Merit Domain** | Candidate score + sorted cohort distribution | `percentileRank` | **Yes** | No | 🔴 **No** (Relative) | Cohort-Global | 🔒 Locked | **🟡 UNRESOLVED (GOV-AP-002)** |
| **7** | **Qualification** | Evaluation against statutory category cutoff thresholds | **Qualification Domain** | Candidate mark + category cutoffs | `isQualified` (Boolean) | No | **Yes** (Category) | 🔴 **No** (Status) | Candidate-Local | 🔒 Locked | **🟡 UNRESOLVED (GOV-AP-001)** |
| **8** | **Rank** | Discrete ordinal position in cohort applying tie-breaking priority | **Ranking & Merit Domain** | All candidate marks + tie-break rules | `meritRank` (Integer) | **Yes** | **Yes** (Age/Name) | 🔴 **No** (Ordering) | Cohort-Global | 🔒 Locked | **🟡 UNRESOLVED (GOV-AP-002)** |
| **9** | **Result Classification** | Administrative disposition (`PASS`, `FAIL`, `WITHHELD`, `DISQUALIFIED`) | **Result Admin Domain** | Qualification + integrity / audit flags | `classification` | No | **Yes** (Admin) | 🔴 **No** (Status) | Candidate-Local | 🔒 Locked | **🟡 UNRESOLVED (GOV-AP-010)** |

---

## 3. R2-03: Policy-Driven Composition (Removal of Hardcoded Linear Ordering)

The sequence `Raw -> Aggregate -> Scaled -> Normalized -> Equated` is **NOT universally valid**. Different examination bodies enforce different statutory transformation orders:

### 3.1 Real-World Statutory Composition Patterns
- **Pattern A (Single-Session Linear Rescaling — e.g. UPSC Prelims)**:
  $$\text{Raw} \xrightarrow{\text{Section Rules}} \text{Aggregate} \xrightarrow{\text{Dropped Item Rescale}} \text{Scaled Score}$$
  *(Zero cohort equating; zero normalization).*
- **Pattern B (Multi-Shift Equating Before Paper Scaling)**:
  $$\text{Raw} \xrightarrow{\text{Shift Equating}} \text{Equated Score} \xrightarrow{\text{Paper Scale}} \text{Scaled Equated Score}$$
- **Pattern C (Section-Level Normalization Before Aggregation)**:
  $$\text{Raw per Section} \xrightarrow{\text{Section Normalization}} \text{Normalized Section Scores} \xrightarrow{\text{Sum}} \text{Aggregate Score}$$

### 3.2 Formal Composition Rules
1. **Mandatory Dependencies**:
   - Every transformation pipeline must have Phase 3.5 Raw Score as its initial source of truth.
2. **Optional Dependencies**:
   - Rescaling, Normalization, and Equating are entirely optional. A policy may execute 0, 1, or multiple transformations.
3. **Policy-Driven Ordering**:
   - The execution order of transformation stages is declared explicitly in the policy definition AST as an acyclic graph:
     ```typescript
     interface PolicyCompositionGraph {
       readonly pipelineStages: readonly ("AGGREGATE" | "SCALE" | "NORMALIZE" | "EQUATE")[];
     }
     ```
4. **Forbidden Compositions**:
   - **Double-Normalization**: Applying a multi-shift normalization algorithm to an already-normalized score. The type system enforces that an input context to a normalization stage must satisfy `isNormalized === false`.
   - **Circular Dependencies**: Any cycle (e.g. $A \to B \to A$) is detected via topological sort during policy compilation and rejected with `CIRCULAR_LINEAGE_DETECTED`.
   - **Feedback Mutation**: No downstream stage may alter the value of an upstream stage's output.

---

## 4. R2-04: External Authority Model (Resolving GOV-AP-003 Architecturally)

### 4.1 Taxonomy of Authoritative Source Documents

| Category | Document Type | Issuing Authority | Legal / Operational Weight |
|---|---|---|---|
| **A** | **Official Statutory Source** | Parliament / State Legislature | Supreme constitutional authority; overrides all administrative policies. |
| **B** | **Examination Notification / Gazette** | Commission (UPSC, SSC, NTA) | Primary contractual basis between testing body and candidates. |
| **C** | **Answer Key Document** | Organizing Institute / Committee | Authoritative on item key truth; managed by Phase 2D-4/2D-5. |
| **D** | **Official Corrigendum** | Examination Controller | Legally modifies notification clauses post-objection window. |
| **E** | **Normalization Circular** | Psychometrics Committee | Authoritative on multi-shift equating formula specification. |
| **F** | **Board / Institution Ruling** | Executive Board / Academic Council | Internal operational resolution on exam administration. |
| **G** | **Mock.AI Synthetic Policy** | Platform Curriculum Lead | Internal mock test simulation policy; **Zero statutory authority**. |

### 4.2 Precedence Hierarchy
$$\text{Statutory Gazette (A)} \succ \text{Corrigendum (D)} \succ \text{Normalization Circular (E)} \succ \text{Notification (B)} \succ \text{Board Ruling (F)} \succ \text{Mock.AI Profile (G)}$$

### 4.3 Fail-Closed Conflict Resolution
If two authoritative documents conflict (e.g. Notification specifies pro-rata rescaling, but Corrigendum omits dropped items without rescaling):
- The system must **NEVER guess** or silently apply the latest document.
- Policy compilation halts immediately and sets state to **`AUTHORITY_CONTRADICTION`**.
- An explicit administrative governance resolution order is required to proceed.

---

## 5. R2-05: Cohort Authority Model (Resolving GOV-AP-004 Architecturally)

In multi-shift competitive examinations, normalizing a candidate's score against a fluctuating or incomplete cohort creates catastrophic legal defects.

### 5.1 Cohort Authority Invariants
1. **Authorized Source**: Cohort statistics cannot be computed dynamically by ad-hoc queries. They must be generated by a sealed psychometrics pipeline and cryptographically signed by the **Controller of Examinations**.
2. **Completeness Precondition**: A cohort cannot be ingested until **all** scheduled shifts in the examination cycle are marked `DELIVERY_SEALED`.
3. **Immutable Ingestion Record**:
   ```typescript
   interface SealedCohortStatisticsRecord {
     readonly cohortRecordId: string;
     readonly tenantId: string;
     readonly examCycleId: string;
     readonly paperId: string;
     readonly totalCandidateCount: number;
     readonly shiftSessionIds: readonly string[];
     readonly statisticalMatricesDigest: string; // SHA-256 of distributions
     readonly sealedAt: string; // ISO-8601 UTC
     readonly statutoryAuthoritySeal: string;
   }
   ```
4. **Behavior Under Failure**:
   - **Missing Cohort**: If a multi-shift policy is invoked and no sealed cohort record exists, candidate evaluation is parked cleanly as **`DEFER`** (`INSUFFICIENT_COHORT_DATA`).
   - **Conflicting Cohort**: If two conflicting cohort records match the same cycle, the engine halts with **`QUARANTINE`** (`COHORT_CONFLICT`).
   - **Stale Cohort**: If candidate attempt count differs from the sealed cohort count post-delivery, evaluation flags **`STALE_COHORT_DATA`**.

---

## 6. R2-06: Numerical Semantics (Resolving GOV-AP-006 Conceptually)

The architecture mandates **exact rational arithmetic** where policy requires fractional marks, without committing to a specific concrete implementation:

### 6.1 Mathematical Requirements
1. **Rational Canonicalization**: All numbers must be reduced to canonical coprime form:
   $$\mathbb{Q} = \frac{n}{d}, \quad n \in \mathbb{Z}, \quad d \in \mathbb{Z}^+, \quad \gcd(|n|, d) = 1$$
2. **Signs**: The denominator $d$ must strictly satisfy $d > 0$. If an operation produces a negative denominator, the sign is transferred to the numerator.
3. **Zero**: Represented uniquely as $0/1$.
4. **Division by Zero**: $n / 0$ is mathematically undefined; fails closed with `DIVISION_BY_ZERO`.
5. **Exact Comparison**: Cross-multiplication $\frac{n_1}{d_1} = \frac{n_2}{d_2} \iff n_1 d_2 = n_2 d_1$ in $\mathbb{Z}$. Zero division or precision loss.
6. **Statutory Rounding**: Exact integer quotient and remainder after scaling by $10^{\text{scale}}$. Ties are resolved strictly by the statutory rounding directive.

### 6.2 Engineering Safeguards Against Denial of Service (DoS)
- **Candidate Bit Bounds**: $|n|, |d| \le 2^{256}$ is classified as a **candidate engineering bound**.
- **Expression Depth Limit**: Maximum AST nesting depth capped at 32 levels.
- **Eager GCD Reduction**: Mandatory reduction after every addition and multiplication to prevent exponential denominator expansion.
- **Execution Timeout**: Hermetic evaluation timeout capped at 50ms per candidate attempt.

---

## 7. R2-07: Policy DSL Selection (GOV-AP-005 Remains Unresolved)

Selection of the Policy AST DSL is formally classified as **`UNRESOLVED (GOV-AP-005)`**. No dynamic expression parser may be authored until governance approval.

| Criterion | Google CEL | JsonLogic | Custom Rational AST | JSON-e |
|---|---|---|---|---|
| **Expressiveness** | High (C-like expressions) | Medium (Prefix operators) | Targeted ($\mathbb{Q}$ math only) | Medium (Template-driven) |
| **Exact Rational Support** | Poor (Requires extensions) | Poor (Native floats) | Native First-Class ($\mathbb{Q}$) | Poor (Native floats) |
| **Deterministic Evaluation** | Strong | Strong | Absolute | Strong |
| **Sandboxing & Isolation** | Excellent | Excellent | Absolute (Zero syscalls) | Good |
| **Canonical Serialization** | Complex (Protobuf AST) | Native JSON | Strict RFC 8785 JSON | Native JSON |
| **Version Compatibility** | High | High | Maximum (Full code ownership) | Moderate |
| **Security & Injection** | Strong (Non-Turing complete) | Strong | Absolute (Closed operator set) | Good |
| **Auditability** | Moderate | High | Maximum | High |
| **Resource Bounds** | Strong | Moderate | Strict (Eager GCD / bit bounds) | Moderate |
| **Dependency Footprint** | Heavy (`@google/cel-js`) | Low | Zero External Dependencies | Low |

---

## 8. R2-08: Integrity Evidence vs Cryptographic Mechanism (Invariant I Split)

To maintain technology neutrality, Invariant I is formally separated:

### Invariant I-A: Security & Privilege (Architectural Requirement)
- **Separation of Duties**: The author of a policy cannot approve or activate that policy (4-eyes principle).
- **Least Privilege**: Policy evaluation runtimes execute in hermetic, zero-I/O sandboxes with read-only policy access.
- **Unauthorized Activation Prevention**: Policies can only be activated by verified administrative credentials.

### Invariant I-B: Integrity Evidence (Verifiable Evidence Requirement)
- **Architectural Requirement**: All policy packages, input state tuples, and evaluation result records must carry verifiable, tamper-evident integrity evidence.
- **Mechanism (Candidate Choice)**: The verification mechanism is an implementation choice (cryptographic hash digests, HMACs, asymmetric digital signatures, or HSM certificates). No specific vendor or algorithm is hardcoded as an architectural invariant.

---

## 9. R2-09: Decoupled Candidate Downstream Domains (GOV-AP-001, 002, 010)

The Assessment-Policy Layer strictly transforms **marks**. Non-assessment domains are isolated as independent governance questions:

```text
┌────────────────────────────────────────────────────────┐
│ Canonical Assessment Policy (TRANSFORMS MARKS)         │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼ Emits Pure Evaluated Marks
┌────────────────────────────────────────────────────────┐
│ 🟡 GOV-AP-001: Qualification & Eligibility Domain      │
│ Inputs: Marks + Candidate Category / Quotas            │
│ Outputs: isQualified, Sectional Clearance              │
│ Privacy: Processes reservation demographics (PII)      │
│ Reason Excluded: Mark engine must not evaluate quotas  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 🟡 GOV-AP-002: Ranking & Merit Domain                  │
│ Inputs: All Candidate Marks + Cohort Data + Tie-breaks │
│ Outputs: All India Rank (AIR), Category Ranks          │
│ Privacy: Processes candidate DOB, age, names for ties  │
│ Reason Excluded: Requires multi-candidate global sort  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 🟡 GOV-AP-010: Result Administration Domain            │
│ Inputs: Qualification + Biometric / Malpractice Flags  │
│ Outputs: PASS, FAIL, WITHHELD, CANCELLED               │
│ Reason Excluded: Administrative flags are not scoring  │
└────────────────────────────────────────────────────────┘
```

---

## 10. R2-10: Phase 3.6 Final Boundary Invariant

The architectural charter of Phase 3.6 is permanently fixed as:
```text
Phase 3.6: Read-Only Result Projection Gateway
```

### 10.1 Strict Prohibitions
Phase 3.6 must **NOT**:
1. Calculate, adjust, or sum marks.
2. Rescale, normalize, or equate scores.
3. Evaluate category reservation cutoffs.
4. Compute percentiles or merit ranks.
5. Execute demographic tie-breaking.
6. Alter or mutate authoritative evaluation records.

### 10.2 Permitted Projection Duties
Phase 3.6 may **ONLY**:
1. Query sealed, pre-evaluated result records.
2. Render read-only candidate scorecards (Web / Mobile).
3. Generate downloadable official PDF transcripts.
4. Project merit lists into paginated view DTOs.

---

## 11. R2-11: Formal Governance Decision Register (Status Classification)

Every governance item is assigned a formal status enum (`RESOLVED`, `UNRESOLVED`, `DEFERRED`, `BLOCKED`):

| Decision ID | Topic | Formal Status | Governing Rationale | Implementation Scope Blocked |
|---|---|---|---|---|
| **GOV-AP-001** | Qualification & Eligibility Ownership | **`UNRESOLVED`** | Ownership options documented; awaiting committee sign-off. | Qualification policy evaluators, category cutoffs. |
| **GOV-AP-002** | Ranking & Merit List Ownership | **`UNRESOLVED`** | Decoupled from Phase 3.6; requires separate domain design. | Ranking engines, full-cohort sorting, tie-breakers. |
| **GOV-AP-003** | Statutory Source Authority Model | **`RESOLVED`** | Architecture formalizes 7-stage chain and precedence hierarchy. | Source ingestion adapters (pending implementation gate). |
| **GOV-AP-004** | Cohort Data Authority & Ingestion | **`RESOLVED`** | Architecture mandates sealed, controller-signed cohort records. | Cohort equating evaluators (pending implementation gate). |
| **GOV-AP-005** | Policy AST / DSL Selection | **`UNRESOLVED`** | 10-criteria comparison complete; DSL selection pending governance. | Dynamic formula parsers and execution sandboxes. |
| **GOV-AP-006** | Numerical Representation & Bounds | **`RESOLVED`** | Conceptual exact rational requirements and DoS bounds defined. | Concrete math library (pending implementation gate). |
| **GOV-AP-007** | Cryptographic Trust & Signature Model | **`DEFERRED`** | Separated into Invariant I-B; specific PKI deferred to deployment. | Cryptographic key adapters. |
| **GOV-AP-008** | Historical Replay Specification | **`RESOLVED`** | Replay defined under 11-element pinned execution spec $\mathcal{E}_{\text{pin}}$. | Replay verification scripts (pending implementation gate). |
| **GOV-AP-009** | Policy Composition Boundaries | **`RESOLVED`** | Acyclic policy-driven stage composition model established. | Pipeline orchestrators (pending implementation gate). |
| **GOV-AP-010** | Result Classification Ownership | **`UNRESOLVED`** | Decoupled from scoring engine; awaiting result admin charter. | Classification status resolvers. |

---

## 12. R2-12: The Final Authoritative Architecture Graph

```text
┌────────────────────────────────────────────────────────────────────────┐
│ EXTERNAL SOURCE (Statutory Evidence)                                   │
│ Official Gazette, Examination Notification, Statutory Corrigendum      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (Attestation)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ SOURCE FACT / AUTHORITY RECORD (Evidence Layer)                        │
│ Immutable URI, Document Digest SHA-256, Publication Metadata           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (Human / Committee Translation)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ POLICY INTERPRETATION (Interpretation Layer)                           │
│ Formal Academic & Legal Operational Mapping (Resolves Ambiguities)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (Versioning & Lineage Binding)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ POLICY VERSION & EXECUTABLE AST (Machine Representation Layer)         │
│ Pinned Immutable Version, AST Rules, Rational Parameters, DoS Guards   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ CANONICAL ASSESSMENT-POLICY EVALUATOR (Pure Mathematical Engine)        │
│ Ingests Phase 3.5 Raw Score + Phase 2D-5 Item Dispositions             │
│ Evaluates Policy-Driven Acyclic Pipeline Stages:                        │
│ [Aggregate Scoring] ──> [Paper Rescaling] ──> [Cohort Normalization]   │
└──────────────────┬─────────────────────────────────────────────────────┘
                   │
                   ▼ (Pure Assessment Outputs: Scaled / Normalized Marks)
┌────────────────────────────────────────────────────────────────────────┐
│ 🟡 DECOUPLED DOWNSTREAM DOMAINS (UNRESOLVED OWNERSHIP)                 │
│                                                                        │
│ ┌───────────────────────────────────┐ ┌──────────────────────────────┐ │
│ │ Qualification Domain (GOV-AP-001) │ │ Ranking Domain (GOV-AP-002)  │ │
│ │ Evaluates Category Cutoffs & PII  │ │ Cohort Sorting & Tie-Breaks  │ │
│ └───────────────────────────────────┘ └──────────────────────────────┘ │
│ ┌───────────────────────────────────┐                                  │
│ │ Result Admin Domain (GOV-AP-010)  │                                  │
│ │ PASS, FAIL, WITHHELD Status Flags │                                  │
│ └───────────────────────────────────┘                                  │
└──────────────────┬─────────────────────────────────────────────────────┘
                   │
                   ▼ (Sealed Result Projection DTOs)
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 3.6: RESULT PROJECTION GATEWAY (STRICTLY LOCKED 🔒)              │
│ Pure Read-Only Scorecard UI & Transcript Projection (Zero Math)        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 13. R2-13: Implementation Readiness Gate

```text
================================================================================
FINAL GATE DECISION:
🟡 ARCHITECTURE COMPLETE — GOVERNANCE AUTHORIZATION REQUIRED

Assessment Policy Implementation:  🔒 STRICTLY LOCKED
Qualification Domain:              🔒 STRICTLY LOCKED (GOV-AP-001 Unresolved)
Ranking & Merit Domain:            🔒 STRICTLY LOCKED (GOV-AP-002 Unresolved)
Policy DSL Engine:                 🔒 STRICTLY LOCKED (GOV-AP-005 Unresolved)
Phase 3.6 Gateway:                 🔒 STRICTLY LOCKED
================================================================================
```

---

## 14. R2-14: Mandatory Self-Audit Findings

1. `git status` / `git diff` executed: Confirms zero source code, migrations, or schemas modified.
2. Certified baselines verified: Phase 2A–2D8 certified; Phase 3.1–3.5 certified & closed; Phase 3.6 locked.
3. Zero implementation verified: Exactly zero `.ts`, `.tsx`, `.js`, or `.sql` implementation files authored. Documentation only.
