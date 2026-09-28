# SOURCE 09 — MANUAL ENTRY: FORENSIC DISCOVERY REPORT
**MOCK.AI Source Ingestion Algorithm Discovery**  
**Date**: 2026-09-28  
**Scope**: In-depth trace of manual question creation, form state management, `EditorScreen.tsx`, and validation constraints.  
**Integrity Mode**: Read-Only Audit (Zero Production Code Changes).

---

## 1. Executive Summary

Option 9 in the Create Mock Test modal (`SourceSelectorModal.tsx:110-116`) is:
> **Manual Entry** — *"Write or paste questions yourself"*

Our forensic code inspection reveals:
1. **Direct UI Bypass**: Unlike the other 9 sources, Manual Entry bypasses `aiService.ts` and the `ProcessingScreen`. It directly initializes `editorInitialData` with a single blank question template and transitions immediately to `EditorScreen.tsx`.
2. **Strict Single-Choice Restriction**: The manual editor is rigidly hardcoded to **4-option single-choice MCQs**. An educator cannot create True/False questions (2 options), Multiple Select Questions (MSQ with checkboxes), or Numerical Answer Type questions (NAT with numeric inputs).
3. **Zero Image / Asset Attachment**: There is **no image upload button or diagram attachment handle** in `EditorScreen.tsx`. A teacher writing an exam question cannot attach a geometry diagram, circuit schematic, or chemical structure.

---

## 2. Technical Pipeline Trace

```
USER ACTION (Click "Manual Entry" in SourceSelectorModal)
    ↓
DISPATCH (`App.tsx:418-434`):
  `setEditorInitialData({ title: 'Manual Mock Test', category: 'Custom', questions: [blankTemplate] })`
  `navigateTo('editor')`
    ↓
UI COMPONENT (`EditorScreen.tsx:1-483`)
    ↓
FORM STATE (`useState<Question[]>`)
    ↓
MANUAL EDITING:
  - Title & Category input
  - Question stem textarea
  - 4 Option input fields (Option A, B, C, D)
  - Radio button selector for `correctAnswerIndex` (0, 1, 2, 3)
  - Topic & Explanation textareas
  - Optional LaTeX Math Preview toggle (`LatexRenderer`)
    ↓
OPTIONAL AI ASSISTANCE: User taps "AI Fix All" (`onAiFixAll` -> `aiService.fixQuestions`)
    ↓
VALIDATION STATS:
  `validCount = questions.filter(q => q.questionText.trim() && q.options.every(opt => opt.trim()) && q.correctAnswerIndex >= 0).length`
    ↓
SAVE TRIGGER: User clicks "Save Test" (`onSave(test, andStart)`)
    ↓
PERSISTENCE (`App.tsx:handleSaveFromEditor` -> `storage.saveTest()` -> `localStorage['mockai_tests']`)
```

---

## 3. Forensic Code Inspection

### 3.1 Initial Dispatch in `web/src/App.tsx:418-434`
```typescript
    } else if (type === 'Manual') {
      setEditorInitialData({
        title: 'Manual Mock Test',
        category: 'Custom',
        questions: [
          {
            id: 'q-1',
            questionText: '',
            options: ['', '', '', ''],
            correctAnswerIndex: 0,
            topic: 'General',
            explanation: '',
          },
        ],
        existingTest: null,
      });
      navigateTo('editor');
    }
```

### 3.2 Form State Management (`web/src/screens/EditorScreen.tsx`)
```typescript
  const handleUpdateQuestion = (index: number, updated: Partial<Question>) => {
    setQuestions((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...updated };
      return copy;
    });
  };

  const handleUpdateOption = (qIndex: number, optIndex: number, value: string) => {
    setQuestions((prev) => {
      const copy = [...prev];
      const opts = [...copy[qIndex].options];
      opts[optIndex] = value;
      copy[qIndex] = { ...copy[qIndex], options: opts };
      return copy;
    });
  };

  const handleAddQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        id: `q-${Date.now()}`,
        questionText: '',
        options: ['', '', '', ''],
        correctAnswerIndex: 0,
        topic: category,
        explanation: '',
      },
    ]);
  };
```

---

## 4. Question Form Schema & Capability Audit

| Field | Editor UI Input | Supported? | Constraints / Deficiencies |
|---|---|:---:|---|
| **Question Stem** | `<textarea>` | **YES** | Raw text or LaTeX. Supports Math preview. |
| **Options** | 4 separate `<input>` fields | **STRICT 4 ONLY** | Cannot add a 5th option; cannot remove options for True/False. |
| **Correct Answer** | Radio buttons (0–3) | **SINGLE ONLY** | Cannot select multiple options (no MSQ support). |
| **Question Type** | None | **NO** | Hardcoded to single MCQ. |
| **Marks** | None | **NO** | Cannot configure marks per question (e.g. 2 marks, 1 mark). |
| **Negative Marks** | None | **NO** | Cannot configure negative marking penalty (e.g. -0.33, -0.66). |
| **Section** | Global category only | **NO** | Cannot partition exam into sections (e.g. Section A: Aptitude, Section B: Core). |
| **Image / Diagram** | None | **NO** | **No image uploader**. Cannot attach diagrams or figures to questions. |
| **Table Builder** | None | **NO** | User must manually type ASCII pipe tables (`| col 1 | col 2 |`). |
| **Explanation** | `<textarea>` | **YES** | Text only. |

---

## 5. Current Algorithm (Step-by-Step Sequence)

1. User clicks "Manual Entry" in `SourceSelectorModal.tsx`.
2. `App.tsx` creates `editorInitialData` with a single blank question (`q-1`).
3. App navigates to `'editor'` (`EditorScreen.tsx`).
4. User enters test title (e.g. `"Midterm Calculus Exam"`), category (`"Mathematics"`), and timer duration (default 60s per question).
5. User types the question stem, inputs 4 options, selects the correct answer radio button, and enters an explanation.
6. User can click "Add Question" to append additional questions.
7. User can click "AI Fix All":
   - Calls `aiService.fixQuestions(questions)`.
   - Sends the entire questions JSON to Gemini to audit answers and format formulas into LaTeX.
8. User clicks "Save Test".
9. `EditorScreen` verifies that `title.trim()` is non-empty and invokes `onSave(test, andStart)`.
10. `App.tsx:handleSaveFromEditor()` invokes `storage.saveTest(test)`.
11. Test is written to `localStorage['mockai_tests']`.

---

## 6. Forensic Evaluation & Improvement Recommendations

| Dimension | Assessment |
|---|---|
| **Strengths** | Responsive, fluid question editor with real-time KaTeX math preview and an optional "AI Fix All" audit button. |
| **Weaknesses** | Strictly limited to 4-option single MCQs; impossible to attach diagrams or visual figures; no multi-section support; no custom marking schemes; stored only in `localStorage`. |
| **Root Causes** | The UI was architected exclusively around the flat `Question` interface, ignoring `CompetitiveQuestion` and `ContentBlock`. |
| **Missing Components** | Image upload handle (with Supabase Storage upload); question type switcher (`MCQ`, `MSQ`, `NAT`, `Descriptive`); dynamic option adder/remover; section divider; visual table editor. |
| **Security Risks** | Stored XSS if raw HTML is typed into `questionText` and subsequently rendered by unescaped DOM nodes. |
| **Data-Fidelity Risks** | Educators cannot author authentic competitive exams (GATE, JEE, NEET) because MSQs, NATs, and diagrams are prohibited by the UI. |
