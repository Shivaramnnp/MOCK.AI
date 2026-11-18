# SSC CHSL Importer — Mac Thermal & Resource Profile
**Document Version:** 1.0 (Phase 1 Baseline & Forensic Profile)  
**System Architecture:** Apple Silicon Mac (Apple M2 — 8 Cores: 4 Performance + 4 Efficiency)  
**Memory:** 8.00 GB Unified Memory  
**Target Workload:** TCS iON CBT Response Sheet Ingestion Pipeline (`universal_chsl_importer.py`)  

---

## 1. Executive Summary & Root Bottleneck Finding

Empirical profiling conducted on official SSC CHSL response sheets (`SSC-CHSL-2023-02-08-2023-Shift-I-Paper.pdf`) establishes that **96.5% of the importer's wall-clock time and 99%+ of its active CPU load is spent inside external Tesseract OCR subprocesses**.

| Metric | Measured Baseline (1 Paper) | Projected 6-Worker Unbounded Execution |
| :--- | :--- | :--- |
| **Total Wall-Clock Time** | 74.67 s | ~450 s (throttling & thread contention) |
| **Total Tesseract Subprocess Invocations** | **1,077 calls** | **6,462 calls** |
| **Active Time in Tesseract OCR** | **72.05 s (96.5%)** | High continuous CPU saturation |
| **Non-OCR Time (PyMuPDF, Parsing, Disk I/O)** | **2.62 s (3.5%)** | Negligible overhead |
| **Average Time per OCR Invocation** | 0.0669 s | 0.0669 s |
| **Peak Single-Process RSS Memory** | 81.20 MB | ~487 MB total across 6 processes |

**The Primary Root Cause of Mac Thermal Load:**  
The legacy `--year 2023` command spawned 6 parallel Python processes (`min(6, os.cpu_count())`). Each Python process independently launched multiple synchronous Tesseract CLI invocations (`pytesseract.image_to_string`). Because Tesseract is compiled with OpenMP, each invocation attempted to utilize all 8 CPU cores. Multiplying 6 concurrent Python processes by unconstrained OpenMP threads flooded the CPU scheduling queue with up to 48 competing threads, pegging the CPU at 800% capacity and causing severe thermal fan throttling.

---

## 2. Resource Breakdown & Concurrency Multiplier

```
               [ 6 Parallel Python PDF Workers ]
             /        |        |        |        \
       Worker 1    Worker 2  Worker 3  Worker 4  Worker 5  Worker 6
          |           |         |         |         |         |
     [Tesseract] [Tesseract] [Tesseract] [Tesseract] [Tesseract] [Tesseract]
     (OpenMP x8) (OpenMP x8) (OpenMP x8) (OpenMP x8) (OpenMP x8) (OpenMP x8)
     ------------------------------------------------------------------------
       PEAK CPU LOAD: 48 Competing Threads Pegging 100% of All 8 M2 Cores!
```

### Breakdown of In-Process Tesseract Invocations (Per 100 Questions)
1. **Option Chip OCR (`robust_ocr_chip`)**:
   - PSM 6 pass for fractions / equations
   - PSM 7 pass for single-line text
   - PSM 6 component horizontal projection split for mixed numbers
   - Sub-component left/right passes
2. **Question Stem Strip Demotion (`Certified Stem Strip Demotion`)**:
   - PSM 6 pass on diagram candidates to detect and demote text strips
   - PSM 7 fallback pass
3. **Diagram Crop Prompt Refinement (`refine_diagram_crop`)**:
   - PSM 6 pass on top text band above figures
4. **General Box OCR (`ocr_crop`)**:
   - Multi-pass PSM fallback ladder

---

## 3. Memory & Disk I/O Profile

- **Peak RSS per Paper:** 81.20 MB. Memory growth is not the bottleneck; PyMuPDF and PIL images are well-contained.
- **Disk I/O:** 9 diagram assets and 76 option figures written per paper (~2–5 MB total I/O). Disk write throughput is minimal and well within NVMe SSD limits.
- **CPU / Thermal Bottleneck:** 100% compute-bound in OCR matrix multiplication and convolution algorithms in `libtesseract`.

---

## 4. Architectural Solution Strategy

To eliminate thermal load without altering source-fidelity or reducing extraction quality:
1. **Set `OMP_THREAD_LIMIT=1`:** Constrains each Tesseract instance to a single thread, preventing OpenMP from blasting all CPU cores.
2. **Resource-Separated Concurrency:**
   - `PDF_WORKERS=2` (default laptop mode)
   - `OCR_WORKERS=1` (hard global semaphore: at most 1 Tesseract process active at any instant)
   - `IMAGE_WORKERS=2`
   - `HASH_WORKERS=2`
3. **Deterministic SHA-256 OCR Memoization:**
   - Cache results of `robust_ocr_chip` by image content hash. Identical chips (repeated formulas, symbols, badges) evaluate in $0.00001\text{ s}$ instead of spawning a new process.
4. **Resumable Paper-Level Checkpoint Manifest:**
   - Persist completed paper states to a manifest (`.chsl_manifest_2023.json`).
   - If interrupted via `Ctrl+C`, clean exit without corrupted output, and skip verified papers on resume.
5. **Progress & Thermal Pacing (`--thermal-safe`):**
   - Provide clean, readable single-line status reporting without log flooding.
   - Insert micro-pauses (e.g., 50–100 ms) between paper transitions when `--thermal-safe` is active.
