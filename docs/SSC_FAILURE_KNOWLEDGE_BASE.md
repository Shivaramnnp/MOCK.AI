# MOCK.AI — SSC Ingestion Failure Knowledge Base
## Comprehensive Institutional Memory, Root Cause Forensics, and Permanent Remediation Catalog

**Document ID:** `KB-SSC-FAILURES-2026`  
**Authority:** Mock.AI Engineering & Forensic Quality Team  
**Scope:** Accumulated lessons across GATE 2024/2025, SSC CHSL (2019–2025), SSC CGL, SSC MTS, and UI Presentation  
**Status:** Permanent Living Engineering Standard  

---

### Executive Overview

This Knowledge Base synthesizes every major ingestion failure, boundary corruption, OCR degradation, visual reasoning error, answer-key drift, and UI rendering failure observed across the Mock.AI competitive examination platform.

It serves as the definitive reference to ensure the engineering team **never rediscovers the same failures independently**. Every entry records the observed defect, underlying root cause, defective legacy implementation, remediated universal implementation, associated regression test, and affected corpus scope.

---

### Failure Catalog

#### 1. Option D Rogue Stem Leakage
- **Failure:** Option D systematically displays the question stem or diagram of the immediately succeeding question ($N+1$).
- **Root Cause:** Tuple-based coordinate comparison `(p, y) < next_pos` captured any image whose top coordinate $y_0$ preceded the next question text marker. When combined with upward tolerance (`y - 15`), stem images of question $N+1$ starting slightly above the text marker were assigned to question $N$. Then, because option text was absent in the PDF text stream, the engine executed greedy fallback (`zip(unassigned_slots, unassigned_imgs)`), shoving the rogue stem crop into Option D.
- **Old Implementation:**
  ```python
  q_imgs = [img for img in all_images if img_start_pos <= img['pos'] < next_img_start_pos]
  # ...
  for slot, img in zip(unassigned_slots, unassigned_imgs):
      opt_imgs_assigned[slot] = img
  ```
- **Correct Implementation (V4 Engine):**
  1. Evaluate image interval using vertical midpoint: $y_{\text{mid}} = \frac{y_0 + y_1}{2.0}$. An image whose vertical center lies inside question $N+1$ cannot be captured by question $N$.
  2. Strict prohibition of greedy fallback. Option images are assigned only if they lie in the option column ($x_0 \ge \text{col\_bound}$) and vertically align within $\le 75\text{pt}$ of the option marker.
- **Regression Test:** `test_no_greedy_fallback_to_option_d` in [`scripts/test_ssc_engine_v4_regression.py`](file:///Users/shivarampatel/AndroidStudioProjects/MOCK.AI/scripts/test_ssc_engine_v4_regression.py)
- **Affected Scope:** SSC CHSL 2023, SSC CHSL 2022, SSC MTS 2022.

---

#### 2. Truncated Question Stems & First-Sentence Stripping
- **Failure:** Question stems start abruptly mid-sentence (e.g., `'In a certain code language,'` or `'Select the set in which...'` with the prompt body missing).
- **Root Cause:** Response sheet text streams often interleave text fragments with rendered bitmap tables or formula images. Legacy engines relied on simple string splits around regex markers (`Q.N`, `Ans`), throwing away image blocks that contained the continuation of the prompt.
- **Old Implementation:**
  ```python
  raw_q_text = clean_watermarks('\n'.join(prompt_parts))
  raw_q_text = re.sub(r'^(?:Q\.?\s*\d+\s*)', '', raw_q_text).strip()
  ```
- **Correct Implementation (V4 Engine):**
  Construct a composite question model preserving both native text blocks and demoted text strips/diagrams via 2D spatial block aggregation.
- **Regression Test:** `test_plain_text_strip_demoted` in `scripts/test_ssc_engine_v4_regression.py`
- **Affected Scope:** SSC CHSL 2023 (Q29, Q30, Q39, Q51, Q65, Q66).

---

#### 3. Duplicate Option Collisions ($A = B = C = D$)
- **Failure:** Multiple option slots display identical text or images (e.g., Option C == Option D: `+ and -`).
- **Root Cause:** When running Tesseract on small, low-resolution option chips, identical bounding boxes or OCR fallback on blank chips returned repeated text strings.
- **Old Implementation:**
  ```python
  for i in range(4):
      opt_ocr_texts[i] = pytesseract.image_to_string(opt_imgs_assigned[i])
  ```
- **Correct Implementation (V4 Engine):**
  Enforce [`OptionDuplicateDetector`](file:///Users/shivarampatel/AndroidStudioProjects/MOCK.AI/scripts/ssc_engine_v4/option_engine.py#L143). If OCR produces duplicate values, suppress the corrupted OCR text, fall back to authentic image choices (`IMAGE_ONLY`), or flag `REVIEW_REQUIRED`.
- **Regression Test:** `test_duplicate_option_detection` in `scripts/test_ssc_engine_v4_regression.py`
- **Affected Scope:** SSC CHSL 2023 (Q35, Q37, Q49, Q60), SSC CHSL 2024.

---

#### 4. Trigonometric & Mathematical OCR Corruption
- **Failure:** Mathematical formulas mangled into unreadable strings (`cot6 = = .`, `cosec7@`, `22` for $2\sqrt{2}$).
- **Root Cause:** Standard Tesseract OCR models assume Latin dictionary words and fail catastrophically on Greek letters ($\theta \rightarrow 6, @$), exponents, and radical symbols.
- **Old Implementation:** Unfiltered OCR string passed directly to JSON without syntax validation.
- **Correct Implementation (V4 Engine):**
  Implemented [`MathEngine`](file:///Users/shivarampatel/AndroidStudioProjects/MOCK.AI/scripts/ssc_engine_v4/math_engine.py) with contextual symbol normalization ($\cot \theta$, $\csc^2 \theta$, $\sqrt{x}$) and strict LaTeX syntax validation (balanced braces and delimiters).
- **Regression Test:** `test_trigonometric_normalization` & `test_valid_latex` in `scripts/test_ssc_engine_v4_regression.py`
- **Affected Scope:** SSC CHSL (2020–2023), GATE 2024.

---

#### 5. Premature Demotion of Visual Reasoning Figures
- **Failure:** Non-verbal visual puzzles (mirror images, cube/dice projections, paper folding) converted into garbled OCR text noise.
- **Root Cause:** Heuristics checking aspect ratio or character count indiscriminately demoted images containing isolated letters (e.g. dice faces showing 'A', 'B', 'C') into question text.
- **Old Implementation:**
  ```python
  if len(ocr_stem) >= 12 and h <= 140:
      raw_q_text += "\n" + ocr_stem
  ```
- **Correct Implementation (V4 Engine):**
  Multi-signal classifier strictly protects images containing visual reasoning keywords (`mirror image`, `cube`, `dice`, `embedded figure`, `pie chart`, `pattern series`) from destructive OCR demotion.
- **Regression Test:** `test_visual_reasoning_protected_from_demotion` in `scripts/test_ssc_engine_v4_regression.py`
- **Affected Scope:** SSC CHSL 2023 (Q34, Q50), SSC CHSL 2024.

---

#### 6. Double Rendering of Visual Options in Player UI
- **Failure:** Option choice displayed an authentic diagram with garbled OCR text rendered directly above or below it.
- **Root Cause:** Legacy ingestion stored OCR text in `options[i]` while also storing image URL in `optionImages[i]`. The frontend renderer (`StructuredContentRenderer.tsx`) rendered both.
- **Old Implementation:**
  `options[i] = ocr_text`, `optionImages[i] = img_url`
- **Correct Implementation (V4 Engine):**
  Enforced **Zero OCR Contamination Invariant**:
  When `displayMode` is `IMAGE_ONLY`, `options[i]` is strictly set to `""`. OCR text is preserved exclusively in `richOptions[i].ocrText` as metadata for alt-text and accessibility.
- **Regression Test:** `test_zero_ocr_contamination_in_image_only` in [`scripts/test_m2_adversarial_probes.py`](file:///Users/shivarampatel/AndroidStudioProjects/MOCK.AI/scripts/test_m2_adversarial_probes.py)
- **Affected Scope:** SSC CHSL 2024, SSC CHSL 2023.

---

#### 7. Single-Ownership Asset Violation (Stem $\cap$ Option Collision)
- **Failure:** The same image asset URL was referenced as both the question stem diagram and an option choice.
- **Root Cause:** Global image deduplication caches reused stem diagrams when option bounding boxes were misclassified.
- **Old Implementation:** Global hash cache returned the first registered URL across the entire question.
- **Correct Implementation (V4 Engine):**
  Strict asset provenance and role scoping:
  $$\text{Assets}_{\text{stem}} \cap \text{Assets}_{\text{option}} = \emptyset$$
  Stem assets must contain `_diag` and option assets must contain `_opt_`.
- **Regression Test:** `test_single_ownership_invariant_across_corpus` in `scripts/test_m2_adversarial_probes.py`
- **Affected Scope:** SSC CHSL 2023, SSC CHSL 2024.

---

#### 8. Answer Key Drift via Indicator Drift
- **Failure:** Official answer key recorded incorrectly (e.g. Option B instead of Option C).
- **Root Cause:** TCS iON response sheets place green checkmarks in a narrow column on the left. Vertical coordinate drift caused the tick icon's Y coordinate to align closer to option $i-1$ than option $i$.
- **Old Implementation:** Simple nearest-neighbor calculation using raw Y distance without column validation.
- **Correct Implementation (V4 Engine):**
  RGB green-tick saturation analysis ($G \ge R + 30$ and $G \ge B + 30$) combined with spatial proximity to candidate option anchors.
- **Regression Test:** Answer Key Forensics in `scripts/test_ssc_engine_v4_regression.py`
- **Affected Scope:** SSC CHSL 2023, SSC CHSL 2022.

---

#### 9. Hardcoded Paper Conditionals (`if year == 2023`)
- **Failure:** The ingestion engine became a brittle tangle of year-specific `if` branches, making future exam ingestion fragile and bug-prone.
- **Root Cause:** Developers patched specific years directly inside parsing loops rather than designing modular profiles.
- **Old Implementation:**
  ```python
  if year == 2023:
      col_bound = 98.0
  elif year == 2024:
      col_bound = 110.0
  ```
- **Correct Implementation (V4 Engine):**
  Profile-Driven Architecture with `SourceAdapter` and immutable `PaperProfile` instances (`SSCCHSL2023Tier1Profile`, `SSCCHSL2024Tier1Profile`, `SSCCGLTier1Profile`, etc.).
- **Regression Test:** `test_zero_question_or_paper_specific_bypasses` in `scripts/test_m2_adversarial_probes.py`
- **Affected Scope:** Platform-wide architecture.

---

#### 10. Thermal Throttling and Process Exhaustion on macOS
- **Failure:** Batch ingestion pipelines crashed or locked up Apple Silicon / macOS systems due to uncontrolled child processes spawned by Tesseract and PyMuPDF.
- **Root Cause:** Unbounded multiprocessing pool size coupled with OpenMP multithreading in image processing libraries.
- **Old Implementation:** `multiprocessing.Pool(cpu_count())` without memory flushes.
- **Correct Implementation (V4 Engine):**
  1. `OMP_THREAD_LIMIT = 1`
  2. Bounded concurrency (`max_workers = 1` or `2`)
  3. Shared global OCR semaphore (`_GLOBAL_OCR_SEMAPHORE`)
  4. `--thermal-safe` flag with automated 120-second cool-down intervals every 2 completed papers.
- **Regression Test:** `CHSL_IMPORTER_THERMAL_PROFILE.md` benchmarks.
- **Affected Scope:** All local multi-paper batch runs.

---

### Knowledge Base Maintenance Policy
1. Any future bug discovered in competitive exam ingestion must be added to this Knowledge Base.
2. No bug may be marked "Resolved" without a corresponding automated regression test in `scripts/test_ssc_engine_v4_regression.py` or `scripts/test_m2_adversarial_probes.py`.
3. Question-specific hardcoded patches (`if question == 37`) are permanently forbidden.

---
*End of SSC Ingestion Failure Knowledge Base.*
