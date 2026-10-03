# MOCK.AI — Regression Baseline & GATE Protection Report
**Document ID:** `docs/CHSL_REGRESSION_REPORT.md`  
**System:** MOCK.AI Universal Paper Ingestion Engine  
**Author:** Agent 11 — Regression Guardian & Test Group  
**Date:** October 2026  
**Status:** REGRESSION BASELINE LOCKED

---

## 1. Regression Policy: Zero Regressions Allowed

The prompt establishes an absolute requirement:
> **DO NOT REGRESS THE CURRENTLY GOOD GATE 2025 PIPELINE. GATE 2025 IS A PROTECTED REGRESSION BASELINE. IF GATE 2025 REGRESSES: STOP. DO NOT CONTINUE SSC MASS REPROCESSING. FIX THE SHARED ALGORITHM FIRST.**

---

## 2. Protected GATE 2025 Baseline

The GATE corpus comprises 76 papers (5,344 questions). All 76 papers are verified and certified against official IIT Roorkee master answer keys.

### 2.1 Critical Test Fixtures & Regressions Protected
| Paper / Question | Critical Architectural Feature | Protected Assertion |
| :--- | :--- | :--- |
| **GATE 2025 DA Q3** | Matrix Deduplication & Prompt Retention | Single diagram block, zero duplicate prompt sentences, 4 valid numeric options |
| **GATE 2025 DA Q4** | Figure Ownership Model | Internal figure text labels (`4 Q 1 P`) must never leak into `questionText` |
| **GATE 2025 DA Q6** | Structured Table vs Garbled Text | Reconstructed as structured Markdown/JSON table with Column-I and Column-II |
| **GATE 2025 DA Q10** | Visual Chart Classification | Bar chart classified strictly as a diagram, never misclassified as a table |
| **GATE 2025 DA Q16** | Code Block Formatting | Formatted as monospace pseudocode with language tag `pseudocode` |
| **GATE 2025 DA Q28** | Absolute Values & Pipe Notation | $\|y\| \le 1$ must never have pipes converted to digit `'1'` |
| **GATE 2025 DA Q32** | NAT (Numerical Answer Type) | Answer range $[0.24, 0.26]$ with virtual keypad support, zero options array |
| **GATE 2025 DA Q41** | MSQ (Multiple Select Question) | Multiple correct keys `['A', 'C']` preserved without collapsing to single MCQ |

---

## 3. SSC CHSL Regression Suite

The SSC CHSL regression suite is codified in `web/src/screens/SscChslVisualAndMathFidelity.test.tsx` and `StructuredContentRenderer.test.tsx`:

1. **Fraction & Math Promotion:**
   - Q66: Sphere volume mixed fractions `$205\frac{1}{3}$` promoted to LaTeX.
   - Q67: Cube volume units `625 cm³` without division-by-zero artifacts.
   - Q68: Speed mixed fractions `$7\frac{16}{26}$`.
2. **Character Substitution Heals:**
   - Q64: Trigonometry Option B is `'1'`, never pipe `'|'`; stem has `∠B = 90°` and `cosecA = 2\sqrt{2}`.
   - Q47: Dice numbers `['5', '3', '7', '8']` without `'Z'`.
3. **Prompt-Figure Separation:**
   - Q30: Cube net separates prompt question from figure.
   - Q34: Mirror image prompt separated from `RTYZXC57` figure.

---

## 4. Automated Regression Verification Protocol

Before any changes are committed or papers reprocessed:
1. **Full Vitest Test Suite:** `npm test -- --run` in `web/` must pass 100% (all 61 test files, 733 tests).
2. **TypeScript Compilation:** `npx tsc --noEmit` must return code 0 with 0 errors.
3. **Automated KaTeX Verification:** `node scripts/test_math_rendering_all_papers.js` must verify that 100% of mathematical blocks parse without fatal KaTeX errors.
