# MOCK.AI — Exam Asset Inventory & Cleanup Dry-Run Report
**Document ID:** `docs/CHSL_ASSET_CLEANUP_DRY_RUN.md`  
**Generated At:** 2026-10-03T04:13:26Z  
**Status:** DRY-RUN AUDIT COMPLETE — PENDING CONFIRMATION

---

## 1. Inventory Summary

| Category | Count | Status / Recommended Action |
| :--- | :--- | :--- |
| **Total Disk Files** | **28484** | Total physical files in `web/public/exam-assets/` |
| **Active Referenced** | **24422** | **PRESERVE** (Actively used in JSON/UI) |
| **Stale Promoted Option Images** | **3286** | **SAFE DELETE CANDIDATE** (Options promoted to KaTeX) |
| **Orphan Unreferenced Files** | **776** | **SAFE DELETE CANDIDATE** (Zero references in any exam) |
| **Corrupted / Zero-Byte** | **0** | **DELETE CANDIDATE** (Invalid image payload) |
| **Broken JSON References** | **980** | **FIX REQUIRED** (Question references missing file) |
| **Duplicate Asset Groups** | **3603** | **CANONICAL REUSE CANDIDATE** (Identical SHA-256) |

---

## 2. Broken References Audit (Severity: CRITICAL)
980 references in exam JSON files point to non-existent disk files:

| Paper ID | Q# | Role | Missing URL |
| :--- | :--- | :--- | :--- |
| `ssc-chsl-2019-01jul-s3` | 54 | `optionImage_A` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-09jul-s1/q42_opt_c.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 54 | `optionImage_B` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-02jul-s1/q66_opt_a.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 54 | `optionImage_C` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-05jul-s1/q63_opt_a.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 54 | `optionImage_D` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-09jul-s1/q82_opt_b.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 54 | `richOption_A` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-09jul-s1/q42_opt_c.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 54 | `richOption_B` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-02jul-s1/q66_opt_a.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 54 | `richOption_C` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-05jul-s1/q63_opt_a.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 54 | `richOption_D` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-09jul-s1/q82_opt_b.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 58 | `optionImage_A` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-09jul-s4/q66_opt_d.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 58 | `optionImage_B` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-09jul-s1/q82_opt_b.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 58 | `optionImage_D` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-02jul-s2/q47_opt_c.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 58 | `richOption_A` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-09jul-s4/q66_opt_d.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 58 | `richOption_B` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-09jul-s1/q82_opt_b.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 58 | `richOption_D` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-02jul-s2/q47_opt_c.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 65 | `optionImage_A` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-11jul-s1/q33_opt_a.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 65 | `optionImage_B` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-05jul-s1/q63_opt_a.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 65 | `optionImage_C` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-05jul-s1/q63_opt_b.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 65 | `optionImage_D` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-10jul-s4/q41_opt_d.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 65 | `richOption_A` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-11jul-s1/q33_opt_a.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 65 | `richOption_B` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-05jul-s1/q63_opt_a.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 65 | `richOption_C` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-05jul-s1/q63_opt_b.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 65 | `richOption_D` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-10jul-s4/q41_opt_d.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 69 | `optionImage_A` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-10jul-s4/q41_opt_d.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 69 | `optionImage_B` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-02jul-s1/q66_opt_d.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 69 | `optionImage_C` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-10jul-s4/q41_opt_c.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 69 | `optionImage_D` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-11jul-s4/q73_opt_d.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 69 | `richOption_A` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-10jul-s4/q41_opt_d.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 69 | `richOption_B` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-02jul-s1/q66_opt_d.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 69 | `richOption_C` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-10jul-s4/q41_opt_c.jpeg` |
| `ssc-chsl-2019-01jul-s3` | 69 | `richOption_D` | `/exam-assets/ssc/chsl/2024/ssc-chsl-2024-11jul-s4/q73_opt_d.jpeg` |

*...and 950 more.* See `asset-audit-report.json` for full list.

---

## 3. Stale Promoted Option Images (Count: 3286)
These files are option cutouts from previous ingestions where the option was promoted to native LaTeX math or text. The JSON files no longer reference them.

Sample stale promoted assets:
- `ssc/chsl/2022/ssc-chsl-2022-10mar-s3/q40_opt_a.jpeg` (86x86, 1641 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-10mar-s3/q47_opt_a.jpeg` (81x77, 1761 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-10mar-s3/q70_opt_a.jpeg` (60x21, 1017 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-10mar-s3/q28_opt_a.jpeg` (135x128, 1965 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-10mar-s3/q61_opt_a.jpeg` (36x21, 869 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-10mar-s3/q53_opt_a.jpeg` (612x262, 18044 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-10mar-s3/q64_opt_a.jpeg` (110x25, 1439 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-10mar-s3/q32_opt_a.jpeg` (84x84, 1723 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-10mar-s3/q65_opt_a.jpeg` (660x41, 5851 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-10mar-s3/q46_opt_a.jpeg` (660x119, 7791 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-10mar-s3/q72_opt_b.jpeg` (36x21, 878 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-10mar-s3/q60_opt_a.jpeg` (51x26, 986 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-10mar-s3/q57_opt_a.jpeg` (57x33, 722 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-09mar-s4/q45_opt_a.jpeg` (660x94, 8608 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-09mar-s4/q48_opt_a.jpeg` (84x84, 1988 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-09mar-s4/q33_opt_a.jpeg` (231x212, 6707 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-09mar-s4/q66_opt_a.jpeg` (101x26, 1354 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-09mar-s4/q75_opt_a.jpeg` (41x22, 934 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-09mar-s4/q50_opt_a.jpeg` (86x87, 2396 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-09mar-s4/q37_opt_a.jpeg` (660x115, 7947 bytes)

*...and 3266 more.*

---

## 4. Orphan Unreferenced Files (Count: 776)
Files on disk that have zero references in any exam JSON:
- `ssc/chsl/2022/ssc-chsl-2022-10mar-s3/q65_diag.jpeg` (381x38, 3323 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-09mar-s4/q39_diag.jpeg` (423x127, 6088 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-09mar-s4/q67_diag.jpeg` (428x26, 4073 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-09mar-s4/q72_diag.jpeg` (454x31, 3752 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-09mar-s3/q59_diag.jpeg` (660x33, 6962 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-10mar-s2/q65_diag.jpeg` (432x26, 3978 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-10mar-s2/q66_diag.jpeg` (424x26, 3726 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-09mar-s2/q64_diag.jpeg` (270x43, 3175 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-09mar-s2/q70_diag.jpeg` (397x38, 3416 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-09mar-s2/q73_diag.jpeg` (513x38, 4256 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-09mar-s2/q41_diag.jpeg` (441x298, 13417 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-16mar-s4/q29_diag.jpeg` (312x308, 10381 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-16mar-s4/q58_diag.jpeg` (660x25, 5720 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-16mar-s3/q70_diag.jpeg` (568x29, 4620 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-16mar-s3/q59_diag.jpeg` (660x38, 6340 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-16mar-s3/q47_diag.jpeg` (461x201, 8913 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-14mar-s2/q68_diag.jpeg` (505x34, 4416 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-14mar-s2/q69_diag.jpeg` (370x25, 3335 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-14mar-s2/q72_diag.jpeg` (451x26, 4081 bytes)
- `ssc/chsl/2022/ssc-chsl-2022-20mar-s1/q44_diag.jpeg` (284x255, 9893 bytes)

*...and 756 more.*

---

## 5. Safe Apply Protocol
To execute deletion of verified stale and orphan assets:
```bash
python3 scripts/audit_exam_assets.py --apply
```
The `--apply` command will only remove files classified as `STALE_PROMOTED` or `ORPHAN_UNREFERENCED` that have 0 references across all 284 JSON papers.
