# Canonical Assessment-Policy Layer — Determinism & Historical Replay Specification
**Document Identifier:** `UADUE-SPEC-AP-DETERMINISM-001`  
**Security Classification:** Restricted Engineering Specification  
**Status:** Architecture Specification Only — Zero Implementation  
**Gate:** Canonical Assessment-Policy Governance Gate (Remediation R1)

---

## 1. Mathematical Determinism Contract: Output = F(S, P)

The Canonical Assessment-Policy Layer is specified as a **pure, side-effect-free, referentially transparent mathematical function**:

$$\text{Output} = \mathcal{F}(S, P)$$

Where:
- $S$ is the **Immutable Assessment Evaluation State Tuple** (comprising frozen Phase 3.5 raw score outputs, verified Phase 2D-5 item evaluation records, and sealed cohort observation matrices).
- $P$ is the **Immutable Canonical Policy Definition Tuple** (comprising statutory policy rules, mathematical transformation ASTs, and canonical rounding parameters).
- $\mathcal{F}$ is the **Canonical Policy Evaluation Engine**, executing deterministically across all environments and CPU architectures.

### 1.1 Referential Transparency Invariant
For any two invocations executing against identical inputs $S$ and policy $P$ under a pinned execution specification:

$$\mathcal{F}(S, P)_{\text{invocation1}} \equiv \mathcal{F}(S, P)_{\text{invocation2}}$$

The output byte stream, when serialized via RFC 8785 (Canonical JSON), must yield an identical cryptographic digest:

$$\text{SHA-256}(\text{RFC8785}(\mathcal{F}(S, P)_{\text{invocation1}})) = \text{SHA-256}(\text{RFC8785}(\mathcal{F}(S, P)_{\text{invocation2}}))$$

---

## 2. Specification of the Deterministic Input Tuple S

The evaluation function $\mathcal{F}$ accepts strictly bounded, validated, immutable inputs. No ambient or implicit parameters may be consumed:

$$S = \langle \mathcal{A}, \mathcal{R}_{\text{raw}}, \mathcal{I}_{\text{items}}, \mathcal{C}_{\text{cohort}}, \mathcal{M}_{\text{audit}} \rangle$$

1. **$\mathcal{A}$ — Candidate / Attempt Identification**:
   - `attemptId`: Cryptographic identifier of the exam attempt.
   - `paperId`: Immutable canonical paper UUID.
   - `shiftSessionId`: Canonical identifier for multi-shift sessions (if cohort equating applies).
   *(Note: Demographic attributes like category reservations are decoupled from assessment mark transformations pending GOV-AP-001).*
2. **$\mathcal{R}_{\text{raw}}$ — Phase 3.5 Raw Score Ingestion Record**:
   - `totalRawScoreRational`: Exact rational representation $\mathbb{Q} = n/d$ of the Phase 3.5 sum $\sum \text{awardedMarks}$.
   - `rawAttemptState`: Status string (`"EVALUATED"`, `"INCOMPLETE"`).
3. **$\mathcal{I}_{\text{items}}$ — Authoritative Phase 2D-5 Item Disposition Collection**:
   - Canonical list of item records, sorted deterministically by `questionId` ascending:
     ```typescript
     interface ItemDispositionInput {
       readonly questionId: string;
       readonly sectionId: string;
       readonly rawAwardedMarks: Rational;       // from Phase 2D-5
       readonly disposition: ItemDisposition;     // NORMAL | CANCELLED | DROPPED | ALL_FULL_MARKS
       readonly maxMarks: Rational;              // statutory base marks
       readonly negativeMarks: Rational;         // statutory penalty marks
     }
     ```
4. **$\mathcal{C}_{\text{cohort}}$ — Frozen Cohort Statistical Matrix (Optional / Pinned)**:
   - For paper-level single-session evaluation: `null`.
   - For multi-session equating: A sealed, immutably frozen statistical matrix. Missing cohort data defers execution (`INSUFFICIENT_COHORT_DATA`).
5. **$\mathcal{M}_{\text{audit}}$ — Upstream Lineage Metadata**:
   - `phase2D5ExecutionDigest`: Cryptographic seal of item evaluator execution.
   - `phase35IngestionDigest`: Cryptographic seal of Phase 3.5 delivery record.

---

## 3. Strict Execution Prohibitions

| Prohibited Vector | Reason for Prohibition | Mandatory Architectural Alternative |
|---|---|---|
| **Wall Clock (`Date.now()`, `new Date()`)** | Renders execution time-dependent; prevents historical replay. | Time enters strictly as data within $S$ or $P$. Evaluator has **zero access** to clock syscalls. |
| **Pseudo-Random Number Generators (`Math.random()`, crypto RNG)** | Introduces non-deterministic state branches. | PRNG imports are banned by AST linting and sandboxing. No stochastic methods permitted. |
| **Non-Deterministic UUID Generation (UUID v4)** | Produces divergent entity IDs on replay. | Generated record identifiers must be deterministic RFC 4122 v5 UUIDs derived from hashes. |
| **Dynamic Current Policy Lookup** | A runtime database query for "latest policy" breaks historical reproducibility. | Policy version $P$ must be explicitly pinned in the invocation signature. |
| **Network I/O & Socket Access** | Network latency, failures, or remote payload changes corrupt determinism. | Evaluator executes in a hermetic, zero-I/O in-memory environment. |
| **Database Order Ambiguity (`SELECT` without `ORDER BY`)** | Relational databases return sets without deterministic order. | All collections ingested into $S$ must be sorted canonically before entering $\mathcal{F}$. |
| **IEEE 754 Floating-Point Arithmetic** | Roundoff drift and platform differences. | Exact rational arithmetic throughout all intermediate operations. |
| **Unordered Map / Object Iteration** | `Object.keys()` order is implementation-dependent in older runtimes. | Canonical key iteration via RFC 8785 canonical key ordering. |

---

## 4. R1-08: Historical Replay Specification & The 11-Element Pin Set

The previous claim of an unconditional "10-year bitwise identical replay guarantee" is corrected to an **architectural requirement**:

> **"Historical replay MUST be deterministic for a fully pinned execution specification."**

A future 10-year operational replay capability cannot be certified today without a dedicated long-term archival and virtualization strategy. However, the architecture strictly specifies the complete set of parameters that must be pinned to make historical replay possible:

### The 11-Element Pinned Execution Specification ($\mathcal{E}_{\text{pin}}$)

$$\mathcal{E}_{\text{pin}} = \langle \mathcal{S}_{\text{src}}, \mathcal{C}_{\text{can}}, \mathcal{V}_{2\text{D}5}, \mathcal{V}_{3.5}, \mathcal{P}_{\text{id}}, \mathcal{P}_{\text{ver}}, \mathcal{A}_{\text{ast}}, \mathcal{N}_{\text{num}}, \mathcal{J}_{\text{ser}}, \mathcal{K}_{\text{sch}}, \mathcal{R}_{\text{env}} \rangle$$

1. **$\mathcal{S}_{\text{src}}$ — Source Package**: Cryptographic SHA-256 digest of original exam PDFs/source assets.
2. **$\mathcal{C}_{\text{can}}$ — Canonical Package**: Cryptographic digest of canonical DocumentGraph and QuestionGraph.
3. **$\mathcal{V}_{2\text{D}5}$ — Phase 2D-5 Algorithm Version**: Pinned semantic version of item scoring evaluator.
4. **$\mathcal{V}_{3.5}$ — Phase 3.5 Algorithm Version**: Pinned semantic version of raw delivery ingestion engine.
5. **$\mathcal{P}_{\text{id}}$ — Policy Identifier**: Uniform Policy Identifier.
6. **$\mathcal{P}_{\text{ver}}$ — Policy Version**: Pinned immutable policy semver string.
7. **$\mathcal{P}_{\text{ast}}$ — Policy AST Version**: Pinned schema/specification version of the policy AST interpreter.
8. **$\mathcal{N}_{\text{num}}$ — Numerical Semantics Version**: Pinned rational arithmetic specification and reduction rules.
9. **$\mathcal{J}_{\text{ser}}$ — Serialization Version**: Pinned RFC 8785 Canonical JSON specification.
10. **$\mathcal{K}_{\text{sch}}$ — Contract / Schema Version**: Pinned TypeScript data transfer interface schemas.
11. **$\mathcal{R}_{\text{env}}$ — Runtime Compatibility Specification**: Documented Node/V8 runtime version constraints.

### 4.1 Historical Replay Verification Protocol
To verify historical replay:
1. Load frozen input state $S$, policy version $P$, and pinned specification $\mathcal{E}_{\text{pin}}$.
2. Assert cryptographic digests match original stored audit receipts.
3. Execute $\text{Output}_{\text{replay}} = \mathcal{F}(S, P)$ within the pinned runtime sandbox.
4. Compare $\text{SHA-256}(\text{RFC8785}(\text{Output}_{\text{replay}}))$ bitwise against the historical result digest.
