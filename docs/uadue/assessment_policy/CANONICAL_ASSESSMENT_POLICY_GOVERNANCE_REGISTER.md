# Canonical Assessment-Policy Layer — Formal Governance Decision Register & Claims Taxonomy
**Document Identifier:** `UADUE-SPEC-AP-GOV-REGISTER-001`  
**Security Classification:** Restricted Engineering Specification  
**Status:** Architecture Specification Only — Zero Implementation  
**Gate:** Canonical Assessment-Policy Governance Gate (Consistency Hardening Pass R4)

---

## 1. Taxonomy of Architectural Claims

Every statement and concept within the Canonical Assessment-Policy Layer is classified according to the following seven-tier taxonomy:

| Tier Code | Classification | Definition | Governing Invariant |
|---|---|---|---|
| **A** | **Frozen Architectural Fact** | Established in frozen, certified upstream phases (Phase 2A–2D8, Phase 3.1–3.5). | Immutable; zero modification permitted. |
| **B** | **Existing Authoritative Contract** | Formally defined TypeScript interface or sealed database schema in the frozen repository baseline. | Binding contract; cannot be re-interpreted. |
| **C** | **Proposed Architecture** | Structural design proposed for the Canonical Assessment-Policy Layer. | Subject to review; approved as direction only. |
| **D** | **Candidate Implementation Choice** | Engineering mechanism proposed to realize an architectural requirement (e.g., BigInt, custom AST, specific hashing algorithms). | Non-binding candidate; requires separate evaluation. |
| **E** | **Statutory / Legal Claim Requiring External Source** | Assertion regarding external statutory bodies, legal rules, reservation categories, or compliance acts. | Must be proven from repository documents or marked UNRESOLVED. |
| **F** | **Example Only** | Illustrative formula or scenario (e.g., GATE formula, SSC percentile) used for explanatory purposes. | Explicitly non-canonical; never encoded into the core engine contract. |
| **G** | **Unresolved Governance Decision** | Policy ownership, authority source, or boundary requiring formal institutional sign-off. | Formally isolated; implementation strictly blocked. |

---

## 2. Formal Governance Decision Register (GOV-AP-001 through GOV-AP-013)

Every governance item is assigned a formal status from the enum:
$$\text{Status} \in \{ \mathbf{RESOLVED}, \, \mathbf{UNRESOLVED}, \, \mathbf{DEFERRED}, \, \mathbf{BLOCKED} \}$$

*Governance Mandate:* **A recommendation is NOT a decision.** Where an item is marked `UNRESOLVED`, implementation of the affected domain remains strictly blocked.

### 2.1 Reconciliation & Evidence Taxonomy Cross-Reference (AP-DEC-001 .. AP-DEC-013)

The table below reconciles architectural items (`GOV-AP-*`) with Product Owner decisions (`AP-DEC-*`) across evidence classes:
- **Category A:** Explicit live Product Owner approval in repository/session.
- **Category B:** Architectural Decision Record (`PROPOSED (DESIGN ONLY)`).
- **Category C:** Proposed architecture specification.
- **Category D:** Incomplete/undecided repository entry (`[UNDECIDED]`).
- **Category E:** Historical recovery baseline claim from deleted session (requires in-repository re-ratification).

| PO Decision ID | Architectural Scope | Evidence Class | Historical Recovery Status | Current Repository Register Status | Current Implementation Status |
|---|---|---|---|---|---|
| **AP-DEC-001** | Initial Supported Exam Profiles | Category E | 🟢 Frozen | `UNRESOLVED` (Scope Profile Dependent) | 🔒 Locked |
| **AP-DEC-002** | Assessment Capability Boundary | Category E | 🟢 Frozen | `UNRESOLVED` (Capability Gated) | 🔒 Locked |
| **AP-DEC-003** | Qualification Ownership (`GOV-AP-001`) | Category E / B | 🟢 Frozen (Score-based only) | `UNRESOLVED` (`GOV-AP-001`) | 🔒 Locked |
| **AP-DEC-004** | Ranking Ownership (`GOV-AP-002`) | Category E / B | 🟢 Frozen (Gated in R1) | `UNRESOLVED` (`GOV-AP-002`) | 🔒 Locked |
| **AP-DEC-005** | Source Authority Precedence (`GOV-AP-003`) | Category E / B | 🟢 Frozen (Profile-specific) | `UNRESOLVED / SOURCE-CLASS DEPENDENT` (`GOV-AP-003`) | 🔒 Locked |
| **AP-DEC-006** | Cohort Ingestion Model (`GOV-AP-004`) | Category E / B | 🟢 Frozen (Tripartite separation) | `UNRESOLVED / SOURCE-CLASS DEPENDENT` (`GOV-AP-004`) | 🔒 Locked |
| **AP-DEC-007** | Policy AST / DSL (`GOV-AP-005`) | Category E / B | 🟢 Frozen (Declarative AST) | `UNRESOLVED` (`GOV-AP-005`) | 🔒 Locked |
| **AP-DEC-008** | Result Classification (`GOV-AP-010`) | Category E / B | 🟢 Frozen (Gated in R1) | `UNRESOLVED` (`GOV-AP-010`) | 🔒 Locked |
| **AP-DEC-009** | Failure & Quarantine Policy (`ADR-AP-007`) | Category E / B | 🟢 Frozen (Fail-closed matrix) | `RESOLVED (Architectural)` (`ADR-AP-007` / Spec 001) | 🔒 Locked |
| **AP-DEC-010** | Historical Replay Horizon (`GOV-AP-008`) | Category E / B | 🟢 Frozen (Cycle + 1 year) | `RESOLVED (Conceptual $\mathcal{E}_{\text{pin}}$)` (`GOV-AP-008`) | 🔒 Locked |
| **AP-DEC-011** | Multi-Tenancy Scoping (`ADR-AP-009`) | Category E / B | 🟢 Frozen (Strict isolation) | `RESOLVED (Architectural)` (`ADR-AP-009`) | 🔒 Locked |
| **AP-DEC-012** | Psychometric IRT Scope (Cap #20) | Category E | 🟢 Frozen (Excluded from R1) | `UNRESOLVED / OUT OF SCOPE` | 🔒 Locked |
| **AP-DEC-013** | Automated Policy Ingestion | **Category A** | 🟢 Frozen | **`RESOLVED / FROZEN` (`GOV-AP-013`)** | 🔒 Locked |

---

### GOV-AP-001: Qualification & Eligibility Ownership
- **Formal Status:** **`UNRESOLVED`**
- **Question**: Does the Canonical Assessment-Policy Layer own candidate qualification evaluation, or does it belong to a separate downstream Qualification/Eligibility domain?
- **Why it matters**: Candidate qualification depends on non-mathematical attributes (category reservations, age limits, attempt counts, institutional quotas, domicile) that risk polluting a pure assessment transformation engine.
- **Architectural Position**: Candidate separate domain; mark transformation engine does not evaluate demographic quotas.
- **Implementation Scope Blocked**: Qualification policy evaluators, category cutoff matrices, and quota eligibility rules.

---

### GOV-AP-002: Ranking & Merit List Ownership
- **Formal Status:** **`UNRESOLVED`**
- **Question**: Which architectural component owns candidate ranking, percentile calculation across cohorts, and demographic tie-breaking?
- **Why it matters**: Ranking requires full-cohort visibility, multi-candidate sorting, and demographic tie-breakers. Placing ranking in Phase 3.6 violates its read-only projection charter.
- **Architectural Position**: Candidate separate domain; prohibited from entering Phase 3.6.
- **Implementation Scope Blocked**: Ranking engines, full-cohort sorting, demographic tie-breakers.

---

### GOV-AP-003: Statutory Source Authority Model & Document Precedence
- **Formal Status:** **`UNRESOLVED / SOURCE-CLASS DEPENDENT`**
- **Question**: What constitutes valid authoritative proof for an examination policy, and what is the precedence order among source documents?
- **Why it matters**: Precedence cannot be hardcoded universally across government gazettes, private tests, university exams, and Mock.AI synthetic tests. A universal legal ordering is legally unsound.
- **Architectural Position**: Precedence is source-class-dependent and must be explicitly established within each `EXAM_POLICY_PROFILE`. Conflicting documents without explicit precedence fail closed to `AUTHORITY_CONTRADICTION` and transition to `QUARANTINE`.
- **Implementation Scope Blocked**: Source fact ingestion adapters.

---

### GOV-AP-004: Cohort Data Authority & Ingestion Model
- **Formal Status:** **`UNRESOLVED / SOURCE-CLASS DEPENDENT`**
- **Question**: Who is authorized to declare cohort statistics authoritative, how are they attested, and who is the operational ingestion actor?
- **Why it matters**: Mandating a "Controller of Examinations" is an institution-specific title that breaks universality for universities, private test providers, and Mock.AI internal assessments. Furthermore, operational software daemons (e.g. `SYSTEM_BATCH_DAEMON`) must never be conflated with authorized academic/statutory authorities.
- **Architectural Position**: Generalized `CohortAuthorityRecord` defined with strict tripartite separation: (1) Authority (`authorityIdentity`, `authorityRole`), (2) Attestation & Integrity Evidence (`attestationEvidence`), and (3) Ingestion Actor (`ingestionActor`). Ingestion software is strictly an operational actor. Authorized declaring roles and verification methods are delegated to the applicable `EXAM_POLICY_PROFILE`. Missing cohort defers evaluation (`DEFER` / `INSUFFICIENT_COHORT_DATA`).
- **Implementation Scope Blocked**: Cohort equating evaluators and multi-shift equating logic.

---

### GOV-AP-005: Policy AST / Domain-Specific Language (DSL)
- **Formal Status:** **`UNRESOLVED`**
- **Question**: Which Domain-Specific Language (DSL) and interpreter must be used to represent machine-executable policy rules?
- **Why it matters**: Governs how formulas are stored, parsed, validated, sandboxed, and executed without security risks (`eval`) or platform floating-point divergence.
- **Architectural Position**: Detailed 10-criteria comparison complete (Google CEL vs JsonLogic vs Custom Rational AST vs JSON-e). Decision pending governance.
- **Implementation Scope Blocked**: Dynamic formula parsers, AST interpreters, and execution sandboxes.

---

### GOV-AP-006: Numerical Representation & Precision Bounds
- **Formal Status:** **`RESOLVED` (At Conceptual Level)**
- **Question**: What are the formal mathematical requirements, reduction limits, and bounds for exact rational arithmetic?
- **Resolution**:
  - Exact coprime rational form $\mathbb{Q} = n/d$ with $d > 0$, $\gcd(|n|, d)=1$.
  - Unique zero ($0/1$); division-by-zero fails closed with `DIVISION_BY_ZERO`.
  - Exact cross-multiplication comparison ($n_1 d_2 \text{ vs } n_2 d_1$). Statutory rounding at designated reporting boundaries only.
  - Candidate bounds: $|n|, |d| \le 2^{256}$, AST depth $\le 32$, and eager GCD reduction designated as candidate engineering bounds against DoS.
- **Implementation Scope Blocked**: Concrete BigInt rational math library (pending implementation gate).

---

### GOV-AP-007: Cryptographic Trust & Signature Model
- **Formal Status:** **`DEFERRED`**
- **Question**: What cryptographic signature scheme and key management hierarchy must be used to seal policies and assessment receipts?
- **Resolution**:
  - Architectural requirement is technology-neutral: Invariant I-B mandates verifiable integrity evidence.
  - Specific mechanisms (ECDSA, Ed25519, RSA-PSS, HSMs, PKI) are deferred as deployment choices.
- **Implementation Scope Blocked**: Cryptographic key management and signature verification modules.

---

### GOV-AP-008: Historical Replay Specification & Runtime Pinning
- **Formal Status:** **`RESOLVED` (At Architectural Level)**
- **Question**: What exact runtime, environment, and archival tuple is required to guarantee historical assessment reproducibility?
- **Resolution**:
  - Replay contract defined as deterministic execution under the **11-Element Pinned Execution Specification**:
    $$\mathcal{E}_{\text{pin}} = \langle \mathcal{S}_{\text{src}}, \mathcal{C}_{\text{can}}, \mathcal{V}_{2\text{D}5}, \mathcal{V}_{3.5}, \mathcal{P}_{\text{id}}, \mathcal{P}_{\text{ver}}, \mathcal{A}_{\text{ast}}, \mathcal{N}_{\text{num}}, \mathcal{J}_{\text{ser}}, \mathcal{K}_{\text{sch}}, \mathcal{R}_{\text{env}} \rangle$$
  - Operational 10-year preservation requires a separate archival and virtualization strategy.
- **Implementation Scope Blocked**: Replay verification scripts and long-term archive storage adapters (pending implementation gate).

---

### GOV-AP-009: Policy Composition Boundaries & Universal Dataflow
- **Formal Status:** **`RESOLVED` (At Architectural Level)**
- **Question**: Is the sequential pipeline `Aggregate -> Cohort -> Qualification` universal, or do exams require alternative composition DAGs?
- **Resolution**:
  - Implied linear sequence removed. Composition is policy-driven via an acyclic graph declared in the policy AST.
  - Invariants: Mandatory dependency on Phase 3.5 raw score; type guards prevent double-normalization; downstream stages cannot mutate upstream outputs.
- **Implementation Scope Blocked**: Pipeline orchestrators and stage execution dispatchers (pending implementation gate).

---

### GOV-AP-010: Result Classification Ownership
- **Formal Status:** **`UNRESOLVED`**
- **Question**: Which component owns candidate result classification (e.g., `"PASS"`, `"FAIL"`, `"WITHHELD"`, `"DISQUALIFIED"`)?
- **Why it matters**: Result classification combines academic performance with candidate administrative status (biometrics, malpractice, documentation).
- **Architectural Position**: Candidate separate domain (Result Administration Domain); decoupled from scoring math.
- **Implementation Scope Blocked**: Result classification status resolvers.

---

### GOV-AP-013 / AP-DEC-013: Automated Natural Language Policy Ingestion
- **Formal Status:** **`RESOLVED / FROZEN`**
- **Question**: Does Mock.AI permit AI/LLM-based automatic extraction of scoring rules from source documents into executable assessment-policy rules?
- **Resolution**:
  - Autonomous AI/LLM direct conversion of source-language assessment-policy material into executable rules is strictly prohibited for Release 1.
  - AI/LLM systems possess zero policy authority.
  - Three-tier provenance model (Tier 1 Source Fact $\to$ Tier 2 Authorized Interpretation $\to$ Tier 3 Machine AST) and the Zero-Orphan rule are binding invariants.
  - Future AI-assisted drafting remains undecided and is not authorized.
  - Unrelated document processing (OCR, layout segmentation, question candidate extraction) is not prohibited.
- **Evidence Basis:** Category A — Explicit Product Owner approval recorded in Antigravity session on 2026-10-08T19:38:43-07:00; Authoritative Decision Record [`AP_DEC_013_AUTOMATED_POLICY_INGESTION.md`](file:///Users/shivarampatel/Desktop/MOCK.AI/docs/uadue/assessment_policy/AP_DEC_013_AUTOMATED_POLICY_INGESTION.md) frozen on disk.
- **Documented Adjacent Protocol Gaps:** (1) Pre-flight ingestion schema rejection error codes remain un-enumerated in AP-DEC-009; (2) `AUTHORITY_CONTRADICTION` is referenced conceptually in `GOV-AP-003` but evaluated at runtime under `PROVENANCE_CONTRADICTION`.
- **Implementation Scope Blocked:** Autonomous AI/LLM policy ingestion adapters. Assessment-Policy implementation remains strictly locked.

