# SSC CHSL 2024 Visual Asset Forensic & Integrity Report

## Executive Summary
This document provides a forensic audit and accounting of the image assets for the SSC CHSL 2024 examination series in Mock.AI following the algorithmic source-fidelity repair program.

- **Total JSON Papers Audited**: 37 exam files (including Tier-I and Tier-II papers)
- **Baseline Assets on Disk (Pre-Cleanup)**: 3,121 files
- **Uniquely Referenced Assets**: 1,532 files
- **Orphaned Assets Safely Purged**: 1,589 files (50.9% disk asset reduction)
- **Missing Referenced Assets**: **0** (100% referential integrity)

---

## 1. Root Cause of Legacy Asset Bloat
Prior to this program, the CBT parsing pipeline suffered from two systemic flaws:
1. **Premature Disk Persistence**: In `parse_tcs_ion_cbt`, option crops were extracted and saved to disk via `get_or_save_asset()` *before* evaluation of text promotion rules. When options were subsequently promoted to text/LaTeX, `option_images[i] = None` was set in the JSON, leaving four orphaned PNG files per question on disk.
2. **Text-Strip Diagram Persistence**: Plain-text prompts, number series, and arithmetic equations were rasterized and saved as `_diag.png` files even when semantic text or KaTeX representations were available.
3. **MIME/Extension Collisions**: When re-ingesting papers, new JPEG extractions failed to clean up legacy PNG conversions from earlier pipeline iterations.

---

## 2. Algorithmic Fixes Implemented
1. **Deferred Asset Saving**:
   - Option images are held in-memory during geometric assignment, multi-stage OCR (`robust_ocr_chip`), and answer-key validation.
   - Files are written to disk if and only if the question is classified as `IMAGE_ONLY` (authentic visual reasoning, mirror images, folding figures).
   - If options are promoted to text or LaTeX math, zero disk writes occur, and stale files from previous runs are immediately unlinked.
2. **Prompt-Figure Separation (`refine_diagram_crop`)**:
   - Detects horizontal white gaps ($\ge 8\text{px}$) separating top text prompt lines from visual figures.
   - Diagram images are cropped strictly to the authentic figure, while prompt text populates `questionText`, eliminating duplicate prompt text.
   - Chart cards (pie charts, bar charts) are preserved in their entirety while preventing garbled OCR slice label leakage into question stems.
3. **Multi-Stage Mathematical Chip Promotion**:
   - Mixed fractions, rational algebraic expressions, percentage fractions, numbers with thousand-separator commas, currency symbols, and unit measurements are promoted to native text/KaTeX expressions ($205\frac{1}{3}\text{ cm}^3$, $\frac{2xy}{x^2-y^2}$, $\text{Profit, } 36\frac{4}{11}\%$, $512\text{ cm}^3$).

---

## 3. Forensic Asset Inventory & Verification

| Category | Pre-Cleanup Count | Post-Cleanup Count | Net Change | Integrity Status |
| :--- | :---: | :---: | :---: | :---: |
| **Stem Diagrams (`*_diag*`)** | 1,324 | 437 | -887 | **100% Verified** |
| **Option Figures (`*_opt_*`)** | 1,797 | 1,095 | -702 | **100% Verified** |
| **Total Disk Files** | **3,121** | **1,532** | **-1,589** | **0 Broken Links** |

### Integrity Verification Result
```text
Total 2024 JSON exam files: 37
Total uniquely referenced assets across all 2024 JSONs: 1532
Total asset files on disk in 2024 directory: 1532
Missing referenced assets: 0
Orphaned unreferenced assets: 0
Referential Integrity: 100.0%
```

All 1,532 retained assets correspond to genuine visual reasoning figures (mirror images, cube nets, folding puzzles, embedded figures, series transformations) and official data interpretation charts.
