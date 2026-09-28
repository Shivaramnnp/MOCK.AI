# Project: Mock.AI GATE Corpus Forensic Verification & Pipeline Repair

## Architecture
- **Corpus Hierarchy**: 76 discrete source units (GATE 2024: 38 units, GATE 2025: 38 units). Multi-session papers (CE-1, CE-2, CS-1, CS-2, GG-1, GG-2, XH-C1..XH-C6) are independently isolated units.
- **Data Layer**: Master Question Paper PDFs and Final Answer Key PDFs in `/Users/shivarampatel/Downloads/GATE 2024` and `GATE 2025`. Normalized JSON representations in `web/src/data/exams/gate-<year>-<paper>.json` conforming to `ExamPaper` and `CompetitiveQuestion` TypeScript schemas. Visual assets in `web/public/exam-assets/gate/<year>/<paper>/`.
- **Shared Pipeline**: `scripts/gate_forensic_pipeline.py` (PyMuPDF-based extraction, math delimiters, table segmentation, asset cropping, and JSON generation).
- **Presentation Layer**: React + Vite SPA. `StructuredContentRenderer.tsx` and `LatexRenderer.tsx` handling KaTeX math, tables, images, and questions across desktop, tablet, and mobile.
- **Forensic Audit Framework**: 16 verification dimensions (A through P), master matrix CSV (`docs/audits/GATE_CORPUS_MASTER_MATRIX.csv`), paper audit markdowns (`docs/audits/gate-2024/*.md` and `docs/audits/gate-2025/*.md`), and synthesis reports (`docs/audits/GATE_*_COMPLETE_VERIFICATION.md`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Complete 76-Unit Paper Inventory | Verify all 76 official source units across GATE 2024 and GATE 2025 against official PDFs and answer keys without collapsing multi-session papers. | M2 | ORIGINAL_REQUEST §R1 |
| 2 | Shared Pipeline Generic Repair | Eliminate hardcoded question-specific patches, repair option delimiter inflation, and bind unreferenced option crops in JSON without question-specific conditionals. | M1 | ORIGINAL_REQUEST §R3 |
| 3 | Shared Renderer Generic Repair | Fix Greek letter normalization trailing spaces in `LatexRenderer.tsx`, relax regexes for subscripts/superscripts, and implement markdown table parsing in `StructuredContentRenderer.tsx` / `TextRenderer`. | M1 | ORIGINAL_REQUEST §R3 |
| 4 | Mandatory Regression Verifications | Verify GATE 2025 AE Q28, AE Q39, AE Q6, GATE 2025 DA Q6, and GATE 2024 DA questions (Q4, Q9, Q16, Q38/41, Q55) for zero regressions. | M1, M2 | ORIGINAL_REQUEST §R4 |
| 5 | 16-Dimension Forensic Verification | Full-stack verification across Dimensions A through P for all 76 units (5,344 questions) covering inventory, text, math, tables, figures, watermarks, options, keys, and UI. | M2 | ORIGINAL_REQUEST §R2 |
| 6 | Master Matrix & Paper Audits | Generate `docs/audits/GATE_CORPUS_MASTER_MATRIX.csv` (34 columns, 76 rows, 5-value statuses) and 76 individual markdown reports in `docs/audits/gate-2024/` and `docs/audits/gate-2025/`. | M2 | ORIGINAL_REQUEST §R5 |
| 7 | Corpus Synthesis Reports | Produce comprehensive synthesis reports `docs/audits/GATE_2024_COMPLETE_VERIFICATION.md`, `docs/audits/GATE_2025_COMPLETE_VERIFICATION.md`, and `docs/audits/GATE_CORPUS_COMPLETE_VERIFICATION.md`. | M3 | ORIGINAL_REQUEST §R5 |
| 8 | Regression Suite & Build Assurance | Ensure 100% pass across all test suites (`npm test`) and clean TypeScript build (`npm run build`). | M1, M3 | ORIGINAL_REQUEST §Acceptance |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Shared Pipeline & Renderer Generic Repairs | Generic fixes in `LatexRenderer.tsx`, `StructuredContentRenderer.tsx`, and `scripts/gate_forensic_pipeline.py`. Elimination of hardcoded patches, unreferenced asset binding, and verification of key regressions (AE Q28, Q39, Q6, DA). | none | PLANNED |
| M2 | 76-Unit 16-Dimension Audit & Deliverables | Automated 16-dimension forensic audit across all 76 units. Generation of `docs/audits/GATE_CORPUS_MASTER_MATRIX.csv` and all 76 individual markdown audits in `docs/audits/gate-2024/` and `docs/audits/gate-2025/`. | M1 | PLANNED |
| M3 | Corpus Synthesis Reports & Final Hardening | Generation of the 3 synthesis reports (`GATE_2024_COMPLETE_VERIFICATION.md`, `GATE_2025_COMPLETE_VERIFICATION.md`, `GATE_CORPUS_COMPLETE_VERIFICATION.md`). Final full-suite testing (`npm test`) and production build verification (`npm run build`). | M2 | PLANNED |

## Interface Contracts
### Extraction Pipeline (`scripts/`) ↔ Data Store (`web/src/data/exams/`)
- Output JSON format: `ExamPaper` (`id`, `title`, `year`, `discipline`, `shift`, `totalQuestions`, `totalMarks`, `durationMinutes`, `sections`, `questions`, etc.).
- Question format: `CompetitiveQuestion` (`id`, `questionNumber`, `type`, `section`, `marks`, `negativeMarks`, `questionText`, `options`, `diagramUrl`, `optionImages`, `correctAnswer`, `correctRange`, `contentBlocks`, etc.).
- Image asset convention: `web/public/exam-assets/gate/<year>/<paper_slug>/q<num>_<type>.png`.

### Data Store (`web/src/data/exams/`) ↔ Frontend Renderers (`web/src/components/`)
- Content blocks: `ContentBlock[]` (`text`, `math`, `table`, `image`, `code`).
- Table block: `{ type: 'table', headers: string[], rows: string[][], caption?: string }`.
- Fallback text: Markdown string with inline math `\(...\)` or `$...$`, display math `\[...\]` or `$$...$$`, and markdown tables `| Col 1 | Col 2 |`.

## Code Layout
- `web/src/components/LatexRenderer.tsx`: Core KaTeX and mathematical token parser.
- `web/src/components/StructuredContentRenderer.tsx`: Block-level structured and fallback content renderer.
- `web/src/data/exams/`: 76 JSON files (`gate-2024-*.json`, `gate-2025-*.json`).
- `web/src/data/exams/gateForensicFidelity.test.ts`: Automated regression tests for forensic fidelity.
- `scripts/gate_forensic_pipeline.py`: Shared PDF ingestion, extraction, and formatting pipeline.
- `docs/audits/`: Audit artifacts directory.
  - `docs/audits/GATE_CORPUS_MASTER_MATRIX.csv`
  - `docs/audits/gate-2024/<PAPER>.md`
  - `docs/audits/gate-2025/<PAPER>.md`
  - `docs/audits/GATE_2024_COMPLETE_VERIFICATION.md`
  - `docs/audits/GATE_2025_COMPLETE_VERIFICATION.md`
  - `docs/audits/GATE_CORPUS_COMPLETE_VERIFICATION.md`
