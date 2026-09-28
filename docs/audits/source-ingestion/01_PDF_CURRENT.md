# SOURCE 01 — PDF DOCUMENT: FORENSIC DISCOVERY REPORT
**MOCK.AI Source Ingestion Algorithm Discovery**  
**Date**: 2026-09-28  
**Scope**: In-depth trace of PDF handling in Mock.AI (User Ingestion vs Official Offline Pipeline).  
**Integrity Mode**: Read-Only Audit (Zero Production Code Changes).

---

## 1. Executive Summary: The Dual-Engine PDF Reality

In Mock.AI, the term "PDF Processing" refers to two completely decoupled implementations that share almost zero code:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TWO DISCONNECTED ENGINES                        │
├───────────────────────────────────┬────────────────────────────────────┤
│ 1. USER MOCK TEST INGESTION       │ 2. OFFICIAL GATE BATCH PIPELINE    │
│    (web/src/App.tsx)              │    (scripts/gate_forensic_pipeline)│
├───────────────────────────────────┼────────────────────────────────────┤
│ • 100% Client-side browser        │ • Offline Python batch script      │
│ • No PDF parsing library!         │ • PyMuPDF (fitz)                   │
│ • Sends raw base64 PDF to Gemini  │ • Slices word bboxes & drawings    │
│ • Zero asset/diagram extraction   │ • Crops diagram and option PNGs    │
│ • Strips all table structures     │ • Reconstructs markdown tables     │
│ • Generates Question[] (4-opt)    │ • Generates CompetitiveQuestion[]  │
│ • Saves to browser localStorage   │ • Saves to git-tracked JSON files  │
└───────────────────────────────────┴────────────────────────────────────┘
```

When an end-user clicks "PDF Document" in the Create Mock Test modal, **the advanced Python pipeline is never executed**. The user's browser simply encodes the PDF to a Base64 string and forwards it to Google Gemini 2.5 Flash via a direct client-side HTTP request.

---

## 2. Complete Technical Pipeline Trace (User Ingestion)

```
USER INPUT (File Picker)
    ↓
UI COMPONENT (`SourceSelectorModal.tsx`)
    ↓
VALIDATION (`accept="application/pdf"`)
    ↓
CAPTURE (`FileReader.readAsDataURL(file)`)
    ↓
DISPATCH (`App.tsx:startProcessingFile()`)
    ↓
CLIENT SERVICE (`aiService.ts:extractFromBase64File()`)
    ↓
ADAPTER (`geminiAdapter.ts:extractFromBase64File()`)
    ↓
REMOTE API (`POST https://generativelanguage.googleapis.com/...:generateContent`)
    ↓
REMOTE PARSING & UNDERSTANDING (Gemini Vision Multimodal LLM)
    ↓
NORMALIZATION (`adapterHelpers.ts:parseQuestionsJson()`)
    ↓
QUESTION GENERATION (`Question[]` array coerced to 4 options)
    ↓
CURATION (`EditorScreen.tsx`)
    ↓
PERSISTENCE (`storage.ts:saveTest()` -> `localStorage['mockai_tests']`)
    ↓
RENDERER (`TestPlayerScreen.tsx` -> `LatexRenderer.tsx`)
```

---

## 3. Detailed Component Breakdown

### 3.1 UI Upload Component
- **File**: `web/src/components/SourceSelectorModal.tsx`
- **Lines**: 46–52, 149–153, 200–202
- **Trigger**: User clicks the "PDF Document" button.
- **Implementation**:
  ```tsx
  <input
    type="file"
    ref={pdfInputRef}
    accept="application/pdf"
    className="hidden"
    onChange={(e) => handleFileUpload(e, 'PDF')}
  />
  ```
- **Handler**:
  ```tsx
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: InputSourceType) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      onSelectSource(type, {
        file,
        base64: reader.result as string,
        name: file.name,
      });
      onClose();
    };
    reader.readAsDataURL(file);
  };
  ```

### 3.2 Dispatch & State Management
- **File**: `web/src/App.tsx`
- **Lines**: 435–438, 446–463
- **Execution**:
  ```tsx
  const startProcessingFile = async (base64: string, mimeType: string, fileName: string) => {
    setProcessingStatus(`Analyzing and extracting questions from ${fileName}...`);
    setProcessingError(null);
    navigateTo('processing');

    try {
      const questions = await aiService.extractFromBase64File(base64, mimeType, fileName);
      setEditorInitialData({
        title: fileName.replace(/\.[^/.]+$/, '') || 'Extracted Test',
        category: mimeType.includes('pdf') ? 'PDF Study' : 'Document',
        questions,
        existingTest: null,
      });
      navigateTo('editor');
    } catch (err: any) {
      setProcessingError(err.message || 'Failed to extract questions from file.');
    }
  };
  ```

### 3.3 Remote API Inference Call
- **File**: `web/src/services/aiService.ts` (lines 136–207) and `web/src/services/ai/adapters/geminiAdapter.ts` (lines 141–193)
- **Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
- **Payload Construction**:
  ```json
  {
    "contents": [
      {
        "parts": [
          {
            "inline_data": {
              "mime_type": "application/pdf",
              "data": "<BASE64_STRING_WITHOUT_PREFIX>"
            }
          },
          {
            "text": "Analyze this image or document and extract all exam questions or generate conceptual MCQs from it.\n[EXTRACTION_SYSTEM_PROMPT]"
          }
        ]
      }
    ],
    "generationConfig": {
      "response_mime_type": "application/json",
      "temperature": 0.1,
      "maxOutputTokens": 8192
    }
  }
  ```

### 3.4 Prompt Definition
- **File**: `web/src/services/ai/adapters/adapterHelpers.ts` (lines 3–32)
- **Prompt**:
  ```text
  You are a precise MCQ exam question extractor and creator for competitive exams.
  Analyze the provided content and generate high-quality multiple choice questions.

  Return ONLY a valid JSON object with this exact structure:
  {
    "questions": [
      {
        "questionText": "Complete question text here (use LaTeX $...$ or $$...$$ for math formulas)",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correctAnswerIndex": 0,
        "topic": "Topic Name",
        "explanation": "Detailed step-by-step reasoning"
      }
    ]
  }

  STRICT RULES:
  - correctAnswerIndex is zero-based: 0=A, 1=B, 2=C, 3=D
  - options array MUST ALWAYS contain exactly 4 distinct strings
  - If math or chemical equations exist, format them with LaTeX $...$
  - Focus on conceptual depth, application, and competitive rigor
  - Do NOT include any markdown formatting like ```json outside the JSON
  ```

---

## 4. Why the User Ingestion Engine Cannot Preserve Complex Exam PDFs

When tested against authentic competitive exam PDFs (e.g. GATE or JEE Advanced):

| PDF Requirement | Official Pipeline (`gate_forensic_pipeline.py`) | User Ingestion (`aiService.ts`) | Failure Mode in User Ingestion |
|---|---|---|---|
| **Text Extraction** | PyMuPDF extracts font spans, bboxes, and Unicode. | Gemini Vision transcribes text visually. | Reading order scrambled in multi-column layouts. |
| **Math & Formulas** | Detects horizontal lines as fraction bars; regex indices. | Gemini generates LaTeX `$..$` in prompt. | Complex exponents or subscripts often flattened. |
| **Diagrams & Circuits** | PyMuPDF crops image/vector bounding boxes to PNG. | **None**. | **All figures are lost**. Questions referencing figures become unsolvable. |
| **Tables** | Reconstructs 2D cell grids into Markdown tables. | Emits plain text. | Tables become flattened text strings with commas or pipes. |
| **Options** | Extracts A, B, C, D text and crops visual option nets. | Forces 4 string options. | Visual options (graphs, circuits) are completely discarded. |
| **Question Types** | Identifies MCQ, MSQ, NAT from marking scheme. | Coerces to single MCQ. | MSQ multi-answers and NAT numerical ranges are destroyed. |
| **Answer Key** | Merges official master answer key CSV. | Gemini guesses answers. | Hallucinated answers; incorrect answers coerced to A. |

---

## 5. GATE PDF Special Forensic Case Studies

### Case 1: GATE 2025 AE Question 6 (Table Flattening)
- **Source PDF**: Contains a two-column matching problem: Column-I (Statements P, Q, R, S) vs Column-II (Responses 1, 2, 3, 4).
- **In User Ingestion**: Gemini generates `questionText` as a single paragraph:
  `"Column-I has statements made by Shanthala... P. This house is in a mess. 1. Alright... Q. I am not happy... 2. Well..."`
  Because `TestPlayerScreen.tsx` mounts `<LatexRenderer content={q.questionText} />` (which renders into a single `<span>` with `white-space: normal`), the entire table flattens into an unreadable wall of text.
- **In Official Pipeline**: `gate_forensic_pipeline.py` created a structured `ContentBlock` of type `table` with `headers: ['Column-I', 'Column-II']` and 4 distinct rows.

### Case 2: GATE 2025 AE Question 28 (Stress Tensor Mathematics)
- **Source PDF**: Contains Unicode tensor equations: $\sigma_{xx} = \sigma_{zz} = C_1 y; \sigma_{yy} = C_2 y; \tau_{xy} = \tau_{zx} = 0$.
- **In User Ingestion**: Gemini converts this into LaTeX `$\sigma_{xx} = \sigma_{zz} = C_1 y$`. However, if the user views the question in `EditorScreen`, `LatexRenderer.tsx`'s pre-normalization replaced `\sigma` with `\sigma ` (trailing space), breaking KaTeX matching for `\sigma _{xx}` and leaving raw braces `_{xx}` visible.
- **In Official Pipeline**: Handled via span-level regex and structured math blocks.

### Case 3: GATE 2025 AE Question 39 (Flight Velocity & Option Flattening)
- **Source PDF**: Question on flight velocity $V_g$ with 4 descriptive options explaining airplane speed variations.
- **In User Ingestion**: In `aiService.ts`, when options contain any math character, the pipeline wrapped the entire English sentence in `\(...\)`. In KaTeX math mode, spaces are ignored, collapsing:
  `\(V_g is equal to the speed corresponding to the maximum lift to drag ratio of the airplane.\)`
  into:
  `V_gisequaltothespeedcorrespondingtothemaximumlifttodragratiooftheairplane.`

---

## 6. Current Algorithm (Step-by-Step Sequence)

1. User clicks "PDF Document" in `SourceSelectorModal.tsx`.
2. Browser opens native OS file dialog filtering for `.pdf`.
3. Candidate selects a local PDF file.
4. `FileReader.readAsDataURL(file)` converts the binary file into a Base64 string on the client.
5. `App.tsx` sets `isSourceModalOpen = false`, sets `processingStatus`, and navigates to `'processing'`.
6. `aiService.extractFromBase64File()` extracts the Base64 payload.
7. System checks for a Gemini API key. If missing, it immediately aborts and returns 8 hardcoded physics questions.
8. If API key exists, browser issues a synchronous `POST` request to `generativelanguage.googleapis.com` containing the entire PDF Base64 string in `inline_data`.
9. Gemini 2.5 Flash processes the PDF and returns a raw JSON string.
10. `parseQuestionsJson()` strips markdown code fences and calls `JSON.parse()`.
11. Parser truncates or pads options to exactly 4, coerces missing answer indices to 0 (Option A), and attaches hardcoded `'VERIFIED'` and `0.95` trust scores.
12. `App.tsx` receives `Question[]`, initializes `editorInitialData`, and navigates to `'editor'`.
13. User inspects questions in `EditorScreen.tsx` and clicks "Save Test".
14. `storage.saveTest()` writes the test to browser `localStorage['mockai_tests']`.
15. `TestPlayerScreen.tsx` displays the test using `<LatexRenderer content={currentQuestion.questionText} />`.

---

## 7. Forensic Evaluation & Improvement Recommendations

| Dimension | Assessment |
|---|---|
| **Strengths** | Simple zero-dependency client integration; works without running a dedicated backend server for simple text documents. |
| **Weaknesses** | Cannot extract diagrams; flattens tables; truncates multi-page PDFs; crashes on large files (>20MB); forces all questions into 4-option single MCQs; loses all question numbering and sections. |
| **Root Causes** | Complete lack of a client-side or server-side PDF extraction engine (e.g. PDF.js, PyMuPDF, pdfplumber); total reliance on direct prompt-based vision inference. |
| **Missing Components** | PDF text span extraction, coordinate geometry parser, vector/raster image cropper, OCR engine for scanned papers, table grid segmenter, background queue. |
| **Security Risks** | OOM tab crash on large PDFs; memory expansion during Base64 encoding; direct browser exposure of Gemini API key. |
| **Data-Fidelity Risks** | Complete loss of visual assets, formulas, and tabular alignment; silent coercion of unparsed answers to Option A. |
