# SOURCE 02 — WORD / PPT: FORENSIC DISCOVERY REPORT
**MOCK.AI Source Ingestion Algorithm Discovery**  
**Date**: 2026-09-28  
**Scope**: In-depth trace of Microsoft Word (`.docx`) and PowerPoint (`.pptx`) ingestion.  
**Integrity Mode**: Read-Only Audit (Zero Production Code Changes).

---

## 1. Executive Summary: The DOCX vs PPTX Disparity

In the Create Mock Test modal (`SourceSelectorModal.tsx:54-60`), Option 2 is presented as:
> **Word / PPT** — *"Upload DOCX or PPTX notes"*

Our forensic code inspection reveals that:
1. **DOCX files** are processed via a lightweight client-side library (`mammoth`), which extracts raw text while discarding all formatting, tables, images, and math equations.
2. **PPTX files** are **completely broken and unsupported**. Although the file picker accepts `.pptx`, passing a PowerPoint file to `mammoth` triggers an unhandled exception, causing the entire ingestion process to fail.

---

## 2. Technical Pipeline Trace

### 2.1 DOCX Ingestion Pipeline
```
USER INPUT (.docx file)
    ↓
UI COMPONENT (`SourceSelectorModal.tsx`)
    ↓
VALIDATION (`accept=".docx,.pptx,..."`)
    ↓
CAPTURE (`File.prototype.arrayBuffer()`)
    ↓
DISPATCH (`App.tsx:startProcessingDocx()`)
    ↓
PARSER (`aiService.ts:extractTextFromDocx()` -> `mammoth.extractRawText()`)
    ↓
TEXT EXTRACTION (Raw text string without styles, tables, or images)
    ↓
TRUNCATION (`text.slice(0, 15000)`)
    ↓
PROMPT SYNTHESIS (`aiService.ts:extractFromText()`)
    ↓
REMOTE INFERENCE (`POST /generateContent` or Groq `POST /chat/completions`)
    ↓
NORMALIZATION (`adapterHelpers.ts:parseQuestionsJson()`)
    ↓
CURATION (`EditorScreen.tsx`)
    ↓
PERSISTENCE (`storage.ts:saveTest()` -> `localStorage['mockai_tests']`)
```

### 2.2 PPTX Ingestion Pipeline (Failure Trace)
```
USER INPUT (.pptx file)
    ↓
UI COMPONENT (`SourceSelectorModal.tsx`) -> Passes `.pptx`
    ↓
DISPATCH (`App.tsx:startProcessingDocx()`)
    ↓
PARSER (`aiService.ts:extractTextFromDocx()`)
    ↓
EXECUTION: `mammoth.extractRawText({ arrayBuffer })`
    ↓
ERROR: Mammoth looks for Word document relationships (`word/document.xml`).
       In a PPTX, slides are in `ppt/slides/slide1.xml`.
       Mammoth throws: "Could not find main document part in relationship" or returns empty string.
    ↓
EXCEPTION: `if (!extractedText.trim()) throw new Error('No readable text could be extracted...')`
    ↓
UI RESULT: ProcessingScreen displays "Failed to extract questions from Word document."
```

---

## 3. Detailed Component Breakdown

### 3.1 UI Upload Component
- **File**: `web/src/components/SourceSelectorModal.tsx`
- **Lines**: 54–60, 154–160, 203–204
- **Accept Filter**:
  ```tsx
  <input
    type="file"
    ref={docxInputRef}
    accept=".docx,.pptx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
    className="hidden"
    onChange={(e) => handleFileUpload(e, 'Docx')}
  />
  ```

### 3.2 Parsing Function
- **File**: `web/src/services/aiService.ts`
- **Lines**: 120–131
- **Code**:
  ```typescript
  async extractTextFromDocx(arrayBuffer: ArrayBuffer): Promise<string> {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value || '';
    } catch (err) {
      console.warn('Failed to parse DOCX using mammoth:', err);
      return '';
    }
  }
  ```

### 3.3 Text Slicing & Prompt Construction
- **File**: `web/src/services/aiService.ts`
- **Lines**: 67–77
- **Code**:
  ```typescript
  async extractFromText(text: string, title = 'Extracted Test'): Promise<Question[]> {
    const prompt = `
  Source Material Title: "${title}"
  Content:
  """
  ${text.slice(0, 15000)}
  """

  Extract and construct comprehensive multiple choice questions testing the key facts, principles, and definitions from this content.
  ${EXTRACTION_SYSTEM_PROMPT}
  `;
  ```

---

## 4. Object-by-Object Forensic Audit: What Data Is Preserved vs Lost?

### 4.1 Word Document (`.docx`) Objects

| Word Object | Mammoth Behavior in Mock.AI | Result in Question Model |
|---|---|---|
| **Paragraphs** | Extracted as text separated by double newlines (`\n\n`). | Preserved in text prompt. |
| **Runs & Inline Styles** | Bold (`<b>`), italics (`<i>`), underline (`<u>`) are **stripped**. | Lost. Text is flattened to unstyled ASCII. |
| **Headings & Hierarchy** | Heading styles (`Heading 1`, `Heading 2`) lose their structural tags. | Lost. Flattened into standard text lines. |
| **Tables** | Cells are concatenated as space-separated text; rows are separated by newlines. Header cells are merged with data cells. | **Table grid structure is destroyed**. |
| **Images & Photos** | Mammoth's `extractRawText()` **completely ignores embedded images** (`word/media/image*.png`). | **100% of images are dropped**. |
| **Equations (OMML / MathML)** | Word equation objects (`<m:oMath>`) are ignored or converted to plaintext strings with missing symbols. | Mathematical notation is corrupted. |
| **Lists (Bullet / Numbered)** | Bullet symbols are stripped; list item hierarchy is lost. | Flattened into continuous prose. |

### 4.2 PowerPoint Presentation (`.pptx`) Objects

| PowerPoint Object | Current Behavior in Mock.AI | Result |
|---|---|---|
| **Slide Shapes & Text Boxes** | `mammoth` cannot read `ppt/slides/`. | **Fatal Error**. Zero text extracted. |
| **Slide Notes** | Not inspected. | Lost. |
| **Slide Order / Sequence** | Not inspected. | Lost. |
| **Slide Images & Diagrams** | Not inspected. | Lost. |
| **SmartArt & Charts** | Not inspected. | Lost. |

---

## 5. Current Algorithm (Step-by-Step Sequence)

1. User clicks "Word / PPT" in `SourceSelectorModal.tsx`.
2. Browser displays native file selector filtering for `.docx` and `.pptx`.
3. User selects a document.
4. `FileReader.readAsDataURL` executes in `handleFileUpload`, but `App.tsx:440` passes `payload.file` to `startProcessingDocx()`.
5. `file.arrayBuffer()` reads the file into an in-memory binary buffer.
6. `aiService.extractTextFromDocx()` dynamically imports `mammoth` (`web/node_modules/mammoth`).
7. `mammoth.extractRawText({ arrayBuffer })` attempts to unpack the OpenXML ZIP structure.
8. If the file is a valid DOCX, it returns unformatted plaintext; if the file is a PPTX, it throws an error and returns `""`.
9. If empty, `App.tsx` throws: `"No readable text could be extracted from this Word document."`
10. If text exists, `App.tsx` truncates the document to the first 15,000 characters (`text.slice(0, 15000)`).
11. `aiService.extractFromText()` formats the text into the extraction prompt.
12. Prompt is sent to Gemini 2.5 Flash (or Groq fallback).
13. `parseQuestionsJson()` coerces response into `Question[]`.
14. Test is loaded into `EditorScreen.tsx` and saved to `localStorage`.

---

## 6. Forensic Evaluation & Improvement Recommendations

| Dimension | Assessment |
|---|---|
| **Strengths** | Fast text extraction for simple, text-only Word documents without backend latency. |
| **Weaknesses** | PPTX is completely broken; all diagrams, figures, and charts are discarded; all tables are collapsed into flattened text; documents over 15,000 characters (~5 pages) are arbitrarily chopped off. |
| **Root Causes** | Misconfigured file picker advertising `.pptx` while relying on `mammoth` (which explicitly supports only DOCX); lack of an OpenXML PPTX slide parser; lack of image extraction from ZIP packages. |
| **Missing Components** | PPTX XML parser (`jszip` / slide extractor); DOCX table-to-markdown converter; embedded image extractor; document chunker to process documents longer than 15,000 characters. |
| **Security Risks** | OpenXML ZIP bomb decompression vulnerability when unzipping malicious `.docx` in browser memory. |
| **Data-Fidelity Risks** | Silent loss of all content past character 15,000; total destruction of tabular questions and diagrams. |
