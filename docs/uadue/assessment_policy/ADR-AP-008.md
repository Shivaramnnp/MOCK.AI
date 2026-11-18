# Architectural Decision Record: ADR-AP-008
**Title:** Historical Assessment Replay Requirement & Pinned Execution Specification  
**Status:** PROPOSED (DESIGN ONLY)  
**Date:** 2026-10-08  
**Context:** Canonical Assessment-Policy Governance Gate (Remediation R1)

---

## Context
Candidates and statutory tribunals frequently demand audits of examination results months or years after an examination cycle. If policy rules, software dependencies, or system environments have changed in the interim, historical scores cannot be verified, exposing the examination body to allegations of arbitrariness.

## Decision
1. **Architectural Replay Requirement**: Historical assessment replay MUST be deterministic when executed against a fully pinned execution specification.
2. **The 11-Element Pinned Execution Specification ($\mathcal{E}_{\text{pin}}$)**: Replay is defined strictly over:
   $$\mathcal{E}_{\text{pin}} = \langle \mathcal{S}_{\text{src}}, \mathcal{C}_{\text{can}}, \mathcal{V}_{2\text{D}5}, \mathcal{V}_{3.5}, \mathcal{P}_{\text{id}}, \mathcal{P}_{\text{ver}}, \mathcal{A}_{\text{ast}}, \mathcal{N}_{\text{num}}, \mathcal{J}_{\text{ser}}, \mathcal{K}_{\text{sch}}, \mathcal{R}_{\text{env}} \rangle$$
   spanning source assets, canonical IR, algorithm versions, policy ID/version/AST, numerical semantics, serialization format, contract schemas, and runtime constraints.
3. **Temporal Immutability**: Historical evaluations execute against historical pinned policy versions; future policy amendments or revocations have zero retroactive effect on historical executions.
4. **Separation from Operational Guarantees**: A future 10-year operational guarantee requires a separate archival and virtualization strategy (GOV-AP-008) before it can be certified.

## Consequences
- **Positive**: Rigorous, technology-neutral replay contract; prevents overpromising operational capabilities before archival strategies exist.
- **Negative / Operational**: Requires permanent archival storage for policy ASTs and frozen cohort datasets.
