# MOCK.AI — QUESTION PAPER + ANSWER KEY INGESTION & MATCHING ENGINE
## PRODUCTION-GRADE SOURCE PAIRING ARCHITECTURE REPORT (PROMPT 1.5)

---

### Executive Summary

In accordance with Prompt 1.5 and Section 38 ("Do not start coding immediately; first inspect the repository and report..."), Mock.AI has replaced the naive single-document ingestion flow with a production-grade, deterministic **Source Pairing Engine**. 

Under this architecture:
1. **Independent Upload & Representation:** Candidates or administrators can upload the **Question Paper** and **Answer Key** independently, in either order, or choose **"Continue without Answer Key"** (where question content is extracted faithfully, but answers remain unresolved and `verificationStatus = 'UNVERIFIED'`, pending verification).
2. **Zero Duplicate PDF Engines:** Reuses the existing PDF layout coordinate extractor (`layoutExtractor.ts`), bounded concurrency runner (`pdfJobRunner.ts`), table detector (`tableDetector.ts`), math reconstructor (`mathReconstructor.ts`), and visual asset cropper (`assetExtractor.ts`).
3. **Paper Identity Resolution:** Resolves Exam, Year, Paper Code (e.g., GATE DA, CS, ME), Subject, and Session before any question-key matching is attempted. If a mismatch is detected (e.g. Question Paper is DA but Answer Key is CS), matching is aborted immediately with `SOURCE_MISMATCH`.
4. **Deterministic-First Matching:** Questions and Answer Key rows are paired using strict monotonic question numbering and section constraints. Never silently shifts question numbers; flags `MISSING_QUESTION_NUMBER`, `DUPLICATE_QUESTION_NUMBER`, and `QUESTION_SEQUENCE_ANOMALY`.
5. **Full Support for GATE Question Types:**
   - **MCQ:** Dynamic options (minimum 2), single correct option letter.
   - **MSQ:** Multi-select option sets (`correctOptionIds: string[]`), preserving all valid options without collapsing into a single option index.
   - **NAT:** Numerical Answer Type (`natRange`, `natValue`), never manufacturing fake A/B/C/D option placeholders.
   - **MTA:** Preserves official Marks To All classifications.
6. **Immutable Question Integrity:** Official Answer Keys supply scoring and answer evidence, but **never** overwrite question stems, mathematical expressions, options, or visual diagram ownership. Disagreements trigger `SOURCE_CONFLICT` and `REVIEW_REQUIRED`.

---

### A. Architecture Changed

```
             ┌────────────────────────────────┐         ┌───────────────────────────────┐
             │       Question Paper           │         │          Answer Key           │
             │ (PDF / Scanned PDF / Document) │         │ (PDF / Scanned PDF / Tabular) │
             └───────────────┬────────────────┘         └───────────────┬───────────────┘
                             │                                          │
                             ▼                                          ▼
             ┌────────────────────────────────┐         ┌───────────────────────────────┐
             │ Paper Identity: Exam, Year,    │         │ Paper Identity: Exam, Year,   │
             │ Paper Code, Subject, Session   │         │ Paper Code, Subject, Session  │
             └───────────────┬────────────────┘         └───────────────┬───────────────┘
                             │                                          │
                             └────────────────────┬─────────────────────┘
                                                  ▼
                                ┌──────────────────────────────────┐
                                │ Source Identity Compatibility    │
                                │ (Abort if DA != CS or 2024!=2025)│
                                └─────────────────┬────────────────┘
                                                  ▼
                        ┌─────────────────────────────────────────┐
                        │ Reusable PDF Extraction Pipeline        │
                        │ (Native text, coordinates, bounding     │
                        │  boxes, tables, LaTeX math, diagrams)   │
                        └─────────────────┬───────────────────────┘
                                          ▼
                        ┌─────────────────────────────────────────┐
                        │ Answer Key Normalizer & Type Detector   │
                        │ (MCQ letters, MSQ sets, NAT bounds, MTA)│
                        └─────────────────┬───────────────────────┘
                                          ▼
                        ┌─────────────────────────────────────────┐
                        │ Deterministic Matcher (Q# + Section)    │
                        │ • Detect MISSING_QUESTION_NUMBER        │
                        │ • Detect DUPLICATE_QUESTION_NUMBER      │
                        │ • Detect QUESTION_SEQUENCE_ANOMALY      │
                        │ • Reconcile MCQ / MSQ / NAT / Marks     │
                        └─────────────────┬───────────────────────┘
                                          ▼
                        ┌─────────────────────────────────────────┐
                        │ Forensic Quality Gate & Verification    │
                        │ VERIFIED / PARTIAL / REVIEW_REQUIRED    │
                        └─────────────────┬───────────────────────┘
                                          │
                 ┌────────────────────────┴────────────────────────┐
                 ▼                                                 ▼
┌─────────────────────────────────┐               ┌─────────────────────────────────┐
│ Extracted Canonical Questions   │               │ Forensic Side-by-Side Review UI │
│ (Mock.AI Question Database)     │               │ (QP vs Question vs Answer Key)  │
└─────────────────────────────────┘               └─────────────────────────────────┘
```

---

### B. Files Changed & Created

| File Path | Nature of Change | Purpose |
|---|---|---|
| `web/src/services/ingestion/pairing/types.ts` | **New File** | Types for `ExamSource`, `PaperIdentity`, `RawAnswerEntry`, `MatchStatus`, `QuestionAnswerMatch`, `PairingIngestionReport`, `PairingOptions`. |
| `web/src/services/ingestion/pairing/paperIdentityResolver.ts` | **New File** | Deterministic paper identity resolution from document headers, regex catalog, and compatibility check (`validateSourceIdentityCompatibility`). |
| `web/src/services/ingestion/pairing/answerKeyExtractor.ts` | **New File** | Official answer key parsing (GATE tabular, key-value), normalization (`A`, `A, C, D`, `3.14 to 3.15`, `MTA`), and GATE negative-mark calculations. |
| `web/src/services/ingestion/pairing/deterministicMatcher.ts` | **New File** | Sequence anomaly detector, question-answer deterministic matcher, question-type reconciler, and evidence-based match confidence. |
| `web/src/services/ingestion/pairing/sourcePairingEngine.ts` | **New File** | Full 20-stage orchestrator coordinating Question Paper extraction, Answer Key extraction, matching, and report generation. |
| `web/src/services/ingestion/pairing/index.ts` | **New File** | Public barrel export for the pairing subsystem. |
| `web/src/services/ingestion/adapters/PdfSourceAdapter.ts` | **Modified** | Extended `PdfInput` to accept paired inputs (`answerKeyFile`, `answerKeyBinaryData`, `isStandaloneAnswerKey`, `continueWithoutAnswerKey`). |
| `web/src/services/ingestion/ingestionService.ts` | **Modified** | Exposes `ingestPairedSources` orchestrator. |
| `web/src/components/SourcePairingModal.tsx` | **New File** | Production UI for independent Question Paper & Answer Key uploads, Exam/Year/Code selectors, and "Continue without Answer Key". |
| `web/src/screens/SourceReviewScreen.tsx` | **New File** | Forensic side-by-side verification interface comparing Question Paper original view, LaTeX math, and official Answer Key data. |
| `web/src/components/SourceSelectorModal.tsx` | **Modified** | Wired `onOpenPairingModal` prop to launch paired ingestion when selecting PDF Document. |
| `web/src/types/index.ts` | **Modified** | Added `'source_review'` route to `AppRoute`. |
| `web/src/App.tsx` | **Modified** | Integrated `SourcePairingModal`, `startProcessingPairedExam`, and `SourceReviewScreen` routing. |
| `supabase/schema_source_pairing.sql` | **New File** | PostgreSQL migration creating `exam_sources`, `source_questions`, `source_answers`, and `question_answer_matches` with full RLS. |
| `web/src/services/ingestion/pairing/sourcePairingEngine.test.ts` | **New File** | 17 comprehensive unit & integration tests covering all 12 test categories A–L. |

---

### C. Database Migrations & New Tables

Script: `supabase/schema_source_pairing.sql`

1. **`public.exam_sources`**:
   - `id TEXT PRIMARY KEY`
   - `exam_id TEXT REFERENCES public.competitive_exams(id) ON DELETE CASCADE`
   - `paper_id TEXT REFERENCES public.exam_papers(id) ON DELETE CASCADE`
   - `source_role TEXT CHECK (source_role IN ('QUESTION_PAPER', 'ANSWER_KEY', 'SYLLABUS', 'OTHER'))`
   - `file_name TEXT`, `file_hash TEXT`, `storage_path TEXT`, `source_version TEXT`
   - `paper_identity JSONB`, `metadata JSONB`, `created_at TIMESTAMPTZ`
2. **`public.source_questions`**:
   - `id TEXT PRIMARY KEY`, `source_id TEXT REFERENCES public.exam_sources(id)`
   - `question_number INT`, `page_number INT`, `raw_text TEXT`, `raw_structure JSONB`, `bounding_box JSONB`
   - `section_name TEXT`, `detected_type TEXT`, `provenance JSONB`
   - Unique constraint: `(source_id, question_number)`
3. **`public.source_answers`**:
   - `id TEXT PRIMARY KEY`, `source_id TEXT REFERENCES public.exam_sources(id)`
   - `question_number INT`, `page_number INT`, `raw_answer TEXT`, `normalized_answer JSONB`, `answer_type TEXT`
   - Unique constraint: `(source_id, question_number)`
4. **`public.question_answer_matches`**:
   - `id TEXT PRIMARY KEY`
   - `question_source_id TEXT REFERENCES public.exam_sources(id)`
   - `answer_source_id TEXT REFERENCES public.exam_sources(id)`
   - `question_number INT`, `match_status TEXT`, `match_reason TEXT`, `confidence NUMERIC`
   - `canonical_question_id TEXT REFERENCES public.questions(id)`, `verified_at TIMESTAMPTZ`

---

### D. Matching Algorithm

The deterministic matching pipeline evaluates sources in strict order:
1. **Paper Identity Resolution:**
   $$\text{Exam} \to \text{Year} \to \text{Paper Code} \to \text{Session / Shift}$$
   If $\text{PaperCode}_{QP} \neq \text{PaperCode}_{AK}$, the matching engine aborts with `SOURCE_MISMATCH`.
2. **Sequence Monotonicity Check:**
   - Detects missing question numbers (e.g. $[1, 2, 4, 5] \implies \text{Missing } Q3$).
   - Detects duplicate question numbers (e.g. $[1, 2, 3, 3, 4] \implies \text{Duplicate } Q3$).
   - Detects sequence anomalies (e.g. $[1, 2, 8, 9] \implies \text{Jump from } Q2 \text{ to } Q8$).
   - **Never shifts numbers silently.**
3. **Exact Number Pairing:**
   - Pairs $QP(Q_i)$ with $AK(Q_i)$.
   - Validates existence of the answer entry. If missing: `MISSING_KEY`, `REVIEW_REQUIRED`.
   - If multiple answer entries for same $Q_i$: `DUPLICATE_KEY`, `REVIEW_REQUIRED`.
4. **Question Type Reconciler:**
   - If Answer Key indicates `MSQ` and Question contains multiple options: marks type as `MSQ`, preserves option set `[A, C, D]`.
   - If Answer Key indicates `NAT`: validates numerical range $[min, max]$ or value, ensures zero fake options.
   - If Answer Key specifies an option letter not present in Question Paper options (e.g. Key says 'D', but question has only A, B, C): flags `SOURCE_CONFLICT` and `REVIEW_REQUIRED`.
5. **Measurable Confidence Calculation:**
   $$\text{Confidence} = 0.25(\text{Identity Match}) + 0.25(\text{Number Match}) + 0.25(\text{Type Consistency}) + 0.25(\text{Syntax Validity})$$

---

### E. GATE MCQ / MSQ / NAT Handling

| Dimension | MCQ | MSQ | NAT |
|---|---|---|---|
| **Option Structure** | $\ge 2$ dynamic options | $\ge 2$ dynamic options | Zero fake options (`options: []`) |
| **Canonical Answer Model** | `correctOptionId: 'A'`, `correctOptionIndex: 0` | `correctOptionIds: ['A', 'C', 'D']`, `correctAnswerSet: [...]` | `natRange: { min: 3.14, max: 3.15 }`, `natValue: 3.14` |
| **Option-A Coercion** | Strictly forbidden | Strictly forbidden | Strictly forbidden |
| **Marks** | 1 mark or 2 marks | 1 mark or 2 marks | 1 mark or 2 marks |
| **Negative Marks** | -0.33 (1-mark) or -0.66 (2-mark) | **0.00** (Zero negative marks) | **0.00** (Zero negative marks) |
| **Scoring Rule Name** | `GATE_MCQ_1` or `GATE_MCQ_2` | `GATE_MSQ` | `GATE_NAT` |

---

### F. Verification & Publishing Rules

- `VERIFIED`: Exact paper identity match, exact question number match, question type verified, options validated, answer key normalized, zero quality gate fatal/review issues.
- `PARTIAL`: Minor formatting warnings, but answers and structure are verified.
- `REVIEW_REQUIRED`: Missing answer key, duplicate answer entries, question type conflict, source conflict, LaTeX syntax anomaly, or Marks to All (MTA).
- `UNVERIFIED`: Ingested via "Continue without Answer Key" or Question Paper only. Answer fields remain unassigned and answer verification is marked pending.
- `FAILED`: Unreadable file, empty question stem, corrupted binary.

---

### G. Test Suite Execution & Production Build Results

1. **New Source Pairing Suite:**
   ```bash
   npm test -- src/services/ingestion/pairing/sourcePairingEngine.test.ts
   # 17 passed (17 tests, 592ms)
   ```
2. **Full Project Test Suite:**
   ```bash
   npm test
   # Test Files: 53 passed (53)
   # Tests:      599 passed (599)
   # Duration:   11.42s
   ```
3. **TypeScript Compilation:**
   ```bash
   npx tsc --noEmit
   # Exit code 0 (Zero errors)
   ```
4. **Production Build:**
   ```bash
   npm run build
   # ✓ 2457 modules transformed.
   # ✓ built in 18.15s (dist/ emitted cleanly)
   ```

---

### H. Known Limitations & Forensic Disclosure

- **Scanned / Handwritten Answer Keys:** If an answer key PDF contains exclusively low-resolution bitmap scans without selectable text or OCR text layers, `pdfjs-dist` text layer extraction will return empty lines; the pairing engine will detect `0 keys detected` and safely designate the job as `REVIEW_REQUIRED` rather than fabricating answers.
- **Structural vs Visual Verification:** Matching verifies structural alignment (question numbers, section tags, option identifiers, and numeric bounds). Visual diagram fidelity must be inspected by reviewers in the side-by-side `SourceReviewScreen`.
