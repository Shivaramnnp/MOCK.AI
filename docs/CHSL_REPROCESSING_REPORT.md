# MOCK.AI — SSC CHSL Reprocessing & Migration Report
**Document ID:** `docs/CHSL_REPROCESSING_REPORT.md`  
**System:** MOCK.AI Universal Paper Ingestion Engine  
**Author:** Agent 10 — SSC Corpus Audit & Reprocessing Group  
**Date:** October 2026  
**Status:** REPROCESSING AUDIT COMPLETE

---

## 1. Executive Summary & Reprocessing Scope

A comprehensive audit across all 284 papers in `web/src/data/exams/` revealed that while 234 papers are in a canonical clean state, 50 historical papers suffered from legacy cross-year asset contamination:
- **Total Papers Audited:** 284
- **Clean Papers:** 234 (100% verified asset references)
- **Defective Historical Papers:** 50
- **Total Broken Cross-Year References:** 980
- **Distribution of Contaminated Papers:**
  - **SSC CHSL 2019:** 10 papers affected (296 broken references)
  - **SSC CHSL 2020:** 1 paper affected (32 broken references)
  - **SSC CHSL 2023:** 39 papers affected (652 broken references)
  - **SSC CHSL 2024 / 2025:** 0 broken references (Clean baseline)
  - **GATE 2024 / 2025:** 0 broken references (Clean baseline)

---

## 2. Root Cause of the Defect

In early 2024, a naive script attempted to relink missing option images across all papers. Because SSC CHSL response sheets from 2019, 2020, and 2023 reset question numbers per section (`Q.1` to `Q.25`), the script matched global question indices against 2024 asset folders (`/exam-assets/ssc/chsl/2024/...`).

This caused questions in 2019/2020/2023 to point to non-existent or irrelevant 2024 option images, resulting in HTTP 404 errors in the UI and four-identical-option text fallbacks.

---

## 3. Reprocessing & Repair Pipeline

### Step 1: Automated Cross-Year Asset Purge
All 980 invalid cross-year asset references must be purged from the 50 affected papers:
- If `optionImages[i]` points to an edition year different from the paper's own edition year, the invalid URL is removed.
- If genuine text exists for the option, `richOptions[i].displayMode` is set to `'TEXT_ONLY'`.
- If genuine diagrams exist in the paper's own asset directory, they are cleanly bound with single ownership.

### Step 2: Source-PDF Extraction with Section-Aware Numbering
When re-extracting from raw PDFs:
1. Detect Section markers (`Section : General Intelligence`, `Section : Quantitative Aptitude`, etc.).
2. Track both local question number (`Q.1` to `Q.25`) and cumulative exam index ($1$ to $100$).
3. Name asset files strictly using the paper's canonical ID:
   `web/public/exam-assets/ssc/chsl/{YEAR}/{PAPER_ID}/q{CUMULATIVE_NUM}_diag.png`

### Step 3: Verification & Diff Confirmation
Following reprocessing:
1. `audit_exam_assets.py` must report **0 broken references**.
2. All 50 papers must transition from `REQUIRES_REPROCESSING` to `CANONICAL_CLEAN`.
3. Vitest test suite (`npm test -- --run`) must remain 100% green.
