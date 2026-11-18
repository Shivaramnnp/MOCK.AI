# Architectural Decision Record: ADR-AP-009
**Title:** Multi-Tenancy Isolation, Precedence Hierarchy, and Architectural Row-Level Security  
**Status:** PROPOSED (DESIGN ONLY)  
**Date:** 2026-10-08  
**Context:** Canonical Assessment-Policy Governance Gate (Step 20)

---

## Context
UADUE is designed to serve multiple institutional tenants (e.g., UPSC, GATE, SSC, State PSCs) concurrently. If policies, normalization models, or category cutoffs leak between tenants or collide during evaluation, examination integrity is catastrophically compromised.

## Decision
1. **Hierarchical Policy Precedence**:
   $$\text{Global Defaults} \prec \text{Statutory Tenant} \prec \text{Exam Cycle} \prec \text{Specific Paper}$$
   Evaluation queries resolve the most specific matching policy.
2. **Absolute Tenant Isolation**:
   - A candidate attempt belonging to `tenant_A` can never evaluate against or query a policy belonging to `tenant_B`.
   - Cross-tenant policy resolution attempts immediately trigger `TENANT_ISOLATION_VIOLATION` and quarantine the attempt.
3. **Architectural Row-Level Security (RLS)**:
   - All policy definition, execution, and result tables incorporate `tenant_id` as the leading column in compound primary keys.
   - Database operations enforce RLS through session-scoped tenant claims (`app.current_tenant_id`).
   *(Note: This ADR provides architectural design only; no database migrations or DDL are authorized during this specification gate.)*

## Consequences
- **Positive**: Complete multi-tenant security; prevents cross-contamination of exam scoring rules; supports white-label examination authorities.
- **Negative / Operational**: Tenant ID must be strictly propagated through all evaluation contexts and API payloads.
