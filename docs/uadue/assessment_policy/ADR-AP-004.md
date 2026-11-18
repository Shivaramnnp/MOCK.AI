# Architectural Decision Record: ADR-AP-004
**Title:** Modular Policy Composition: Assessment Domains vs Downstream Qualification & Ranking  
**Status:** PROPOSED (DESIGN ONLY)  
**Date:** 2026-10-08  
**Context:** Canonical Assessment-Policy Governance Gate (Remediation R1)

---

## Context
Monolithic policy models attempt to couple paper mark scaling (e.g., dropped questions) with multi-session equating, candidate category reservation cutoffs, and cohort ranking. This couples mathematical mark calculations with demographic quotas, creates brittle pipelines, and breaches domain boundaries.

## Decision
1. **Scope Assessment-Policy Layer Strictly to Pure Mark Transformations**:
   - `AggregateScoringPolicy`: Produces `scaledScore` from item awarded marks and paper rules (e.g., dropped item pro-rata rescaling).
   - `CohortNormalizationPolicy`: Produces `normalizedScore` / `equatedScore` by applying multi-session equating transformations across frozen cohort statistics.
2. **Decouple Downstream Domains**:
   - `Qualification Domain`: Category reservation cutoffs and eligibility criteria are treated as an independent downstream domain (GOV-AP-001).
   - `Ranking & Merit Domain`: Full-cohort sorting and demographic tie-breaking are treated as an independent downstream domain (GOV-AP-002).
3. **Acyclic Composition & Invariants**:
   - Execution order and stage presence are strictly policy-defined via an acyclic DAG rooted at Phase 3.5 Raw Score. Zero universal pipeline ordering is assumed.
   - Double-normalization is prevented by type guards requiring un-normalized inputs.
   - No downstream domain may mutate upstream authoritative outputs.

## Consequences
- **Positive**: Clean modularity; pure mathematical evaluation insulated from candidate demographic data; allows single-session exams to omit cohort equating naturally.
- **Negative / Operational**: Downstream qualification and ranking require separate governance specifications and data contracts.
