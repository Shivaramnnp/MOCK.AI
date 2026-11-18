# Architectural Decision Record: ADR-AP-001
**Title:** Canonical Assessment-Policy Layer Authority & Non-Inversion of Phase 2D-5 Item Authority  
**Status:** PROPOSED (DESIGN ONLY)  
**Date:** 2026-10-08  
**Context:** Canonical Assessment-Policy Governance Gate (Remediation R1)

---

## Context
During the Phase 3.5 scoring remediation audit, an architectural vulnerability was identified: Phase 3.5 attempted to compute a paper-level normalized score using an ad-hoc pro-rata rescaling formula (`totalRawScore * totalOriginalMarks / totalValidMarks`), even though Phase 2D-5 only emits item-level awarded marks and disposition (`EXCLUDE_AND_RESCALE`). To restore architectural integrity, Phase 3.5 was formally frozen to compute raw score only:
$$\text{totalRawScore} = \sum \text{awardedMarks}, \quad \text{totalNormalizedScore} = \text{null}$$
The system now requires a dedicated architectural authority for paper-level scoring, rescaling, and cohort equating.

## Decision
1. **Establish the Canonical Assessment-Policy Layer** as the sole authoritative owner of paper-level scoring, dropped-item rescaling, and multi-session cohort equating policies.
2. **Explicit Boundary Isolation**: Candidate Qualification (GOV-AP-001), Ranking/Merit (GOV-AP-002), and Result Classification (GOV-AP-010) are explicitly excluded from the Assessment-Policy Layer pending separate governance decisions.
3. **Strict Non-Inversion Invariant**: The Assessment-Policy Layer must NEVER modify, recalculate, or reinterpret Phase 2D-5 item-level evaluation results (`awardedMarks`, evaluation status, correctness flags). Phase 2D-5 remains the supreme and immutable authority on item truth.
4. **Phase 3.5 Boundary**: Phase 3.5 remains strictly a delivery and raw-score aggregation layer. No normalization or rescaling policy shall ever be reintroduced into Phase 3.5.
5. **Phase 3.6 Boundary**: Phase 3.6 remains strictly a read-only Result Projection Gateway, consuming evaluated policy results without computing scores, ranks, or tie-breakers.

## Consequences
- **Positive**: Clean separation of concerns; item evaluation truth is insulated from shifting exam-level rescaling or equating policies; Phase 2D-5 tests remain 100% frozen and certified; avoids premature expansion of Phase 3.6.
- **Negative / Operational**: Requires explicit pipeline stages between delivery ingestion, assessment transformation, qualification, and candidate scorecard projection; requires formal cross-domain data contracts.
- **Compliance**: Preserves frozen status of Phase 2A–2D8 and Phase 3.1–3.5.
