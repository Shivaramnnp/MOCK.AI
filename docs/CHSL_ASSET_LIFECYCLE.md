# MOCK.AI — Exam Asset Lifecycle, Storage Integrity & Deduplication
**Document ID:** `docs/CHSL_ASSET_LIFECYCLE.md`  
**System:** MOCK.AI Universal Paper Ingestion Engine  
**Author:** Agent 6 — Asset Engine & Storage Group  
**Date:** October 2026  
**Status:** SPECIFICATION & AUDIT PROTOCOL

---

## 1. Asset Lifecycle States

Every visual asset extracted from an exam document progresses through a formalized state machine:

```
        ┌──────────────────┐
        │  [1. EXTRACTED]  │  (XObject retrieved from PDF stream)
        └────────┬─────────┘
                 │
                 ▼
        ┌──────────────────┐
        │ [2. CLASSIFIED]  │  (Multi-Signal Classifier: Visual vs Watermark vs Decorative)
        └────────┬─────────┘
                 │
        ┌────────┴───────────────────────────┐
        ▼                                    ▼
  [REJECTED]                           [3. VALIDATED]
  (Ads, separator lines,              (Dimensions, non-empty, valid PNG/JPEG header)
   watermarks)                               │
                                             ▼
                                       [4. DEDUPLICATED]
                                       (SHA-256 exact match check against canonical cache)
                                             │
                                             ▼
                                       [5. ATTACHED]
                                       (Bound to Question / Option with Single-Ownership)
                                             │
                                             ▼
                                       [6. PUBLISHED]
                                       (Stored in web/public/exam-assets & referenced in JSON)
                                             │
                 ┌───────────────────────────┴───────────────────────────┐
                 ▼                                                       ▼
           [SUPERSEDED]                                               [ORPHAN]
   (Replaced by higher-fidelity                               (Unreferenced file on disk
    crop or vector asset)                                     failing reference audit)
```

---

## 2. The Single-Ownership Guarantee

The v3 engine enforces strict ownership boundaries:
1. **Disjoint Sets:**
   $$\text{Assets}_{\text{stem}} \cap \text{Assets}_{\text{option}} = \emptyset$$
   No image asset can ever be simultaneously classified as both a question diagram and an option figure.
2. **Canonical Naming Convention:**
   - Question Stem Diagrams: `q{Q_NUM}_diag_{INDEX}.png`
   - Option Figures: `q{Q_NUM}_opt_{A|B|C|D}.png`
3. **In-Memory Assignment First:**
   Images are assigned to option slots in memory and audited against bounding boxes *before* writing any file to disk.

---

## 3. Cryptographic & Perceptual Deduplication

1. **SHA-256 Cryptographic Hashing:**
   Every extracted image payload has its SHA-256 digest computed:
   $$H = \text{SHA-256}(\text{bytes})$$
   If $H$ matches an existing published asset within the same exam folder, the existing asset URL is reused, preventing redundant disk storage.
2. **Perceptual Hashing (dHash):**
   Calculates difference hash ($64\text{ bits}$) to identify identical diagrams saved under differing JPEG/PNG compression artifacts. Perceptually identical candidates are flagged for review rather than blindly merged.

---

## 4. Asset Audit & Safe Cleanup Protocol

The user requested safe removal of unwanted, stale, or orphan assets. This must be executed with strict verification:

### 4.1 Dry-Run Protocol
1. Scan all files in `web/public/exam-assets/ssc/chsl/`.
2. Parse all 284 exam JSON files in `web/src/data/exams/`.
3. Construct a complete bidirectional reference graph:
   $$\text{File on Disk} \longleftrightarrow \text{Referenced in JSON / Database}$$
4. Categorize every file into:
   - `ACTIVE_REFERENCED`: Legitimately used by at least one question or option.
   - `PROMOTED_TEXT_STALE`: An option image from an earlier ingestion that has since been promoted to clean LaTeX text.
   - `ORPHAN_UNREFERENCED`: File exists on disk with zero references across all exam JSONs.
   - `CORRUPTED_ZERO_BYTE`: Invalid or empty file.
5. Generate a comprehensive dry-run report (`docs/CHSL_ASSET_CLEANUP_DRY_RUN.md`).

### 4.2 Safe Apply Protocol
- Deletion is executed **only** after dry-run verification.
- Never delete based solely on filename or image dimensions.
- Verify that no Supabase database row references the asset path before unlink.
- Preserve an audit log of every unlinked file.
