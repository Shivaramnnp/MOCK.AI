# Architectural Decision Record: ADR-AP-002
**Title:** Immutable Policy Versioning, Effective Dating, and Cryptographic Lineage DAG  
**Status:** PROPOSED (DESIGN ONLY)  
**Date:** 2026-10-08  
**Context:** Canonical Assessment-Policy Governance Gate (Step 20)

---

## Context
High-stakes statutory examinations (UPSC, GATE, SSC) frequently experience corrigenda, judicial rulings, or answer key revisions. In naive architectures, policy parameters or tables are updated in place, destroying historical audit trails and mutating previously published assessment scores.

## Decision
1. **Zero In-Place Mutation**: Policy definitions are strictly immutable. Once published, a policy record cannot be modified (`UPDATE` prohibited) or deleted (`DELETE` prohibited).
2. **Cryptographic Identity**: A policy version's canonical ID is bound to its RFC 8785 Canonical JSON SHA-256 digest. Any syntactic or semantic change creates an entirely new policy entity.
3. **Lineage DAG**: Policy revisions are modeled as an immutable Directed Acyclic Graph (DAG) with explicit `supersedesPolicyId` and `supersededByPolicyIds` pointers.
4. **Temporal Intervals**: Policies define explicit statutory validity intervals (`effectiveFrom`, `effectiveUntil`, `applicableExamCycle`).
5. **Withdrawal Semantics**: Legal revocations transition a policy to `WITHDRAWN` with signed legal citations. Evaluation against a withdrawn policy fails closed (`QUARANTINE`).

## Consequences
- **Positive**: Complete auditability; historical examination results are permanently reproducible; corrigenda create clear, versioned forks rather than silent data mutations.
- **Negative / Operational**: Policy storage accumulates over time; requires tooling to inspect and navigate the policy version DAG.
