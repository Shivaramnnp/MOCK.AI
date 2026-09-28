# GATE 2025 Mathematical Rendering Audit

## 1. Executive Summary

This forensic math-rendering audit examines the representation, extraction, and rendering of mathematical, scientific, and engineering notation across all **38 GATE 2025 papers** (**2,672 questions**).

The audit identified two systemic failure modes:
1. **Raw LaTeX Leaks:** Mathematical expressions containing notation such as `\sqrt`, `\lim`, `\infty`, `\mathbb{R}`, `\begin{cases}`, `\frac`, `x^T`, `x_n`, `w_{new}`, `b_{old}` were leaking into the student UI as raw LaTeX strings rather than formatted mathematical typography.
2. **False Relational Algebra Classification:** Ingestion logic was classifying any formula containing Greek symbols $\sigma$, $\pi$, or $\rho$ as `relational_algebra`, causing probability, statistics, calculus, and mechanics questions (such as DA Q36 variance $\sigma^2$) to be rendered inside a "Relational Algebra Expression" UI container.

---

## 2. Ingestion Pipeline Analysis & Root Cause

### 2.1 Symbol Replacement Without Delimiters
In `scripts/gate_forensic_pipeline.py`, the helper function `sanitize_math_text(text)` converted Unicode characters to LaTeX commands:
* `√` → ` \sqrt `
* `∞` → ` \infty `
* `∫` → ` \int `
* `∈` → ` \in `
* `≤` → ` \le `
* `≥` → ` \ge `

However, the resulting text was placed into `type: "text"` content blocks without enclosing KaTeX delimiters (`$...$` or `\(...\)`). 

### 2.2 Client-Side Renderer Limitations
In `web/src/components/LatexRenderer.tsx`, the renderer only evaluated math when explicitly enclosed in delimiters (`$$...$$`, `\[...\]`, `\(...\)`, `$..$`).
The fallback regular expression `nakedLatexRegex` was narrowly scoped to:
`(\\(?:frac|sqrt|cbrt)\s*\{[^}]+\}\s*(?:\{[^}]+\})?|\\(?:times|div|pm|...)(?![a-zA-Z]))`

This failed to match:
* `\sqrt -1` (unbraced square root argument)
* `\lim_{x \to \infty}`
* `\infty`
* `\mathbb{R}^{n \times n}`
* `\begin{cases} ... \end{cases}`
* Superscripts/subscripts like `x^T`, `x_n`, `w_{new}`, `b_{old}`
* Vector notation, norms, and piecewise definitions

As a result, all surrounding text was escaped via `escapeHtml()` and displayed as literal raw LaTeX strings in the student test player.

### 2.3 Semantic Misclassification of Relational Algebra
In `scripts/gate_forensic_pipeline.py`:
```python
is_ra = any(sym in part for sym in [r'\bowtie', r'\pi', r'\sigma', r'\rho', '▷◁'])
btype = 'relational_algebra' if is_ra else 'math'
```
This naive substring search matched:
* $\sigma$: Standard deviation / variance ($\sigma^2$), normal distribution $N(\mu, \sigma^2)$, tensile/compressive stress, Stefan-Boltzmann constant, electrical conductivity.
* $\pi$: The circle constant $\pi \approx 3.14159$, prime-counting function, stationary probability vector $\pi$.
* $\rho$: Density, correlation coefficient, electrical resistivity.

Consequently, questions like **GATE 2025 DA Q36** (a pure statistics question regarding the variance of a random variable $Y = aX + b$ with variance $\sigma^2$) were mislabeled as `relational_algebra` and decorated with a prominent "RELATIONAL ALGEBRA EXPRESSION" badge.

---

## 3. Mathematical Vocabulary Requirements for GATE

The Mock.AI mathematical rendering pipeline must support the full breadth of GATE scientific notation:

| Domain | Mathematical Constructs | Example LaTeX |
|---|---|---|
| **Calculus & Analysis** | Limits, improper integrals, partial derivatives, gradients | `\lim_{x \to \infty} (x - \sqrt{x^2+x})`, `\int_1^x t \ln t \, dt`, `\frac{\partial^2 u}{\partial x^2}` |
| **Linear Algebra** | Matrices, determinants, transpose, Euclidean spaces | `A \in \mathbb{R}^{n \times n}`, `x^T A x`, `\begin{pmatrix} a & b \\ c & d \end{pmatrix}`, `\det(A - \lambda I) = 0` |
| **Probability & Stats** | Random variables, distributions, expectation, variance | `X \sim N(\mu, \sigma^2)`, `E[X] = \mu`, `\text{Var}(Y) = \sigma^2`, `P(A \mid B)` |
| **Discrete Math** | Set theory, logic, relations, relations algebra | `S \subseteq \mathbb{Z}^+`, `\forall x \, \exists y`, `\pi_{\text{name}}(\sigma_{\text{age} > 20}(\text{Student})) \bowtie \text{Enroll}` |
| **Piecewise Functions** | Cases, systems of equations | `f(x) = \begin{cases} \lambda e^{-\lambda x} & x \ge 0 \\ 0 & x < 0 \end{cases}` |
| **Sub/Superscripts** | Multi-character indices, iterations | `w_{\text{new}} = w_{\text{old}} - \eta \nabla L`, `x^{(k+1)}`, `\beta_1, \dots, \beta_p` |

---

## 4. Architectural Resolution Strategy

1. **Ingestion Layer (`gate_forensic_pipeline.py`):**
   * Redefine relational algebra detection: Require genuine database relational operators (`\bowtie`, `⋈`, `▷◁`) or qualified projections/selections with named database relations (`\pi_{\dots}(\text{Table})`).
   * Wrap extracted mathematical formulas and sanitized math tokens in explicit KaTeX delimiters (`\( ... \)` or `$$ ... $$`) or structured `type: "math"` content blocks.
   * Properly format DA Q36 and all related questions as `type: "math"`.

2. **Frontend Rendering Layer (`LatexRenderer.tsx` & `StructuredContentRenderer.tsx`):**
   * Upgrade `LatexRenderer.tsx` with a multi-pass parser:
     * Pass 1: Block equations (`$$...$$`, `\[...\]`).
     * Pass 2: LaTeX environments (`\begin{cases}...\end{cases}`, `\begin{matrix}...\end{matrix}`, `\begin{aligned}...\end{aligned}`).
     * Pass 3: Explicit inline math (`\(...\)`, `$...$`).
     * Pass 4: Comprehensive naked LaTeX expressions: `\sqrt{...}`, `\sqrt\s*-?\w+`, `\frac{...}{...}`, `\lim_{...}`, `\sum_{...}`, `\int_{...}`, `\mathbb{R}^{...}`, Greek letters, subscripts/superscripts (`[a-zA-Z]_[a-zA-Z0-9]+`, `[a-zA-Z]\^[a-zA-Z0-9]+`), and scientific operators.
   * In `StructuredContentRenderer.tsx`, reserve `RelationalAlgebraRenderer` strictly for validated database queries; render general equations and formulas in clean, display-mode `MathRenderer`.
