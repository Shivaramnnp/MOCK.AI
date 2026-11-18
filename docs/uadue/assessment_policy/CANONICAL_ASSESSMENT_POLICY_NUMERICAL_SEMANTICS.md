# Canonical Assessment-Policy Layer — Numerical Semantics & Mathematical Model
**Document ID:** `UADUE-SPEC-CAP-003`  
**Governance State:** Architecture Specification Only — Zero Implementation  
**Gate:** Canonical Assessment-Policy Governance Gate (Remediation R1)  
**Implementation Authorization:** 🔒 **STRICTLY LOCKED / ZERO IMPLEMENTATION**  
**Date:** 2026-10-08

---

## 1. R1-09: Separation of Requirement from Implementation Candidate

In competitive examinations where 0.0001 marks determine candidate rank, qualification, and public service allocation, binary floating-point roundoff drift ($0.1 + 0.2 \ne 0.3$) is unacceptable. 

To maintain architectural rigor, the governance framework separates the **Mathematical Requirement** from the **Candidate Implementation Choice**:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ ARCHITECTURAL MATHEMATICAL REQUIREMENT (BINDING)                       │
│ • Exact mathematical rational semantics where policy requires it.      │
│ • Zero intermediate precision loss or IEEE 754 binary drift.           │
│ • Explicit statutory rounding executed ONLY at designated boundaries.  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼ Realized via (Evaluation Pending)
┌────────────────────────────────────────────────────────────────────────┐
│ CANDIDATE IMPLEMENTATION CHOICE: BigInt Rational (NON-BINDING)         │
│ • Reduced fraction Q = n/d using arbitrary-precision BigInt.           │
│ • Subject to unresolved governance questions (GOV-AP-006).             │
│ • Alternative candidates: 128-bit fixed decimal, DecNumber, GMP.       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Mathematical Requirement Specification

1. **Exact Rational Semantics**:
   When an assessment policy specifies fractional marks (e.g. $+2$, $-2/3$, $+1/3$) or pro-rata rescaling ($M_{\text{raw}} \times \frac{M_{\text{orig}}}{M_{\text{valid}}}$), the mathematical evaluation must preserve exact rational equivalence throughout all intermediate steps:
   $$\mathbb{Q} = \frac{n}{d}, \quad n \in \mathbb{Z}, \, d \in \mathbb{Z}^+, \, \gcd(|n|, d) = 1$$
2. **Statutory Rounding Boundary**:
   Conversion to finite decimal representations occurs strictly at the designated statutory reporting boundary, governed by an explicit rounding mode.
3. **Statutory Rounding Modes**:
   - `ROUND_HALF_UP`: Standard arithmetic rounding away from zero on $\ge 0.5$.
   - `ROUND_HALF_EVEN`: Banker's rounding to nearest even neighbor on ties.
   - `TRUNCATE`: Direct truncation of fractional digits beyond target scale.
   - `CEIL`: Rounding towards $+\infty$.
   - `FLOOR`: Rounding towards $-\infty$.

---

## 3. Candidate Implementation: Reduced BigInt Rational Model

As a candidate implementation mechanism, the BigInt Rational model represents numbers as:
$$\text{Rational} = \langle n: \text{BigInt}, d: \text{BigInt} \rangle$$
- Addition: $\frac{n_1}{d_1} + \frac{n_2}{d_2} = \frac{n_1 d_2 + n_2 d_1}{d_1 d_2}$
- Multiplication: $\frac{n_1}{d_1} \times \frac{n_2}{d_2} = \frac{n_1 n_2}{d_1 d_2}$
- Equality: $\frac{n_1}{d_1} = \frac{n_2}{d_2} \iff n_1 d_2 = n_2 d_1$

---

## 4. Unresolved Technical & Governance Questions (GOV-AP-006)

Before the candidate BigInt Rational model can be approved for implementation, the following questions must be resolved:

| Technical Parameter | Unresolved Architectural Question | Candidate Proposal | Governance Impact |
|---|---|---|---|
| **Numerator / Denominator Bounds** | What is the maximum allowable bit-length for $n$ and $d$? | Cap at $|n|, |d| \le 2^{256}$ (256-bit integer). | Prevents memory exhaustion attacks under crafted fractional expansions. |
| **Reduction Limits** | Should $\gcd(n,d)$ reduction occur after every operation, or lazily? | Eager reduction after every addition and multiplication. | Guarantees bounded size at slight CPU cost for Euclidean algorithm. |
| **Resource Limits** | What execution time/memory limits apply to rational evaluation? | Hermetic sandbox limit of 50ms per candidate attempt. | Eliminates algorithmic Denial of Service (DoS). |
| **Canonical Serialization** | How are rationals serialized in RFC 8785 Canonical JSON? | Two-element string tuple: `["numerator", "denominator"]`. | Avoids JavaScript parser converting strings to floats. |
| **Decimal Conversion** | What is the exact integer division algorithm for statutory scaling? | BigInt scaled integer division with explicit remainder check. | Ensures identical rounding across all JavaScript runtimes and CPU architectures. |
| **Rounding Boundary Ties** | How are exact half-way ties handled during negative mark truncation? | Explicit statutory profile parameter specifying tie behavior. | Eliminates subtle $0.0000000001$ boundary disputes. |
| **Overflow Handling** | What action is taken if an intermediate rational exceeds bit-bounds? | Fail closed: immediately raise `NUMERICAL_OVERFLOW` and quarantine. | Never silent clamp or fall back to floating-point. |

*Zero code implementation may occur until GOV-AP-006 is formally resolved.*
