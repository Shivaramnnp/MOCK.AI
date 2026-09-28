# SOURCE 10 — JSON DATA: FORENSIC DISCOVERY REPORT
**MOCK.AI Source Ingestion Algorithm Discovery**  
**Date**: 2026-09-28  
**Scope**: In-depth trace of raw JSON ingestion, schema validation, normalization heuristics, and error reporting.  
**Integrity Mode**: Read-Only Audit (Zero Production Code Changes).

---

## 1. Executive Summary

Option 10 in the Create Mock Test modal (`SourceSelectorModal.tsx:117-124` and `InputModals.tsx:344-454`) is:
> **JSON Data** — *"Paste structured test JSON"*

Our forensic investigation reveals:
1. **Zero Formal Schema Validation**: The application does **not use Zod, Joi, Yup, Pydantic, or JSON Schema (Ajv)**. Validation consists merely of wrapping `JSON.parse(jsonText)` in a try/catch block.
2. **Aggressive Coercion & Silent Data Loss**: If a user pastes a rich JSON containing competitive exam metadata (`diagramUrl`, `contentBlocks`, `marks: 2`, `questionType: 'MSQ'`), `App.tsx:handleJsonSubmit()` silently strips all advanced fields and flattens the questions into the 4-option `Question` model.
3. **No Schema Versioning or Migrations**: There is no `$schema` header, version discriminator (`version: 1`), or migration logic to handle backward compatibility.

---

## 2. Technical Pipeline Trace

```
USER INPUT (Raw JSON text pasted into textarea)
    ↓
UI COMPONENT (`InputModals.tsx:JsonModal`)
    ↓
SYNTAX VALIDATION:
  `try { JSON.parse(jsonText); setError(null); onSubmit(jsonText); }`
  `catch { setError('Invalid JSON syntax. Please check for missing brackets or quotes.'); }`
    ↓
DISPATCH (`App.tsx:handleJsonSubmit(jsonText)`)
    ↓
DATA EXTRACTION:
  `const parsed = JSON.parse(jsonText);`
  `const questionsList = Array.isArray(parsed) ? parsed : parsed.questions || [];`
    ↓
NORMALIZATION MAPPING:
  `formatted: Question[] = questionsList.map((q, i) => ({`
  `  id: 'q-' + Date.now() + '-' + i,`
  `  questionText: q.questionText || 'Question ' + (i + 1),`
  `  options: Array.isArray(q.options) && q.options.length === 4 ? q.options : ['A', 'B', 'C', 'D'],`
  `  correctAnswerIndex: q.correctAnswerIndex ?? 0,`
  `  topic: q.topic || 'General',`
  `  explanation: q.explanation || ''`
  `}))`
    ↓
CURATION (`EditorScreen.tsx`)
    ↓
PERSISTENCE (`storage.ts:saveTest()` -> `localStorage['mockai_tests']`)
```

---

## 3. Forensic Code Inspection

### 3.1 Modal Component (`web/src/components/InputModals.tsx:351-454`)
The modal provides a sample template:
```json
{
  "title": "Sample Test",
  "questions": [
    {
      "questionText": "What is the SI unit of electric resistance?",
      "options": ["Ohm (Ω)", "Volt", "Ampere", "Coulomb"],
      "correctAnswerIndex": 0,
      "topic": "Current Electricity",
      "explanation": "Ohm is defined as 1 volt per ampere."
    }
  ]
}
```

### 3.2 Ingestion Handler (`web/src/App.tsx:591-612`)
```typescript
  const handleJsonSubmit = (jsonText: string) => {
    try {
      const parsed = JSON.parse(jsonText);
      const questionsList = Array.isArray(parsed) ? parsed : parsed.questions || [];
      const formatted: Question[] = questionsList.map((q: any, i: number) => ({
        id: `q-${Date.now()}-${i}`,
        questionText: q.questionText || `Question ${i + 1}`,
        options: Array.isArray(q.options) && q.options.length === 4 ? q.options : ['A', 'B', 'C', 'D'],
        correctAnswerIndex: q.correctAnswerIndex ?? 0,
        topic: q.topic || 'General',
        explanation: q.explanation || '',
      }));

      setEditorInitialData({
        title: parsed.title || 'Imported JSON Exam',
        category: parsed.category || 'Imported',
        questions: formatted,
        existingTest: null,
      });
      navigateTo('editor');
    } catch (err: any) {
      showToast('Failed to parse test JSON format.', 'error');
    }
  };
```

---

## 4. Schema Comparison: What Happens When Pasting Official JSONs?

If a developer or teacher pastes an official Mock.AI competitive question JSON (from `web/src/data/exams/gate-2025-da.json`) into `JsonModal`:

| Field in Ingested JSON | Handled by `handleJsonSubmit`? | What Actually Happens |
|---|:---:|---|
| `questionText` | **YES** | Preserved. |
| `options` (4 strings) | **YES** | Preserved. |
| `options` (Empty for NAT) | **DESTROYED** | Coerced into dummy array: `['A', 'B', 'C', 'D']`! |
| `correctAnswerIndex` | **PARTIAL** | Coerced to `0` if `undefined` or null (corrupting NAT/MSQ). |
| `questionType` (`MSQ`/`NAT`) | **DROPPED** | Field is completely ignored; deleted. |
| `marks` (`1` or `2`) | **DROPPED** | Field is completely ignored; deleted. |
| `negativeMarks` | **DROPPED** | Field is completely ignored; deleted. |
| `contentBlocks` (Tables, Code) | **DROPPED** | Field is completely ignored; deleted. |
| `diagramUrl` (Figures) | **DROPPED** | Field is completely ignored; deleted. |
| `optionImages` (Visual options) | **DROPPED** | Field is completely ignored; deleted. |
| `answerRange` (NAT bounds) | **DROPPED** | Field is completely ignored; deleted. |

---

## 5. Current Algorithm (Step-by-Step Sequence)

1. User clicks "JSON Data" in `SourceSelectorModal.tsx`.
2. `JsonModal.tsx` opens.
3. User pastes raw JSON or clicks "Insert Sample Template".
4. User clicks "Import Questions".
5. `JsonModal` executes `JSON.parse(jsonText)`:
   - If invalid syntax: Displays error text `"Invalid JSON syntax. Please check for missing brackets or quotes."` and remains on modal.
   - If valid syntax: Invokes `onSubmit(jsonText)` and closes modal.
6. `App.tsx:handleJsonSubmit()` checks whether `parsed` is an array or has a `.questions` property.
7. Iterates through items:
   - Sets `id: q-${Date.now()}-${i}`.
   - Fallbacks `questionText` to `"Question ${i + 1}"`.
   - If `options` is not an array of exactly 4 strings, defaults to `['A', 'B', 'C', 'D']`.
   - If `correctAnswerIndex` is nullish, defaults to `0`.
8. Initializes `editorInitialData` with `title: parsed.title || 'Imported JSON Exam'`.
9. Navigates to `'editor'`.
10. User reviews and saves test to `localStorage['mockai_tests']`.

---

## 6. Forensic Evaluation & Improvement Recommendations

| Dimension | Assessment |
|---|---|
| **Strengths** | Fast programmatic import mechanism; includes an "Insert Sample Template" helper in the UI. |
| **Weaknesses** | Zero schema validation library (Zod/Ajv); no line-by-line syntax error diagnostics; strips all competitive exam fields (`contentBlocks`, `diagramUrl`, `marks`, `questionType`); corrupts NAT and MSQ questions into dummy MCQs. |
| **Root Causes** | Naive object mapping in `App.tsx` designed solely for the flat `Question` schema. |
| **Missing Components** | Zod/JSON-Schema validator with descriptive error paths (e.g. `questions[2].options must contain 4 items`); support for importing both `Question` and `CompetitiveQuestion` models; file import handle (`.json` file drag-and-drop). |
| **Security Risks** | Prototype pollution if malicious payloads contain `__proto__`; client-side denial of service if pasting multi-megabyte JSON strings. |
| **Data-Fidelity Risks** | Educators importing standard question banks lose all diagrams, tables, and scoring schemes silently. |
