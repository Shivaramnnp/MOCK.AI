# SOURCE 06 — IMAGE / PHOTO: FORENSIC DISCOVERY REPORT
**MOCK.AI Source Ingestion Algorithm Discovery**  
**Date**: 2026-09-28  
**Scope**: In-depth trace of image file uploads, vision model extraction, OCR handling, and asset lifecycle.  
**Integrity Mode**: Read-Only Audit (Zero Production Code Changes).

---

## 1. Executive Summary

The "Image / Photo" ingestion source (`SourceSelectorModal.tsx:85-92`) allows candidates to upload textbook photos, whiteboard notes, handwritten questions, or diagram screenshots (`image/*`).

Our forensic analysis reveals:
1. **Zero Client Preprocessing**: Images are read raw as Base64 Data URLs without client-side resizing, compression, rotation correction, or contrast enhancement.
2. **Vision-Only Text Extraction**: Image understanding is delegated entirely to Google Gemini 2.5 Flash's multimodal vision model. No local OCR engine (e.g. Tesseract.js) or layout analyzer is used.
3. **The Asset Discard Flaw**: Although the user uploaded an image, **the image itself is permanently discarded after inference**. The resulting questions have no diagram attached (`diagramUrl: null`), meaning questions referencing visual figures ("Based on the circuit above...") become unanswerable.

---

## 2. Technical Pipeline Trace

```
USER INPUT (Image file: PNG, JPEG, WEBP)
    ↓
UI COMPONENT (`SourceSelectorModal.tsx`)
    ↓
VALIDATION (`accept="image/*"`)
    ↓
CAPTURE (`FileReader.readAsDataURL(file)`)
    ↓
DISPATCH (`App.tsx:startProcessingFile()`)
    ↓
SERVICE CALL (`aiService.ts:extractFromBase64File()`)
    ↓
ADAPTER (`geminiAdapter.ts:extractFromBase64File()`)
    ↓
REMOTE INFERENCE (`POST /generateContent` with inline Base64 JPEG/PNG)
    ↓
GEMINI VISION REASONING (Gemini reads text and diagrams in image)
    ↓
NORMALIZATION (`adapterHelpers.ts:parseQuestionsJson()`)
    ↓
DISCARD ORIGINAL IMAGE (Image Base64 is garbage-collected; zero storage)
    ↓
CURATION (`EditorScreen.tsx` - pure text questions)
    ↓
PERSISTENCE (`storage.ts:saveTest()` -> `localStorage['mockai_tests']`)
```

---

## 3. Forensic Code Inspection

### 3.1 Upload Component (`web/src/components/SourceSelectorModal.tsx:161-167`)
```tsx
<input
  type="file"
  ref={imageInputRef}
  accept="image/*"
  className="hidden"
  onChange={(e) => handleFileUpload(e, 'Image')}
/>
```

### 3.2 Dispatch in `web/src/App.tsx:435-438`
```typescript
else if (type === 'PDF' || type === 'Image') {
  if (payload?.base64) {
    startProcessingFile(payload.base64, payload.file?.type || 'image/jpeg', payload.name);
  }
}
```

### 3.3 Gemini Vision Request (`web/src/services/aiService.ts:165-194`)
```typescript
const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;

const response = await fetch(GEMINI_ENDPOINT, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
  },
  body: JSON.stringify({
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: cleanBase64,
            },
          },
          {
            text: `Analyze this image or document and extract all exam questions or generate conceptual MCQs from it.\n${EXTRACTION_SYSTEM_PROMPT}`,
          },
        ],
      },
    ],
    generationConfig: {
      response_mime_type: 'application/json',
      temperature: 0.1,
      maxOutputTokens: 8192,
    },
  }),
});
```

---

## 4. Object & Layout Analysis: What Happens to Image Elements?

| Image Content Element | Processing in Current Pipeline | Result in Question Model |
|---|---|---|
| **Printed Text** | OCR-transcribed by Gemini Vision. | Preserved in `questionText`. |
| **Handwritten Text** | Decoded by Gemini Vision if legible. | Preserved with variable accuracy. |
| **Mathematical Formulas** | Transcribed by Gemini into LaTeX `$..$`. | Rendered via KaTeX in UI. |
| **Diagrams & Figures** | Gemini sees the diagram and may describe it in text. | **The diagram image itself is deleted**. The candidate receives only text! |
| **Data Tables** | Gemini attempts to format rows as text. | Tables are flattened into plain text strings. |
| **Visual Multiple Choice Options** | If options A–D are diagrams, Gemini fails or hallucinates descriptions. | Visual options are lost. |

---

## 5. Current Algorithm (Step-by-Step Sequence)

1. User clicks "Image / Photo" in `SourceSelectorModal.tsx`.
2. Browser opens native file picker filtering for images.
3. User selects a photo (e.g. `textbook_page.jpg`, 8MB).
4. `FileReader.readAsDataURL(file)` encodes the entire 8MB file into a ~11MB Base64 string in browser heap.
5. `App.tsx` navigates to `'processing'` with message `"Analyzing and extracting questions from textbook_page.jpg..."`.
6. `aiService.extractFromBase64File()` extracts the Base64 data without resizing, compression, or rotation.
7. Browser issues a synchronous `fetch()` to Google Gemini with `inline_data`.
8. Gemini Vision processes the image and returns a JSON string of questions.
9. `parseQuestionsJson()` maps JSON to `Question[]`.
10. The original image Data URL is never saved to Supabase storage, S3, or indexedDB; it is dropped from scope.
11. `App.tsx` navigates to `'editor'` showing only text.
12. User saves test to `localStorage`.

---

## 6. Forensic Evaluation & Improvement Recommendations

| Dimension | Assessment |
|---|---|
| **Strengths** | Leverages Gemini 2.5 Flash's strong multimodal vision understanding for printed and handwritten academic text. |
| **Weaknesses** | Discards all visual assets; questions with diagrams become unsolvable; memory explosion on raw high-res photos; no image cropping, deskew, or contrast enhancement. |
| **Root Causes** | The user `Question` data model has no image fields; there is no image storage pipeline (Supabase bucket or local blobs). |
| **Missing Components** | Client-side image preprocessor (canvas resize to max 2048px, JPEG 80% compression); bounding box diagram cropper; asset uploader to Supabase Storage; question schema support for `diagramUrl` and `optionImages`. |
| **Security Risks** | Browser tab crash on 50MB+ raw camera image upload; unauthenticated direct client-to-Gemini API calls. |
| **Data-Fidelity Risks** | Diagram loss is catastrophic for STEM exams (Physics, Chemistry, Engineering, Biology). |
