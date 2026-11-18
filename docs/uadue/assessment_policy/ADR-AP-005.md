# Architectural Decision Record: ADR-AP-005
**Title:** Deterministic Policy Evaluation Contract and Pure Function Guarantees  
**Status:** PROPOSED (DESIGN ONLY)  
**Date:** 2026-10-08  
**Context:** Canonical Assessment-Policy Governance Gate (Step 20)

---

## Context
Non-deterministic factors such as system wall-clock queries, pseudo-random generators, dynamic runtime database queries, unordered map iteration, or locale-dependent string comparison cause identical exam submissions to yield varying scores or different tie-breaker outcomes when re-evaluated across different nodes or times.

## Decision
1. **Mathematical Pure Function Contract**: Policy evaluation is defined strictly as:
   $$\text{Output} = \mathcal{F}(S, P)$$
   where $S$ is the immutable input state tuple and $P$ is the pinned immutable policy version.
2. **Strict Environmental Prohibitions**:
   - Zero wall-clock access (`Date.now()` banned; timestamps must be passed as data).
   - Zero random number generation (`Math.random()` banned).
   - Zero random UUIDs (deterministic RFC 4122 v5 UUIDs only).
   - Zero unpinned database lookups (policy version must be explicitly provided in $P$).
   - Zero network I/O during execution.
3. **Canonical Ordering**: All collections (questions, items, sections, categories) must be canonically sorted by primary key or RFC 8785 key order before evaluation.

## Consequences
- **Positive**: 100% bitwise reproducibility; parallel evaluation on heterogeneous infrastructure yields zero divergence; enables cryptographic proof of result validity.
- **Negative / Operational**: Evaluator sandbox must be linted and restricted to prevent accidental non-deterministic API calls.
