# MOCK.AI — SOURCE INGESTION VALIDATION & ERROR HANDLING
**Forensic Technical Discovery & Analysis**  
**Date**: 2026-09-28  
**Scope**: Validation logic, parsing defenses, fallback routines, and failure cascades across all 10 sources.  
**Integrity Mode**: Read-Only Audit (Zero Production Code Changes).

---

## 1. Validation Coverage Matrix Across All 10 Sources

| Forensic Validation Criterion | Status | Current Code Implementation | Failure Mode When Violated |
|---|:---:|---|---|
| **Question Count Validation** | **FAILED** | User selects `count: 8`. LLM may return 3 or 12 questions. Code accepts whatever length `parsed.questions` contains (`aiService.ts:313`). | User gets fewer or more questions than requested; no warning displayed. |
| **Question Number Sequence** | **NOT CHECKED** | Question index is assigned sequentially by `.map((q, idx) => ...)` regardless of source numbering. | Source question numbers (e.g. Q14, Q28 in PDF) are completely erased and re-indexed from 1. |
| **Option Count Enforcement** | **CORRUPTED** | In `parseQuestionsJson()`: If `< 4`, pads with dummy strings (`"Option C"`, `"Option D"`). If `> 4`, chops off extra options (`options.slice(0, 4)`). | Options with 2 answers (True/False) get hallucinated filler options; questions with 5 options lose option E silently. |
| **Question Type Validation** | **NOT CHECKED** | Hardcoded assumption that all questions are single-choice MCQs. MSQs and NATs are forced into 0..3 indices. | MSQ multi-select answers are coerced to the first index; NAT numeric ranges become `"Option A"` and index 0. |
| **Answer Key Correctness** | **CORRUPTED** | `let correctIndex = Number(q.correctAnswerIndex); if (isNaN(correctIndex) \|\| < 0 \|\| > 3) correctIndex = 0;` | If the LLM omits the answer or returns invalid text, **Option A is silently marked as correct**! |
| **Marks & Scoring Validation** | **NOT CHECKED** | No marks metadata exists in `Question` schema. | All questions default to 1 mark. 2-mark questions and negative penalties are completely lost. |
| **Duplicate Question Detection** | **NOT CHECKED** | Zero duplicate detection in `aiService.ts`, `App.tsx`, or `EditorScreen.tsx`. | LLM often generates identical or near-identical questions on small inputs; all are accepted. |
| **Missing Questions Detection** | **NOT CHECKED** | System has no ground-truth awareness of how many questions were in the source document. | If a 65-question exam PDF only has 10 questions extracted before LLM token limit, 55 questions are silently dropped. |
| **Empty Question Handling** | **FALLBACK DUMMY** | If `q.questionText` is empty, defaults to `"Question ${idx + 1}"`. | Candidate is presented with blank question prompts with dummy text. |
| **Malformed Math Validation** | **NOT CHECKED** | Math strings are passed directly to `LatexRenderer`. In `LatexRenderer.tsx:84-120`, if KaTeX throws, it returns a red error badge or raw string. | Broken formulas display KaTeX parse error messages directly in the student's exam interface. |
| **Missing Image Detection** | **NOT CHECKED** | Ingestion pipeline does not extract or link images for user sources. | Questions referencing figures ("Refer to the diagram above...") have no image attached. |
| **Orphan Asset Detection** | **NOT APPLICABLE** | User ingestion does not save image assets. | N/A for user ingestion (assets are dropped). |
| **Table Structure Validation** | **NOT CHECKED** | Tables are treated as unstructured plain text. | Multi-column matching tables become collapsed text strings with pipes and dashes. |
| **Source Provenance / Citation** | **DEAD CODE** | `Citation` interface exists in `types/index.ts` but is never instantiated or written by `aiService.ts`. | Student has zero provenance back to PDF page, video timestamp, or source paragraph. |

---

## 2. In-Depth Audit of Response Normalization (`parseQuestionsJson`)

In `web/src/services/ai/adapters/adapterHelpers.ts:28-59` and `web/src/services/aiService.ts:310-341`:

```typescript
export function parseQuestionsJson(raw: string): Question[] {
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  const parsed = JSON.parse(cleaned);
  const list: any[] = Array.isArray(parsed) ? parsed : parsed.questions || [];

  return list.map((q: any, idx: number) => {
    let options: string[] = Array.isArray(q.options) ? q.options.map(String) : [];
    
    // DEFECT 1: Silent dummy padding
    while (options.length < 4) {
      options.push(`Option ${String.fromCharCode(65 + options.length)}`);
    }
    // DEFECT 2: Silent amputation of 5th/6th options
    if (options.length > 4) {
      options = options.slice(0, 4);
    }

    // DEFECT 3: Silent coercion of invalid answers to Option A (0)
    let correctIndex = Number(q.correctAnswerIndex);
    if (isNaN(correctIndex) || correctIndex < 0 || correctIndex > 3) {
      correctIndex = 0;
    }

    return {
      id: `q-${Date.now()}-${idx}`,
      questionText: q.questionText || `Question ${idx + 1}`,
      options,
      correctAnswerIndex: correctIndex,
      topic: q.topic || 'General',
      explanation: q.explanation || 'Refer to fundamental principles for step-by-step verification.',
      verificationStatus: 'VERIFIED', // DEFECT 4: Fabricated verification status
      trustScore: 0.95,              // DEFECT 5: Fabricated trust score
      verifiedAt: Date.now(),
    };
  });
}
```

### Analysis of the Silent Corruption Cascade
1. **The "Option A" Bias**: If the LLM outputs `"correctAnswer": "B"`, or outputs a letter instead of an integer index, `Number("B")` evaluates to `NaN`. The fallback condition `isNaN(correctIndex)` executes and forces `correctIndex = 0` (Option A). As a result, questions where the answer key was unrecognized are **coerced into Option A without warning the user**.
2. **Phantom Options**: If an input question is a binary choice (e.g. "Is the process adiabatic? A) Yes B) No"), the parser pads it with `["Yes", "No", "Option C", "Option D"]`.
3. **Loss of High-Option Questions**: For civil services, GMAT, or European exams with 5 options (A, B, C, D, E), Option E is silently deleted. If Option E was the correct answer, the question becomes unsolvable.

---

## 3. Error Handling & Failure States by Pipeline Layer

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FAILURE ESCALATION FLOW                         │
└────────────────────────────────────────────────────────────────────────┘
  Input Error (Malformed file, huge file, invalid URL)
         │
         ▼
  [Layer 1: Browser UI / Modal]
    • Truncated validation (only checks if string is non-empty)
    • Docx handler crashes silently on PPTX
         │
         ▼
  [Layer 2: Async LLM Service]
    • Gemini throws 400 (file too large) or 403 (quota exceeded)
    • Catches error in try/catch block
         │
         ▼
  [Layer 3: Fallback Cascade]
    • Try Gemini Key 1 → fails
    • Try Groq Key 2 → fails
    • Fallback to `generateSmartLocalMock()`:
      SILENTLY INJECTS 8 UNRELATED HARDCODED PHYSICS QUESTIONS
         │
         ▼
  [Layer 4: User Interface State]
    • If fallback succeeds: User gets 8 unrelated physics questions!
    • If fallback throws: ProcessingScreen shows "Processing Failed" + Retry button.
```

### 3.1 What the User Actually Sees During Failures

1. **Missing or Expired API Keys**:  
   If the user has not configured a Gemini API key and no environment key exists, the application does **not** prompt the user to add an API key. Instead, it silently invokes `generateSmartLocalMock()`. The user thinks the AI extracted questions from their document, but in reality they are looking at static seed questions written months ago.
2. **Unsupported File Formats (`.pptx`)**:  
   If a student uploads a PowerPoint lecture (`.pptx`), `SourceSelectorModal.tsx` allows the selection because `accept` includes `.pptx`. However, `aiService.ts` passes the buffer to `mammoth` (which only supports `.docx`). Mammoth throws an exception:
   `"Failed to extract questions from Word document."`
   The user receives no explanation that PPTX is unsupported.
3. **Very Large PDFs (>20MB)**:  
   `FileReader.readAsDataURL` consumes ~2.5x the file size in memory for Base64 encoding. A 30MB PDF generates a ~40MB Base64 string. The browser freezes during string serialization, and `fetch()` to Gemini fails with HTTP 400 (`Request payload size exceeds the limit: 20MB`). The UI displays:
   `"Gemini HTTP 400: Request payload size exceeds limit"`
   No automatic document chunking or pagination is attempted.
4. **YouTube & Web URL Hallucinations**:  
   When a user provides a private YouTube link or a non-indexed webpage, the system never fails! Because it sends only the URL string to Gemini with instructions to "construct an exam based on this URL", Gemini hallucinates plausible questions based on words in the URL slug (e.g. `youtube.com/watch?v=xyz` or `domain.com/notes/optics`). The user receives fake questions with no indication that the actual content was never read.
