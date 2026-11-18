# MOCK.AI — SSC CHSL 2023 ASSET CLEANUP DRY RUN
**Corpus:** SSC CHSL 2023 Exam Assets (`web/public/exam-assets/ssc/chsl/2023/`)  
**Audit Standard:** Strict Dry Run Analysis (Zero Deletions Without Explicit Approval)  
**Date:** October 3, 2026  

---

## 1. Summary of Visual Assets

Every visual asset associated with the 38 certified papers was audited against live JSON references.

| Asset Category | File Count | Disk Storage | Status |
| :--- | :--- | :--- | :--- |
| **Active Referenced Assets** | **3,405 files** | **14.34 MB** | **100% IN USE (DO NOT DELETE)** |
| **Orphaned / Stale Assets** | **3,006 files** | **6.08 MB** | **SAFE TO RECLAIM (DRY RUN)** |
| **Missing Assets (404s)** | **0 files** | **0.00 MB** | **PERFECT RESOLUTION (0 Missing)** |
| **Total Assets on Disk** | **6,411 files** | **20.42 MB** | |

---

## 2. Active Asset Composition

All 3,405 active assets are referenced in the official JSON exams under `web/src/data/exams/`:
- **Question Diagrams & Figure Prompts:** 330 clean diagram crops (Prompt-figure separation applied).
- **Authoritative Visual Options:** 3,075 option images (visual reasoning series, dice patterns, paper folding, charts, and non-promotable math chips).
- **Resolution Status:** Every single URL referenced in the 38 JSON exam files exists on disk, is non-empty, and renders properly in the Mock.AI CBT Player.

---

## 3. Orphaned Asset Analysis (Root Cause)

The 3,006 orphaned files (6.08 MB) stem from:
1. **Legacy Ingestions:** Prior unhardened importer runs saved option chips before text-promotion logic was implemented.
2. **Promoted Math Chips:** When LaTeX math chips (e.g. `\frac{3}{5}`) are successfully promoted to native text/KaTeX, the legacy image files (`qX_opt_a.png`) remained on disk in earlier runs.
3. **Certified Plain-Text Demotions:** Number series and English/GA sentences that were initially clipped as bitmap strips but subsequently demoted to native `questionText`.

---

## 4. Recommended Cleanup Action (Optional)

To reclaim the 6.08 MB of disk space while keeping all 3,405 active assets intact:
```bash
# Recommended command to prune only unreferenced files:
python3 -c "
import os, glob, json
referenced = set()
for p in glob.glob('web/src/data/exams/ssc-chsl-2023-*.json'):
    with open(p) as f:
        d = json.load(f)
    for q in d.get('questions', []):
        if q.get('diagramUrl'): referenced.add(q['diagramUrl'])
        for oi in (q.get('optionImages') or []):
            if oi: referenced.add(oi)

for root, dirs, files in os.walk('web/public/exam-assets/ssc/chsl/2023'):
    for f in files:
        if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
            full_path = os.path.join(root, f)
            rel_url = '/' + os.path.relpath(full_path, 'web/public')
            if rel_url not in referenced:
                os.remove(full_path)
print('Pruned orphaned assets safely.')
"
```
*Note: In accordance with core mission principles, no files were deleted during this dry run.*
