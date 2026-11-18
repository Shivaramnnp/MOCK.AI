# Canonical Assessment-Policy Layer — Policy Provenance Model
**Document Identifier:** `UADUE-SPEC-AP-PROVENANCE-001`  
**Security Classification:** Restricted Engineering Specification  
**Status:** Architecture Specification Only — Zero Implementation  
**Gate:** Canonical Assessment-Policy Governance Gate (Remediation R1)

---

## 1. R1-11: Conceptual Provenance Hierarchy (Fact vs Interpretation vs Machine Rule)

In high-stakes assessment, policy rules cannot simply appear as ad-hoc software logic. Every formula, cutoff, and rescaling multiplier must have an unbroken provenance chain.

The Canonical Assessment-Policy Layer adopts a **Three-Tier Provenance Separation**:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ TIER 1: SOURCE FACT (Statutory / Institutional Ground Truth)           │
│ Primary published document, notice, syllabus, brochure, or corrigendum │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼ Operationalized via
┌────────────────────────────────────────────────────────────────────────┐
│ TIER 2: POLICY INTERPRETATION (Formal Operational Translation)         │
│ Documented mapping translating human natural language into unambiguous  │
│ mathematical and operational specifications                            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼ Implemented as
┌────────────────────────────────────────────────────────────────────────┐
│ TIER 3: MACHINE REPRESENTATION (Machine-Executable Rule)               │
│ Machine-evaluated AST, rational coefficients, and statutory rounding   │
│ parameters evaluated by the pure engine                                │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Specification of Conceptual Tiers

### 2.1 Tier 1: Source Fact (`SourceFact`)
Primary authoritative material published by the client examination body:
```typescript
interface SourceFact {
  readonly sourceFactId: string;
  readonly issuingAuthority: string; // e.g. "UPSC", "GATE_ORGANIZING_INSTITUTE"
  readonly instrumentTitle: string;  // e.g. "Official Examination Brochure 2023"
  readonly referenceNumber?: string;
  readonly publicationDate?: string;
  readonly verbatimClauseText: string;
  readonly documentDigest?: string;  // SHA-256 of source asset if available
  readonly archivalUri?: string;
}
```

### 2.2 Tier 2: Policy Interpretation (`PolicyInterpreterAuthority`)
Formal operational mapping translating natural language rules into unambiguous algorithms by an authorized interpreter:
```typescript
interface PolicyInterpreterAuthority {
  readonly interpretationId: string;
  readonly interpreterIdentity: string; // Individual, committee, or automated system role
  readonly authorizationScope: string;  // e.g. "TENANT_UPSC_ALL", "MOCK_AI_INTERNAL_TESTS"
  readonly interpretationVersion: string;
  readonly sourceReferences: readonly string[]; // Pointers to Tier 1 Source Authority Records
  readonly operationalRationale: string;
  readonly ambiguityResolutions: readonly {
    readonly naturalLanguageAmbiguity: string;
    readonly resolvedOperationalBehavior: string;
  }[];
  readonly effectivePeriod: {
    readonly effectiveFrom: string;
    readonly effectiveUntil: string | null;
  };
  readonly supersedesInterpretationId: string | null;
}
```

### 2.3 Tier 3: Machine Representation (`ImplementationRule`)
Machine-executable AST or parameter set evaluated by the engine:
```typescript
interface ImplementationRule {
  readonly ruleId: string;
  readonly interpretationId: string;
  readonly targetStage: "AGGREGATE_SCORING" | "COHORT_NORMALIZATION";
  readonly expressionSpecification: unknown; // Pinned AST format (GOV-AP-005)
  readonly statutoryRoundingDirective: {
    readonly mode: string;
    readonly decimalPlaces: number;
  };
}
```

---

## 3. Separation of Architecture from Candidate Governance Controls

The core architectural requirement is the **conceptual three-tier separation**:
- Fact $\to$ Interpretation $\to$ Machine Representation.

Specific procedural controls—such as mandatory academic committee sign-offs, legal quorum reviews, Indian CCA compliance, and hardware security module (HSM) tokens—are **candidate governance controls**, not universal baseline requirements. Their adoption depends on institutional client contracts and remains subject to **GOV-AP-003** and **GOV-AP-007**.

### 3.1 Architectural Invariant: The Zero-Orphan Rule
Regardless of whether signatures are software-managed or hardware-backed, every Tier 3 machine rule must possess a valid, non-null reference chain:

$$\forall r \in \text{Tier 3}, \quad \exists i \in \text{Tier 2}, \, \exists s \in \text{Tier 1} \quad \text{s.t.} \quad r \to i \to s$$

Orphan rules without provenance are rejected during policy validation with `PROVENANCE_FAILURE`.
