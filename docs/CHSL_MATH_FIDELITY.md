# MOCK.AI — Mathematical Fidelity & LaTeX Reconstruction Specification
**Document ID:** `docs/CHSL_MATH_FIDELITY.md`  
**System:** MOCK.AI Universal Paper Ingestion Engine  
**Author:** Agent 4 — Math Engine & Forensics Group  
**Date:** October 2026  
**Status:** SPECIFICATION & RECONSTRUCTION PIPELINE

---

## 1. Principles of Mathematical Source Fidelity

Mathematical formulas in competitive exams (GATE, SSC, UPSC, RRB) convey critical quantitative precision. An OCR error in an exponent, radical, or fraction directly distorts the academic correctness of the test question.

### Core Mathematical Rules:
1. **Never Infer Math from Expected Solutions:**
   Extraction must reconstruct what is visually present in the source PDF, not what an AI thinks the problem "should" state.
2. **Dedicated Reconstruction Pipeline Over Single-Pass OCR:**
   Generic OCR models struggle with multi-tier vertical alignment (fractions, matrices, limits). Math reconstruction requires geometric grouping of numerators, division bars, and denominators.
3. **KaTeX Syntax Pre-Validation:**
   Every generated LaTeX string must pass syntactical validation before being written to canonical JSON. Malformed LaTeX must never reach the user interface.
4. **Scope-Aware Token Normalization:**
   Pipes (`|`), slashes (`/`), and letters (`Z`, `l`, `O`) must be normalized strictly based on structural and syntactic evidence. Global string replacements are forbidden.

---

## 2. Mathematical Component Reconstruction Pipeline

```
           [Input: Formula Crop / Mathematical Region]
                                │
                                ▼
           [1. Horizontal Projection & Division Bar Search]
           - Scans y ∈ [0.20 H, 0.80 H] for solid horizontal run
           - Validates run length ≥ 0.40 W and thickness ≤ 3px
                                │
                 ┌──────────────┴──────────────┐
                 ▼                             ▼
       [Horizontal Bar Found]        [No Horizontal Bar]
                 │                             │
                 ▼                             ▼
    [2. Vertical Slicing]           [Single-Tier Parser]
    - Numerator Crop (0 .. y_bar)   - Linear equations
    - Denominator Crop (y_bar .. H) - Radicals (√x, 2√2)
    - Whole Prefix Crop (0 .. x_bar)- Greek letters (α, β, θ)
                 │                  - Exponents (x², y³)
                 ▼                             │
    [3. Component OCR & Norm]                  │
    - Numerator: high-res lanczos              │
    - Denominator: high-res lanczos            │
    - Whole number: integer parser             │
                 │                             │
                 ▼                             ▼
    [4. Compound Assembler] ◄──────────────────┘
    - Combines whole + fraction + units:
      e.g. $42\frac{1}{2}\text{ km/h}$ or $\frac{x^2 - y^2}{2xy}$
                 │
                 ▼
    [5. KaTeX Syntactical Validation]
    - Validates syntax with throwOnError: true
                 │
                 ▼
    [Output: Canonical Math Block with Provenance]
```

---

## 3. Mathematical Patterns Supported

### 3.1 Pure and Mixed Fractions
- **Standard Fractions:** $\frac{a}{b}$ formatted as `\frac{a}{b}`.
- **Mixed Fractions with Whole Numbers:** $205\frac{1}{3}$ formatted as `$205\frac{1}{3}$`.
- **Fractions with Units:**
  - Speed: `$42\frac{1}{2}\text{ km/h}$`
  - Percentages: `$36\frac{4}{11}\%$`
  - Volumes: `$1707\frac{1}{3}\text{ cm}^3$`

### 3.2 Algebraic Expressions & Polynomials
- Detects multi-tier algebraic quotients:
  $$\frac{x^2 - y^2}{2xy} \longrightarrow \verb|\frac{x^2 - y^2}{2xy}|$$
- Normalizes misread exponents: `x2` or `x²` or `x*` $\to$ `x^2`.
- Normalizes algebraic variables with spacing around binary operators: `$x^2 + 2xy + y^2$`.

### 3.3 Radicals & Roots
- Normalizes OCR `v` or `V` before digits in mathematical expressions:
  $$v2 \longrightarrow \sqrt{2}, \quad 2v2 \longrightarrow 2\sqrt{2}$$
- Validates radical stroke connection to prevent mistaking letter `v` for root symbol `\sqrt{}`.

### 3.4 Geometry & Trigonometric Notations
- Angle symbols: $\angle ABC = 90^\circ$ formatted as `\angle ABC = 90^\circ`.
- Trigonometric functions: `\sin`, `\cos`, `\tan`, `\sec`, `\csc` or `\text{cosec}`.

---

## 4. Protected Regression Baseline (GATE Mathematical Notations)

GATE papers heavily utilize authentic vertical bars and mathematical brackets that must **never** be replaced with digit `1`:

| Mathematical Context | GATE Example | Raw Token | Correct Representation | Corrupted Anti-Pattern |
| :--- | :--- | :--- | :--- | :--- |
| Absolute Value | $\|y\| \le 1$ | `\|y\| \le 1` | `\|y\| \le 1` | `1y1 \le 1` ❌ |
| Vector Inner Product | $\|\langle x, x_k \rangle\|$ | `\|\langle x, x_k \rangle\|` | `\|\langle x, x_k \rangle\|` | `1\langle x, x_k \rangle 1` ❌ |
| Conditional Probability | $\Pr(X=1 \mid Y=1)$ | `\Pr(X=1 \| Y=1)` | `\Pr(X=1 \mid Y=1)` | `\Pr(X=1 1 Y=1)` ❌ |
| Set Cardinality | $\|S\| = 4$ | `\|S\| = 4` | `\|S\| = 4` | `1S1 = 4` ❌ |
| Determinant | $\|A\| = 0$ | `\|A\| = 0` | `\|A\| = 0` | `1A1 = 0` ❌ |

**Guarantee:** In the v3 engine, pipe replacement (`| → 1`) is strictly restricted to isolated single-character option chips (`len(text.strip()) == 1 and text.strip() == '|'`) and CBT ratio chips (`\d+ : |`). It is strictly prohibited in general mathematical equations or expressions containing brackets/variables.
