# MOCK.AI — Content Classification Specification
**Document ID:** `docs/CHSL_CONTENT_CLASSIFICATION.md`  
**System:** MOCK.AI Universal Paper Ingestion Engine  
**Author:** Agent 5 — Content Classifier & Forensics Group  
**Date:** October 2026  
**Status:** SPECIFICATION & CLASSIFIER RULES

---

## 1. Objective & Scope

This specification establishes the deterministic, multi-signal classification system that categorizes extracted content regions into precise semantic representations.

The fundamental rule is:
> **The system must never choose between text and image based on "what is easier to extract." It must choose based on what the source content actually means.**

---

## 2. Semantic Classification Taxonomy

Every extracted region (whether a PyMuPDF text block, vector drawing, or image XObject) is classified into one of the following concrete categories:

| Semantic Category | Description | Primary Representation | Render Component |
| :--- | :--- | :--- | :--- |
| `TEXT_ONLY` | Pure prose, sentences, paragraphs, instructions | Native UTF-8 string | `TextRenderer` |
| `MATH_ONLY` | Equations, formulas, stacked fractions, matrices, symbols | KaTeX LaTeX string | `MathRenderer` |
| `TEXT_PLUS_MATH` | Mixed sentences containing embedded mathematical tokens | Array of text & inline math blocks | `MixedContentRenderer` |
| `GENUINE_VISUAL` | Authentic reasoning diagrams, geometric figures, mirror images, dice | Canonical raster/vector asset | `ExamAsset` (`variant='diagram'`) |
| `TABLE` | Grid data, column/row structured numeric or text cells | Structured JSON rows/headers | `TableRenderer` |
| `GRAPH` | Coordinate axes, functions, plots, statistical curves | High-res image asset with alt text | `ExamAsset` |
| `CHART` | Pie charts, bar graphs, histograms, flowcharts | High-res image asset with alt text | `ExamAsset` |
| `CODE` | Computer code, syntax-highlighted snippets, SQL queries | Monospace string with language tag | `CodeRenderer` |
| `DECORATIVE` | Separator rules, bullet icons, UI frame borders | Suppressed from content blocks | None (Ignored) |
| `WATERMARK` | Publisher stamps, logos, promotional banners, page footers | Filtered and suppressed | None (Ignored) |
| `DUPLICATE` | Identical image asset already registered on this or prior page | Reference canonical `assetId` | Canonical `ExamAsset` |
| `UNKNOWN` | Ambiguous region failing multi-signal confidence threshold | Preserved as raw image + `REVIEW_REQUIRED` | `ExamAsset` with review flag |

---

## 3. Multi-Signal Decision Matrix

A region is never classified based on a single heuristic (e.g. aspect ratio alone). Instead, classification relies on seven independent orthogonal signals:

```
[Signal 1: PDF Vector Text Overlap] ──┐
[Signal 2: OCR Character Density]  ──┼──► [Evidence Evaluator] ──► [Multi-Signal Classifier]
[Signal 3: Geometric Aspect Ratio]  ──┤          ▲                          │
[Signal 4: Stroke & Contour Hist]   ──┤          │                          ▼
[Signal 5: Projection Profiles]     ──┤    [Confidence Score]       Semantic Category:
[Signal 6: Keyword Semantic Context]──┤                              TEXT_ONLY | MATH_ONLY |
[Signal 7: Structural Position]     ──┘                              GENUINE_VISUAL | TABLE ...
```

### Signal 1: PDF Vector Text Overlap
- **Query:** Does the PDF text layer already contain encoded glyphs within the bounding box of the image?
- **Logic:** If vector text accounts for $> 80\%$ of the visual content, the underlying raster image is often a duplicate rendered background or watermark.

### Signal 2: OCR Character Density & Confidence
- **Metric:** Character density $\rho_{char} = \frac{N_{chars}}{Width \times Height}$.
- **Readability:** Ratio of recognized dictionary words vs noise tokens. High density with high dictionary confidence indicates textual content.

### Signal 3: Geometric Dimensions & Aspect Ratio
- **Metrics:** Width ($W$), Height ($H$), Aspect Ratio ($AR = W/H$).
- **Rule:** High aspect ratio ($AR \ge 3.5$) is a *necessary* signal for a text strip, but **never** a *sufficient* signal (graphs, timelines, and number lines also have wide aspect ratios).

### Signal 4: Stroke & Contour Variance (Connected Components)
- **Metric:** Distribution of connected component areas and aspect ratios.
- **Textual Signature:** Regular, uniformly spaced components with consistent height (x-height) and aspect ratios.
- **Visual Signature:** Continuous contours, loops, polygons, shaded regions, or circular elements (dice pips, geometric lines).

### Signal 5: Horizontal & Vertical Projection Profiles
- **Metric:** Histogram of dark pixels along horizontal rows and vertical columns.
- **Fraction Profile:** Distinct horizontal peak indicating the division bar, separated by gaps above and below.
- **Table Profile:** Periodic grid peaks in both horizontal and vertical projections.

### Signal 6: Keyword Semantic Context
- **Stem Search:** Checks stem text for visual reasoning indicators (`'mirror image'`, `'folded paper'`, `'cube'`, `'dice'`, `'pattern series'`, `'embedded figure'`).
- **Safety Rule:** Keyword presence vetoes text demotion. Even if OCR can read labels inside a mirror image (e.g. `RTYZXC57`), the asset remains classified as `GENUINE_VISUAL`.

### Signal 7: Structural Position (Selection Column vs Content Column)
- **Selection Column ($x < col\_bound$):** Reserved exclusively for CBT radio buttons, green ticks, and selection icons.
- **Content Column ($x \ge col\_bound$):** Reserved for stems, diagrams, and option choices.

---

## 4. Rigorous Image-to-Text Demotion Protocol

When considering whether an image should be demoted to native text or KaTeX:

```
[Candidate Image Asset]
          │
          ▼
Is there any visual keyword present in stem/question?
          ├── YES ──► PRESERVE AS GENUINE_VISUAL (Do NOT demote)
          └── NO
               │
               ▼
Does the image have uniform stroke variance and text-like projection?
          ├── NO  ──► PRESERVE AS GENUINE_VISUAL
          └── YES
               │
               ▼
Can the text/math be reconstructed with confidence ≥ 0.95?
          ├── NO  ──► PRESERVE AS SOURCE IMAGE + Mark REVIEW_REQUIRED
          └── YES
               │
               ▼
Does reconstructed LaTeX parse cleanly in KaTeX?
          ├── NO  ──► PRESERVE AS SOURCE IMAGE + Mark REVIEW_REQUIRED
          └── YES
               │
               ▼
DEMOTE TO TEXT / MATH BLOCK (Store raw crop in provenance metadata)
```

---

## 5. Option Choices Classification Policy

Option choices must never be forced into a rigid all-or-nothing binary:

1. **`IMAGE_ONLY`:** Authentic visual reasoning figures (e.g. 4 rotated shapes, 4 mirror images, 4 unfolded cubes).
   - Authoritative display is the source image.
   - OCR text is retained exclusively in accessibility `altText` / `ocrText` metadata.
2. **`TEXT_ONLY`:** Prose options, numbers, names, vocabulary.
   - Rendered sharply as native text.
3. **`MATH_ONLY`:** Fractions, algebraic polynomials, speeds with units.
   - Rendered via KaTeX display mode.
4. **`TEXT_AND_IMAGE`:** An option containing both a descriptive sentence and an associated diagram figure.
