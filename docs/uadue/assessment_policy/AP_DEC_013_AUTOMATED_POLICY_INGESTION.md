# Decision Record: AP-DEC-013
**Title:** Automated Natural Language Assessment-Policy Ingestion Boundary (Release 1)  
**Document Identifier:** `UADUE-DEC-AP-013-R1`  
**Security Classification:** Restricted Engineering Specification  
**Status:** FROZEN (APPROVED BY PRODUCT OWNER)  
**Gate:** Canonical Assessment-Policy Governance Gate (Frozen Decision Baseline)  
**Implementation Lock:** 🔒 **STRICTLY LOCKED / ZERO IMPLEMENTATION PERMITTED**  
**Date:** 2026-10-08  
**Upstream Dependencies:** AP-DEC-002 (Capability Boundary), AP-DEC-005 (Source Authority Precedence), AP-DEC-007 (Policy AST / DSL), AP-DEC-009 (Failure & Quarantine Policy)

---

## 1. Context & Problem Statement

Statutory notifications, brochures, syllabi, and corrigenda published by examination bodies contain natural language prose defining scoring schemes, dropped-question treatments, multi-shift normalization, sectional cutoffs, and tie-breaking rules.

Automated natural language processing systems, including Generative AI and Large Language Models (LLMs), can process unstructured text and synthesize structured outputs. However, AI/LLM systems possess fundamental operational characteristics:
- Non-deterministic semantic interpretation across runs.
- Potential for silent hallucination of parameters, conditions, or formulas.
- Lack of statutory, institutional, or legal authority to declare or interpret examination rules.

In a previous draft, an overreach occurred: the prohibition of automated AI/LLM policy extraction was conflated with prescriptive organizational requirements, such as mandatory human authorship, mandatory four-eyes review, committee sign-offs, and institutional reviewer identity schemas. 

This decision record establishes the corrected, narrow governance boundary for Release 1 without encroaching upon operational workflow design, without prescribing future drafting processes, and without introducing unauthorized procedural constraints.

---

## 2. Decision

### 2.1 Autonomous AI/LLM Ingestion Prohibited for Release 1
**Release 1 does not authorize an AI/LLM or automated ingestion agent to autonomously convert source-language assessment-policy material directly into executable assessment-policy rules.**

### 2.2 Zero Policy Authority for AI/LLM Systems
AI/LLM systems possess **zero policy authority**. They must not:
1. Independently declare assessment policy.
2. Establish or infer statutory authority.
3. Formally approve policy rules.
4. Attest policy authority or integrity.
5. Issue authoritative executable policy representations.

### 2.3 Preservation of the Three-Tier Provenance Model
The established Three-Tier Provenance Architecture (`UADUE-SPEC-AP-PROVENANCE-001`, Section 1) remains strictly binding:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ TIER 1: SOURCE FACT (Statutory / Institutional Ground Truth)           │
│ Primary published document, notice, syllabus, brochure, or corrigendum │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Operationalized via
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ TIER 2: AUTHORIZED POLICY INTERPRETATION (Formal Operational Mapping)  │
│ Documented translation resolving natural language into unambiguous     │
│ operational specifications by an entity authorized within scope        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Implemented as
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ TIER 3: MACHINE REPRESENTATION (Machine-Executable Rule)               │
│ Machine-evaluated AST and parameters executed by the pure engine       │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Preservation of the Zero-Orphan Rule
Every machine-executable Tier 3 rule must possess a valid, verifiable reference chain to an authorized Tier 2 interpretation, which in turn references authoritative Tier 1 source facts (`UADUE-SPEC-AP-PROVENANCE-001`, Section 3.1):

$$\forall r \in \text{Tier 3}, \quad \exists i \in \text{Tier 2}, \, \exists s \in \text{Tier 1} \quad \text{s.t.} \quad r \to i \to s$$

Executable assessment rules lacking this complete provenance chain are prohibited from entering authorized execution.

### 2.5 Strict Terminology & Workflow Boundaries
1. **No Redefinition of Tier 2:** "Authorized Policy Interpretation" is **not** redefined as "Human Policy Interpretation". Tier 2 requires valid authority and provenance; it does not mandate specific human employment classifications or organizational hierarchies.
2. **Exclusion of Prescriptive Workflow Requirements:** This decision explicitly **does not** introduce or mandate:
   - Mandatory human authorship.
   - Mandatory four-eyes review workflows.
   - Academic or administrative committee approval.
   - Institutional sign-off ceremonies.
   - Specific reviewer identity schemas.
   - Specific digital signature or cryptographic attestation mechanisms (deferred under `GOV-AP-007`).
   - A new or altered source-authority hierarchy (governed strictly by profile under `AP-DEC-005`).
3. **Future AI-Assisted Drafting Remains Undecided:** Future AI-assisted drafting remains **undecided** and is **not authorized** by AP-DEC-013. Any future consideration of AI-assisted drafting workflows requires a separate governance decision. This decision introduces zero workflow, sign-off, or validation requirements for future drafting.

---

## 3. Failure Handling & Conflict Disposition

Failure handling adheres strictly to the frozen **AP-DEC-009** Failure and Quarantine Matrix (`UADUE-SPEC-AP-CONFLICT-001`, Table 4.1 & Section 5). Zero new failure codes, dispositions, or operational behaviors are invented.

### 3.1 Frozen Source Provisions

| Condition | Applicable Frozen Failure Code | Classification | Frozen Disposition | Exact Evaluation Service Action (`UADUE-SPEC-AP-CONFLICT-001`, Table 4.1) |
|---|---|---|---|---|
| **Missing or broken provenance chain** | `PROVENANCE_FAILURE` | Audit Violation | **`QUARANTINE`** | Locks policy and attempt; alerts governance gate. |
| **Contradictory source documents** | `PROVENANCE_CONTRADICTION` | Legal Conflict | **`QUARANTINE`** | Halts scoring runs; requires academic committee review. |
| **Structural / schema defect** | `INVALID_INPUT` | Structural Defect | **`REJECT`** | Halts attempt; returns schema violation details. |
| **Unsupported policy operation** | `UNSUPPORTED_POLICY` | Engine Limitation | **`REJECT`** | Refuses evaluation; requires engine upgrade before attempting. |

### 3.2 Verified Operational Consequences
The following operational consequences are retained because they are explicitly defined in the frozen source (`UADUE-SPEC-AP-CONFLICT-001`, Section 5):
1. **Candidate-Attempt Quarantine Isolation:** An attempt encountering a quarantined policy or evaluation failure is marked `isQuarantined: true` in the policy evaluation store. No projection gateway (Phase 3.6), public API, or reporting tool may read scores from quarantined records (Section 5.1).
2. **Quarantine Audit Logging:** Every transition to quarantine writes an immutable audit record: `quarantine_id`, `attempt_id`, `failure_code`, `timestamp_utc`, `system_state_digest` (Section 5.2).
3. **De-Quarantine Protocol:** An attempt can only exit quarantine via a signed Governance Release Order issued by an authorized `POLICY_REVOKER` or `POLICY_ACTIVATOR`, accompanied by a remediated policy version or confirmed dataset, re-evaluating through the pure function $\mathcal{F}(S, P_{\text{remediated}})$ (Section 5.3).

### 3.3 Explicit Distinctions & Documented Source Gaps
1. **`AUTHORITY_CONTRADICTION` Terminology Distinction:** In `CANONICAL_ASSESSMENT_POLICY_GOVERNANCE_REGISTER.md` (item `GOV-AP-003`) and `ADR-AP-007`, contradictory source documents without explicit profile precedence are noted as failing closed to `QUARANTINE`. In the formal taxonomy enum and Table 4.1 of `UADUE-SPEC-AP-CONFLICT-001`, the active failure code is `PROVENANCE_CONTRADICTION`. `AUTHORITY_CONTRADICTION` is not an enumerated runtime failure code; contradictory authority claims are evaluated under `PROVENANCE_CONTRADICTION`.
2. **Ranking Restrictions Omitted:** Operational consequences regarding "rank calculation" are omitted from this decision record because ranking is a separate, gated domain in Release 1 (`AP-DEC-004` / `GOV-AP-002`) and is not an active evaluation consequence in Table 4.1.
3. **Quarantine Queue Specificity:** Moving attempts to a named `QUARANTINE_QUEUE` is specified in Table 4.1 specifically for `POLICY_AMBIGUOUS`. For `PROVENANCE_FAILURE`, the exact source action is "Locks policy and attempt; alerts governance gate." The broader queue mechanism for audit violations is left to general platform task dispatch.
4. **Pre-flight Ingestion Validation:** AP-DEC-009 Table 4.1 specifies actions taken by the *Evaluation Service* on evaluation attempts. Whether a rejected candidate policy package at ingestion time (prior to attempt evaluation) is handled via a dedicated pre-flight ingestion API error response or via `INVALID_INPUT` / `UNSUPPORTED_POLICY` remains an un-enumerated ingestion pipeline detail.

---

## 4. Automation Scope & Non-Interference Boundary

This decision strictly governs **the conversion of source-language assessment-policy material directly into authoritative executable assessment-policy rules**.

### 4.1 What Is Prohibited
- Autonomous conversion by AI/LLM or automated agents of source examination policies (marking schemes, normalization rules, scoring directives) directly into executable assessment-policy rules.
- Autonomous declaration or issuance of policy authority by software agents.

### 4.2 What Is NOT Prohibited
- Unrelated automated document processing and ingestion pipelines across the Mock.AI platform, including:
  - Document OCR, layout analysis, font extraction, and geometry segmentation.
  - Question, option, and diagram candidate reconstruction in the UADUE Ingestion Pipeline (Phase 2A–2C).
  - Search indexing, text discovery, catalog categorization, and non-authoritative document analytics.
- Automated extraction or processing that does not assert policy authority or generate executable assessment policy.

---

## 5. Upstream & Downstream Contract Invariants

This decision preserves all frozen contracts and boundaries:
1. **Phase 2D-5 (Item Truth):** Item-level answer keys, candidate responses, and awarded marks remain immutable and supreme.
2. **Phase 3.5 (Delivery Scoring):** Remains strictly raw score only: $\text{totalRawScore} = \sum \text{awardedMarks}, \, \text{totalNormalizedScore} = \text{null}$.
3. **Phase 3.6 (Projection Gateway):** Remains strictly a read-only projection gateway with zero scoring, calculation, or policy logic.
4. **AP-DEC-001 through AP-DEC-012:** Remain completely unchanged.
5. **Assessment-Policy Implementation Lock:** Implementation remains **strictly locked (`🔒`)**. Zero code, schemas, parsers, or migrations may be written based on this decision record until the formal implementation gate is unlocked by the Product Owner.

---

## 6. Governance Status & Next Step

- **Current Status:** 🟢 `FROZEN (Approved by Product Owner)`
- **Next Step:** Decision record frozen. Implementation remains strictly locked pending separate authorized governance tasks.
