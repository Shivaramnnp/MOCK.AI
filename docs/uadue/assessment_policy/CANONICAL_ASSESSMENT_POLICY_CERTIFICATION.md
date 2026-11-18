# Canonical Assessment-Policy Layer — Certification Gate & Adversarial Catalog
**Document Identifier:** `UADUE-SPEC-AP-CERT-001`  
**Security Classification:** Restricted Engineering Specification  
**Status:** Architecture Specification Only — Zero Implementation  
**Gate:** Canonical Assessment-Policy Governance Gate (Remediation R1)

---

## 1. Formal Certification Mandate

In UADUE governance, **green test runs alone DO NOT constitute architectural certification**. 

A test suite can be green while concealing subtle boundary inversions, implicit rounding drifts, or unauthorized policy ownership. The Canonical Assessment-Policy Layer can only achieve formal certification when it satisfies **13 Technology-Neutral Certification Invariants (Invariants A through M)** and addresses all **25 Adversarial Scenarios** with proven fail-closed semantics.

---

## 2. R1-14: The 13 Technology-Neutral Certification Invariants (Invariants A–M)

```text
┌────────────────────────────────────────────────────────────────────────┐
│ THE 13 TECHNOLOGY-NEUTRAL CERTIFICATION INVARIANTS                     │
├───────────────────────────────────┬────────────────────────────────────┤
│ Invariant A: Contract Conformance │ Invariant H: Fail-Closed Conflict  │
│ Invariant B: Authority Protection │ Invariant I: Security & Trust      │
│ Invariant C: Provenance Integrity │ Invariant J: Tenant Isolation      │
│ Invariant D: Determinism          │ Invariant K: Adversarial Defense   │
│ Invariant E: Numerical Precision  │ Invariant L: Zero Regression       │
│ Invariant F: Version Immutability │ Invariant M: Upstream Freeze       │
│ Invariant G: Replay Under Spec    │                                    │
└───────────────────────────────────┴────────────────────────────────────┘
```

### Invariant A: Contract Conformance
- **Formal Assertion**: Evaluator accepts strictly typed input specifications and produces strictly typed assessment records without untrusted client parameters or undocumented schema fields.

### Invariant B: Authority Protection (Non-Inversion)
- **Formal Assertion**: The Assessment-Policy Layer never recalculates item-level scoring, never alters Phase 2D-5 awarded marks, and never alters item dispositions. Phase 3.5 remains strictly raw-score only ($\text{totalRawScore} = \sum \text{awardedMarks}$, $\text{totalNormalizedScore} = \text{null}$).

### Invariant C: Provenance Integrity
- **Formal Assertion**: Every mathematical rule evaluated by the engine possesses an unbroken, verifiable reference chain back to an operational interpretation and source authority (Zero-Orphan Invariant).

### Invariant D: Determinism
- **Formal Assertion**: The evaluation engine is a referentially transparent function $\text{Output} = \mathcal{F}(S, P)$ with zero dependence on ambient wall-clock syscalls, pseudo-random generators, or unpinned external state.

### Invariant E: Numerical Precision
- **Formal Assertion**: The mathematical model enforces exact rational arithmetic where required by policy; intermediate operations exhibit zero floating-point binary drift, and statutory rounding occurs strictly at designated boundaries.

### Invariant F: Version Immutability & DAG Lineage
- **Formal Assertion**: Policy definitions are immutable once activated. Supersession and revisions form an acyclic directed graph (DAG). Withdrawn policies cannot be evaluated for new attempts.

### Invariant G: Replay Under Pinned Specification
- **Formal Assertion**: Given an identical 11-element pinned execution specification $\mathcal{E}_{\text{pin}}$, historical evaluation can be replayed deterministically, producing bitwise identical outputs across supported platforms.

### Invariant H: Fail-Closed Conflict Handling
- **Formal Assertion**: Any policy ambiguity, version conflict, missing prerequisite cohort data, or mathematical singularity fails closed into an explicit non-evaluable state (`REJECT`, `QUARANTINE`, or `DEFER`). Silent fallbacks or heuristic best-guesses are forbidden.

### Invariant I-A: Security & Privilege Separation
- **Formal Assertion**: Multi-party authorization (4-eyes principle) is enforced between policy authoring and activation. Least privilege is maintained, and unauthorized policy promotion is strictly prevented.

### Invariant I-B: Integrity Evidence
- **Formal Assertion**: All policy definitions, input state tuples, and evaluation result records must carry verifiable, tamper-evident integrity evidence. The specific verification mechanism (hashes, MACs, digital signatures, or HSMs) is an implementation choice.

### Invariant J: Tenant Isolation
- **Formal Assertion**: Policies and evaluations are strictly partitioned by tenant identity. Cross-tenant access attempts immediately fail closed and trigger security audit records.

### Invariant K: Adversarial Defense
- **Formal Assertion**: The system's architectural boundaries remain intact under all 25 specified adversarial scenarios without panic, memory corruption, or unauthorized score emission.

### Invariant L: Zero Regression
- **Formal Assertion**: Existing delivery test suite (68/68), Phase 2D-5 suite (115/115), and PostgreSQL suite (37/37) remain 100% passing.

### Invariant M: Upstream Immutability Verification
- **Formal Assertion**: Phase 2A–2D8, Phase 3.1–3.5, and Phase 3.6 codebases exhibit zero canonical diffs against their certified frozen baselines.

---

## 3. R1-15: The 25 Adversarial Scenarios Classification Catalog

Rather than claiming future "100% pass" before code is written, each scenario is classified by its architectural verification nature:

| # | Adversarial Scenario Name | Scenario Description | Classification Category | Governing Principle |
|---|---|---|---|---|
| **1** | **Policy Collision** | Two active policies match the same paper and session with identical priority. | **Architecture Invariant** | Fail-closed: quarantine attempt; zero silent choice. |
| **2** | **Policy Supersession** | Request evaluates against older version without explicit version pin. | **Architecture Invariant** | Rejects unpinned invocation; requires explicit pin. |
| **3** | **Withdrawn Policy** | Request evaluates attempt against a legally revoked policy. | **Architecture Invariant** | Quarantines attempt (`POLICY_WITHDRAWN`). |
| **4** | **Stale Policy** | Attempt date is outside the policy statutory validity window. | **Architecture Invariant** | Rejects request (`POLICY_EXPIRED`). |
| **5** | **Source Mutation** | Attempt raw scores or item awarded marks mutated after Phase 3.5 seal. | **Future Implementation Test** | Input hash verification detects tampering; quarantines attempt. |
| **6** | **Policy Mutation** | Parameter in approved policy modified in underlying storage. | **Future Implementation Test** | Policy digest verification fails; rejects policy package. |
| **7** | **Policy ID Collision** | Duplicate policy ID registered under conflicting version rules. | **Future Implementation Test** | Storage unique compound constraint rejects insertion. |
| **8** | **Fingerprint Collision Attempt** | Malicious policy engineered to match existing cryptographic seal. | **External Compliance Test** | Cryptographic hash collision resistance prevents forgery. |
| **9** | **Numerical Overflow** | Input marks specify astronomically large integers. | **Architecture Invariant** | Bound check rejects values exceeding statutory caps. |
| **10** | **Precision Boundary** | Score calculation lands exactly at half-way rounding point. | **Future Implementation Test** | Statutory rounding rule applies deterministically without jitter. |
| **11** | **Rounding Boundary** | Two scores differ only beyond statutory truncation precision. | **Future Implementation Test** | Statutory truncation truncates deterministically. |
| **12** | **Missing Cohort** | Multi-shift normalization requested before cohort stats are sealed. | **Architecture Invariant** | Evaluation deferred cleanly (`INSUFFICIENT_COHORT_DATA`). |
| **13** | **Contradictory Cohort** | Cohort statistical matrix contains mathematically impossible variance. | **Future Implementation Test** | Cohort validator rejects dataset; quarantines batch. |
| **14** | **Duplicate Policy** | Identical policy rules submitted under a distinct policy ID. | **Future Implementation Test** | Registry flags structural duplicate. |
| **15** | **Cross-Tenant Policy Access**| Tenant A attempts to execute evaluation using Tenant B's policy. | **Architecture Invariant** | Tenant boundary enforcement rejects with security alarm. |
| **16** | **Unauthorized Policy Activation** | User with author role attempts to activate policy without approver sign-off. | **External Compliance Test** | Multi-party privilege separation rejects single-party promotion. |
| **17** | **Historical Replay** | Historical attempt re-evaluated years later under pinned spec. | **Future Implementation Test** | Pinned execution spec reproduces bitwise identical output digest. |
| **18** | **Current-Policy Substitution**| Attacker passes latest active policy during historical replay. | **Architecture Invariant** | Policy digest mismatch detected; rejects substitution. |
| **19** | **Double Normalization** | Request passes already normalized score back into equating engine. | **Architecture Invariant** | Typed input contract rejects pre-normalized payload. |
| **20** | **Circular Policy Dependency**| Policy A supersedes Policy B which supersedes Policy A in lineage DAG. | **Architecture Invariant** | DAG cycle detector rejects policy package during registration. |
| **21** | **Ambiguous Applicability** | Candidate attempt attributes do not match any policy eligibility rule. | **Unresolved Governance Case** | Quarantines attempt pending GOV-AP-001 resolution. |
| **22** | **Partial Policy Definition** | Policy submitted with missing section rules. | **Future Implementation Test** | Schema validator rejects incomplete policy creation. |
| **23** | **Corrupted Provenance** | Tier 3 rule contains dangling interpretation pointer. | **Architecture Invariant** | Zero-orphan validator rejects activation (`PROVENANCE_FAILURE`). |
| **24** | **Corrupted Policy Seal** | Policy JSON payload modified after cryptographic sealing. | **Future Implementation Test** | Signature verification fails; engine halts with integrity alert. |
| **25** | **Deterministic Parallel Replay**| 1,000 parallel evaluations of identical input under simulated concurrency. | **Future Implementation Test** | Concurrency verification confirms zero data races or divergence. |

---

## 4. Certification Verification Protocol

1. Before any code may be merged, each of the 25 scenarios must have a dedicated test specification.
2. Technology-neutral invariants A through M must be satisfied.
3. Test suite execution is a necessary condition, but **formal architectural sign-off** is the only sufficient condition for certification.
