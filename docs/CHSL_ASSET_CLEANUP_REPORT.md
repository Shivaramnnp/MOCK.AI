# MOCK.AI — Exam Asset Cleanup & Storage Integrity Report
**Document ID:** `docs/CHSL_ASSET_CLEANUP_REPORT.md`  
**System:** MOCK.AI Universal Paper Ingestion Engine  
**Author:** Agent 6 — Asset Engine & Storage Integrity Group  
**Date:** October 2026  
**Status:** AUDIT COMPLETE — CLEANUP BLUEPRINT

---

## 1. Asset Inventory Summary

A comprehensive inventory of `web/public/exam-assets/` and reference correlation across all 284 exam JSON datasets was conducted using `scripts/audit_exam_assets.py`:

| Asset Classification | Count | Status | Action Plan |
| :--- | :--- | :--- | :--- |
| **Total Disk Files** | **28,484** | Scanned | Global inventory baseline |
| **Active Referenced** | **24,422** | Healthy | **PRESERVE** — in active production use |
| **Stale Promoted Option Images** | **3,286** | Obsolete | **PRUNE** — options converted to clean KaTeX LaTeX |
| **Orphan Unreferenced Files** | **776** | Unused | **PRUNE** — unreferenced diagrams/crops from prior runs |
| **Corrupted / Zero-Byte** | **0** | Clean | Zero corrupted files found |
| **Broken JSON References** | **980** | Critical Defect | **REPAIR** — remove bogus cross-year 2024 asset links |
| **Duplicate Asset Groups** | **3,603** | Redundant | **CANONICALIZE** — reuse single canonical URL |

---

## 2. Root Cause & Repair of 980 Broken References

### 2.1 The Issue
50 historical papers (primarily SSC CHSL 2019, 2020, and 2023) contained 980 references pointing to missing option images in 2024 folders (e.g. `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-09jul-s1/q42_opt_c.jpeg`).

### 2.2 Why These References Broke
A legacy relinking script attempted to populate empty `optionImages` arrays by matching question numbers globally without validating that the asset belonged to the target paper's edition year. Because 2019 response sheets reset question numbering per section (`Q.1` to `Q.25`), the script matched arbitrary questions against 2024 file paths.

### 2.3 The Resolution
1. **Clean Invalid References:** Strip all broken cross-year asset URLs from the 50 affected JSON files.
2. **Reprocess from Authentic Source PDFs:** Use the v3 importer to re-extract genuine diagrams and option figures directly from the source PDFs in `/Users/shivarampatel/Downloads/exam ssc/`.
3. **Verify Asset Existence:** Every referenced URL must be validated against `os.path.exists()` before JSON export.

---

## 3. Pruning Stale Promoted Option Assets

When a question's options are promoted from raster images to crisp KaTeX LaTeX math (e.g. `$205\frac{1}{3}$`, `$42\frac{1}{2}\text{ km/h}$`), the raster image is no longer needed by the client. However, 3,286 legacy PNG cutouts remained on disk.

### Safety Verification Before Pruning:
1. Verify that the question JSON has `optionImages: null` or contains clean LaTeX in `options`.
2. Verify that `richOptions[i].displayMode` is `'TEXT_ONLY'`.
3. Verify that zero references exist across all 284 exam JSON files.
4. Execute pruning via `scripts/audit_exam_assets.py --apply`.
5. Expected disk space reclaimed: $\approx 145\text{ MB}$.

---

## 4. Supabase Storage Synchronization

After local asset cleanup:
1. Re-run `scripts/upload_images_to_storage.py` to synchronize only active referenced assets to the `exam-assets` bucket.
2. Update `.uploaded_storage_manifest.txt` to remove pruned stale hashes.
3. Validate that every public URL in Supabase returns HTTP 200 OK.
