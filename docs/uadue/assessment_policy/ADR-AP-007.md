# Architectural Decision Record: ADR-AP-007
**Title:** Fail-Closed Conflict Model & Quarantine Semantics (REJECT vs QUARANTINE vs DEFER)  
**Status:** PROPOSED (DESIGN ONLY)  
**Date:** 2026-10-08  
**Context:** Canonical Assessment-Policy Governance Gate (Step 20)

---

## Context
When an examination engine encounters ambiguous inputs, conflicting policies, or missing statistical parameters, naive implementations often resort to heuristic defaults (e.g., picking the newest policy, defaulting missing parameters to zero, or applying an unverified pro-rata formula). In statutory assessment, this behavior is unacceptable and leads to invalid merit lists.

## Decision
1. **Mandate Fail-Closed Resolution**: The system must NEVER silently guess, fall back, or default a policy rule.
2. **Explicit Action Taxonomy**:
   - **`REJECT`**: Hard failure for structurally invalid, expired, or mathematically impossible requests (e.g., `POLICY_NOT_FOUND`, `INVALID_NUMERICAL_INPUT`, `POLICY_EXPIRED`).
   - **`QUARANTINE`**: Halts evaluation and isolates the attempt when integrity, tampering, dual policy ambiguity, authority contradiction without explicit profile precedence, or legal revocation is encountered (e.g., `POLICY_AMBIGUOUS`, `POLICY_WITHDRAWN`, `INTEGRITY_FAILURE`, `PROVENANCE_CONTRADICTION`, `AUTHORITY_CONTRADICTION`).
   - **`DEFER`**: Pauses evaluation cleanly when an external prerequisite is legitimately pending (e.g., `INSUFFICIENT_COHORT_DATA` while waiting for remaining shifts).
3. **Quarantine Isolation**: Quarantined attempts are blocked from score publication, rank calculation, and Phase 3.6 scorecard projection until cleared by a signed administrative governance release order.

## Consequences
- **Positive**: Complete prevention of unauthorized scores; fail-safe containment of disputes; full legal defensibility.
- **Negative / Operational**: Requires administrative triage queues and operational procedures for releasing quarantined attempts.
