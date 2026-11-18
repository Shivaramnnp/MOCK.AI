# Architectural Decision Record: ADR-AP-003
**Title:** Three-Tier Policy Provenance Architecture (Source Fact → Interpretation → Implementation Rule)  
**Status:** PROPOSED (DESIGN ONLY)  
**Date:** 2026-10-08  
**Context:** Canonical Assessment-Policy Governance Gate (Step 20)

---

## Context
Scoring formulas in competitive exams are grounded in statutory instruments (gazette notifications, court decrees, official brochures). Allowing developers or operators to configure formulas without statutory proof leads to legal liability, unexplained score calculations, and failure under RTI (Right to Information) audits.

## Decision
1. **Enforce Three-Tier Provenance**:
   - **Tier 1 (Source Fact)**: Primary statutory text, gazette notice, or court order with cryptographic hash and URI.
   - **Tier 2 (Policy Interpretation)**: Formal operationalization resolving human language into unambiguous operational rules by an authorized policy interpreter.
   - **Tier 3 (Implementation Rule)**: Pure machine-executable AST, rational coefficients, and rounding directives.
2. **Zero-Orphan Invariant**: Every Tier 3 rule must link back through Tier 2 to Tier 1. Orphan rules without complete legal lineage are rejected during validation (`PROVENANCE_FAILURE`).
3. **Merkle Provenance Tree**: Provenance records are bundled into a Merkle tree whose root is embedded into the policy's cryptographic seal.

## Consequences
- **Positive**: 100% explainability in administrative tribunals or courts of law; complete RTI compliance; eliminates arbitrary code-level policy hacks.
- **Negative / Operational**: Significant initial documentation overhead when onboarding new examination policies; requires sign-off from legal/academic stakeholders.
