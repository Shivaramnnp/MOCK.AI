# Architectural Decision Record: ADR-AP-006
**Title:** Numerical Semantics: Exact Rational Requirement & Candidate BigInt Representation  
**Status:** PROPOSED (DESIGN ONLY)  
**Date:** 2026-10-08  
**Context:** Canonical Assessment-Policy Governance Gate (Remediation R1)

---

## Context
IEEE 754 double-precision floating-point numbers (`number` in JavaScript/TypeScript) suffer from binary representation errors (e.g., $0.1 + 0.2 \ne 0.3$, $2/3 \approx 0.6666666666666666$). In competitive exams where selection vs rejection is decided by $0.0001$ marks, floating-point roundoff drift and platform differences lead to incorrect score evaluations and legal disputes.

## Decision
1. **Binding Architectural Mathematical Requirement**:
   - IEEE 754 floating-point arithmetic is strictly prohibited in intermediate policy calculations.
   - Exact mathematical rational semantics must be maintained throughout intermediate stages where policy requires fractional or pro-rata mark calculations.
   - Statutory rounding must occur strictly at designated statutory reporting boundaries under explicit rounding modes (`ROUND_HALF_UP`, `ROUND_HALF_EVEN`, `TRUNCATE`, `CEIL`, `FLOOR`).
2. **Candidate Implementation Choice (Non-Binding)**:
   - Reduced BigInt Rational arithmetic ($\mathbb{Q} = n/d$ with $\gcd(n,d)=1$) is the leading candidate implementation choice.
   - Full adoption is pending governance resolution of technical bounds (GOV-AP-006: bit-length caps, reduction limits, and resource guards).

## Consequences
- **Positive**: Absolute mathematical precision; eliminates roundoff drift; provides a technology-neutral mathematical foundation.
- **Negative / Operational**: Requires formalization of rational serialization and bit-length bounds prior to implementation.
