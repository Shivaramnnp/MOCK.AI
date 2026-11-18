# MOCK.AI — Universal SSC Question Ingestion Engine V4
## Architecture Specification, Profile Models, and Pipeline Design

**Specification Version:** `4.0.0-PROD`  
**Engine Identity:** Universal SSC/Competitive Ingestion Engine (V4)  
**Target Environments:** macOS Darwin (Apple Silicon & Intel), Linux x86_64/arm64  
**Date:** October 3, 2026  

---

### 1. Vision & Architecture Philosophy

The **Universal Ingestion Engine V4** is designed to eliminate year-specific heuristics and hardcoded paper exceptions (`if year == 2023: ...`). Instead, it establishes an extensible, profile-driven architecture capable of ingesting any Staff Selection Commission (SSC) CBT response sheet, GATE examination paper, or similar standardized competitive test paper.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SOURCE DOCUMENT (PDF)                           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         SOURCE ADAPTER ROUTER                          │
│        (Auto-detects exam, tier, year, layout -> Selects Profile)      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
       ┌────────────────────────────┼────────────────────────────┐
       ▼                            ▼                            ▼
┌──────────────┐             ┌──────────────┐             ┌──────────────┐
│ SSC CHSL     │             │ SSC CGL      │             │ SSC MTS      │
│ Profiles     │             │ Profiles     │             │ Profiles     │
└──────┬───────┘             └──────┬───────┘             └──────┬───────┘
       └────────────────────────────┼────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       UNIVERSAL ENGINE PIPELINE                        │
│                                                                        │
│  1. Page Geometry Engine         6. Math Reconstruction (LaTeX)        │
│  2. Question Segmentation        7. Asset Engine & Provenance          │
│  3. Passage / SubQuestion Linker 8. Answer Key Forensics (Green-Tick)  │
│  4. Multi-Signal Classifier      9. Canonical Quality Gate             │
│  5. 1-to-1 Spatial Option Engine 10. Persistence & Checkpoints         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   CANONICAL JSON + VERIFIED ASSETS                     │
│                        (Ready for Player UI)                           │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 2. Paper Profile & Adapter Model

Rather than scattering geometric thresholds throughout the parser, all exam- and year-specific layout constants are strictly encapsulated into immutable `PaperProfile` instances.

```python
class ScoringProfile:
    def __init__(self, marks_correct: float, marks_negative: float, duration_minutes: int):
        self.marks_correct = marks_correct
        self.marks_negative = marks_negative
        self.duration_minutes = duration_minutes

class LayoutProfile:
    def __init__(self, col_bound: float, option_x_min: float, option_x_max: float,
                 top_margin: float = 50.0, bottom_margin: float = 780.0):
        self.col_bound = col_bound          # Boundary separating content from response status
        self.option_x_min = option_x_min    # Minimum X coordinate for option content
        self.option_x_max = option_x_max    # Maximum X coordinate for option content
        self.top_margin = top_margin        # Header exclusion line
        self.bottom_margin = bottom_margin  # Footer exclusion line

class PaperProfile:
    """Encapsulates exam-specific layout, section mapping, and scoring rules."""
    def __init__(self, profile_id: str, exam_name: str, layout: LayoutProfile, scoring: ScoringProfile):
        self.profile_id = profile_id
        self.exam_name = exam_name
        self.layout = layout
        self.scoring = scoring

    def identify_section(self, header_text: str) -> tuple[str, str]:
        """Maps raw section header string to canonical (section_id, section_name)."""
        raise NotImplementedError
```

#### Standard Profiles Defined
1. `SSCCHSL2023Profile`:
   - Tier 1: `col_bound = 98.0`, `marks_correct = 2.0`, `marks_negative = 0.5`, 4 sections × 25 = 100 questions.
   - Tier 2: `col_bound = 146.0`, `marks_correct = 3.0`, `marks_negative = 1.0`, 5 sections = 135 questions.
2. `SSCCHSL2024Profile`:
   - Tier 1: `col_bound = 98.0`, enhanced digital font layout, 100 questions.
3. `SSCCHSL2025Profile`:
   - Modernized TCS iON format with high-density vector diagrams.
4. `SSCCGLProfile` & `SSCMTSProfile`:
   - Specialized layout profiles for multi-shift graduate and matriculation levels.

---

### 3. Core Engine Pipeline Components

#### 3.1 Universal Page Geometry Engine
- Extracts text blocks, drawing paths, and embedded XObjects from PyMuPDF.
- Calculates exact bounding boxes: `(x0, y0, x1, y1)`.
- Eliminates content-stream order assumptions by enforcing geometric physical reading order:
  $$\text{sort\_key} = (\text{page}, \text{round}(y0, 1), \text{round}(x0, 1))$$
- Filters out non-content artifacts (Adda247/Testbook watermarks, full-page promo banners, header stamps).

#### 3.2 Question Segmentation Engine (`QuestionBoundaryEvidence`)
- Detects question markers (`Q.1`, `Q 1`, `Q. 1`, `SubQuestion No : X`).
- Connects continuous questions and detects parent reading comprehension passages (`Comprehension:` blocks).
- Constructs immutable `QuestionBoundaryEvidence`:
  - `start_pos`: `(start_page, start_y)`
  - `end_pos`: `(end_page, end_y)`
  - `section_id`: Canonical section identifier
  - `source_q_num`: Original question number from PDF

#### 3.3 Multi-Signal Content Classifier
Every extracted block and visual object is classified using evidence fusion:
- **Geometry:** Bounding box aspect ratio, width, height, and position relative to `ans_pos`.
- **Text Density:** Number of readable alphanumeric characters vs noise symbols.
- **OCR Confidence:** Tesseract confidence score and lexical dictionary validation.
- **Visual Reasoning Keywords:** Explicit detection of spatial terms (`mirror image`, `cube`, `dice`, `embedded figure`, `pie chart`, `bar graph`).

**Classification Classes:**
- `TEXT_ONLY`: Crisp native text without visual components.
- `MATH_ONLY`: Mathematical equations converted to LaTeX.
- `GENUINE_VISUAL`: Question stem diagrams, charts, graphs.
- `IMAGE_OPTION`: Authentic visual choices in reasoning/pattern questions.
- `TABLE`: Tabular data preserved as structured markdown or high-res image.
- `PASSAGE`: Parent comprehension reading block.
- `UNKNOWN`: Unclassifiable content; triggers `REVIEW_REQUIRED`.

#### 3.4 1-to-1 Spatial Option Matching Engine (No Greedy Fallback)
Earlier engine versions suffered from the "Option D rogue crop" defect due to blind assignment of leftover images (`zip(unassigned_slots, unassigned_imgs)`).  
The V4 engine mandates:
1. Every candidate option image must fall strictly within the option column:
   $$x_0 \ge \text{profile.layout.col\_bound}$$
2. An image is assigned to option slot $i$ if and only if its vertical center $y_{\text{mid}}$ aligns within $\pm 25\text{pt}$ of option marker $i$'s coordinate.
3. If an option slot has neither text nor a spatially verified image, the engine **refuses to guess** and marks the question as `REVIEW_REQUIRED`.

#### 3.5 Mathematical Reconstruction Engine
- Identifies mathematical glyphs and fractions.
- Converts ASCII approximations to standard KaTeX / LaTeX:
  - `\frac{numerator}{denominator}` for fractions and mixed fractions
  - `\sqrt{x}` for radicals
  - Trigonometric formulas: $\cot \theta$, $\csc^2 \theta$, $\sin \theta$, $\cos \theta$
- Validates that generated LaTeX strings compile cleanly without unclosed braces or delimiters.

#### 3.6 Answer Key Forensics Engine
- TCS iON CBT response sheets indicate the official answer key with a green checkmark icon.
- Evaluates RGB color channels:
  $$G \ge R + 30 \quad \text{and} \quad G \ge B + 30$$
- Spatially correlates the green tick icon coordinate `(page, y)` with the 4 option coordinates.
- Selects the option index with minimum vertical distance:
  $$\text{correct\_index} = \arg\min_{i} \left| y_{\text{tick}} - y_{\text{opt}, i} \right|$$

#### 3.7 Asset Provenance & Single-Ownership Guarantee
Every image asset is saved to disk with cryptographic provenance:
- Content-addressed naming: `q{N}_diag.jpeg` for stems, `q{N}_opt_{a..d}.jpeg` for options.
- Single-Ownership Invariant:
  $$\text{Assets}_{\text{stem}} \cap \text{Assets}_{\text{option}} = \emptyset$$
- Pre-publication verification: every asset referenced in JSON must exist on disk, be readable, and have non-zero file size.

---

### 4. Mac Thermal & Resource Management Subsystem

To guarantee stability and prevent thermal throttling during batch reprocessing on macOS:

1. **Process Limits:**
   - Worker concurrency bounded (`max_workers = 1` or `2`).
   - OpenMP threads clamped: `OMP_THREAD_LIMIT = 1`.
2. **Global OCR Semaphore:**
   - Limits active Tesseract subprocesses across all threads to prevent CPU spikes.
3. **Thermal Cool-Down Interval:**
   - Supported via `--thermal-safe`, `--cooldown-every 2`, and `--cooldown-seconds 120`.
   - After processing 2 papers, the engine releases all PyMuPDF documents, cleans memory caches via `gc.collect()`, flushes writes, updates `.manifests/`, and enters a 120-second cool-down period.
4. **Resumable Checkpoints:**
   - Progress recorded atomically in `web/src/data/exams/.manifests/`.
   - Engine resumes interrupted runs seamlessly without re-extracting completed papers.

---

### 5. Production Acceptance Quality Gate

Before any question or paper is published with `VERIFIED` status:
- Question stem must not be empty.
- Exactly 4 option slots must be present and non-empty.
- No duplicate options ($A \ne B \ne C \ne D$) unless source explicitly demands it.
- All linked asset URLs must exist on disk with valid dimensions.
- Correct answer index must be within range $[0, 3]$.
- If any condition fails, status is strictly set to `REVIEW_REQUIRED`.

---
*End of V4 Ingestion Engine Specification.*
