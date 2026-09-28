# MOCK.AI — SOURCE INGESTION CURRENT ARCHITECTURE
**Forensic Technical Discovery & Analysis**  
**Date**: 2026-09-28  
**Scope**: Complete trace of all 10 ingestion mechanisms exposed in `SourceSelectorModal.tsx` and `App.tsx`.  
**Integrity Mode**: Read-Only Audit (Zero Production Code Changes).

---

## 1. Executive Architecture Overview

Mock.AI provides a "Create Mock Test" modal (`web/src/components/SourceSelectorModal.tsx`) that presents 10 distinct ingestion modalities to students and educators:
1. **PDF Document** (`PDF`)
2. **Word / PPT** (`Docx`)
3. **Topic Name** (`Topic`)
4. **YouTube Video** (`YouTube`)
5. **Web URL** (`WebUrl`)
6. **Image / Photo** (`Image`)
7. **Camera Scan** (`Camera`)
8. **Voice / Audio** (`Audio`)
9. **Manual Entry** (`Manual`)
10. **JSON Data** (`Json`)

### The Fundamental Architectural Schism

Our forensic analysis reveals a profound architectural divide between **official exam ingestion** and **user mock test ingestion**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      MOCK.AI DUAL ARCHITECTURE                         │
├───────────────────────────────────┬────────────────────────────────────┤
│   OFFICIAL CORPUS PIPELINE        │   "CREATE MOCK TEST" INGESTION     │
│   (GATE 2024/2025, SSC CHSL)      │   (The 10 User Ingestion Sources)  │
├───────────────────────────────────┼────────────────────────────────────┤
│ • Offline Python engine           │ • 100% Client-Side Web App         │
│ • PyMuPDF (fitz) text & vector    │ • React (Vite) + Browser APIs      │
│ • Coordinate extraction & crops   │ • Direct Browser-to-LLM API calls  │
│ • Rich `CompetitiveQuestion`      │ • Minimal `Question` model         │
│ • Structured `ContentBlock[]`     │ • Flat string `questionText`       │
│ • MCQ, MSQ, and NAT types         │ • Strictly 4-option single MCQ     │
│ • Sectional marks & penalties     │ • No marks, sections, or penalties │
│ • Static assets in web/public/    │ • Zero asset generation / cropping │
│ • Pre-built JSON in git           │ • Ephemeral localStorage only      │
│ • Rendered by CompetitivePlayer   │ • Rendered by TestPlayerScreen     │
└───────────────────────────────────┴────────────────────────────────────┘
```

While the repository contains an advanced offline Python forensic extraction pipeline (`scripts/gate_forensic_pipeline.py`) capable of coordinate slicing, fraction parsing, table segmentation, and asset harvesting for official GATE papers, **the active user-facing "Create Mock Test" feature shares virtually none of that infrastructure**.

Instead, all 10 user ingestion pathways run entirely within the client's browser, bypassing backend servers, and collapse complex multi-modal inputs into a monolithic LLM prompt that forces every output into a primitive 4-option single-choice schema.

---

## 2. End-to-End Pipeline Trace for All 10 Sources

```mermaid
flowchart TD
    subgraph UI ["1. UI Ingestion Layer"]
        A["SourceSelectorModal.tsx"] --> B1["Hidden PDF Input"]
        A --> B2["Hidden DOCX/PPTX Input"]
        A --> B3["TopicModal.tsx"]
        A --> B4["YouTubeModal.tsx"]
        A --> B5["UrlModal.tsx"]
        A --> B6["Hidden Image Input"]
        A --> B7["CameraModal.tsx"]
        A --> B8["VoiceModal.tsx"]
        A --> B9["Direct Route ('Manual')"]
        A --> B10["JsonModal.tsx"]
    end

    subgraph ClientDispatch ["2. App.tsx Dispatch Layer"]
        B1 -->|FileReader.readAsDataURL| C1["startProcessingFile(base64, 'application/pdf')"]
        B2 -->|file.arrayBuffer| C2["startProcessingDocx(buffer)"]
        B3 -->|topic, difficulty, count| C3["handleTopicSubmit()"]
        B4 -->|raw URL string| C4["handleYouTubeSubmit()"]
        B5 -->|raw URL string| C5["handleUrlSubmit()"]
        B6 -->|FileReader.readAsDataURL| C6["startProcessingFile(base64, 'image/jpeg')"]
        B7 -->|Canvas dataUrl| C7["handleCameraCapture(base64)"]
        B8 -->|Web Speech transcript| C8["handleVoiceSubmit(transcript)"]
        B9 -->|Blank template| C9["setEditorInitialData() -> navigateTo('editor')"]
        B10 -->|JSON.parse| C10["handleJsonSubmit() -> navigateTo('editor')"]
    end

    subgraph AIService ["3. AiService & Adapter Layer"]
        C1 -->|inline base64| D1["aiService.extractFromBase64File()"]
        C2 -->|mammoth.extractRawText| D2["aiService.extractFromText()"]
        C3 -->|prompt synthesis| D3["aiService.generateFromTopic()"]
        C4 -->|prompt with raw URL| D4["aiService.extractFromText()"]
        C5 -->|prompt with raw URL| D5["aiService.extractFromText()"]
        C6 -->|inline base64| D6["aiService.extractFromBase64File()"]
        C7 -->|inline base64| D7["aiService.extractFromBase64File()"]
        C8 -->|transcript string| D8["aiService.extractFromText()"]
    end

    subgraph LLM ["4. External LLM Endpoints"]
        D1 & D6 & D7 -->|POST /generateContent (Vision)| E1["Google Gemini 2.5 Flash API"]
        D2 & D3 & D4 & D5 & D8 -->|POST /generateContent (Text)| E1
        D2 & D3 & D4 & D5 & D8 -.->|Fallback POST /chat/completions| E2["Groq API (Llama 3.3 70B)"]
    end

    subgraph Normalization ["5. Normalization & Parsing"]
        E1 & E2 -->|parseQuestionsJson()| F["Question[] (Strict 4-option MCQ)"]
    end

    subgraph StorageUI ["6. Presentation & Persistence"]
        F --> G["EditorScreen.tsx (Manual Review & AI Fix All)"]
        C9 & C10 --> G
        G -->|storage.saveTest()| H[("localStorage ('mockai_tests')")]
        H --> I["TestPlayerScreen.tsx (LatexRenderer only)"]
    end
```

---

## 3. Comparative Architecture Matrix: The 10 Ingestion Sources

| # | Source | UI Component | Intermediate Format | Extraction Engine | AI Model & Endpoint | Output Model | Persistence |
|---|---|---|---|---|---|---|---|
| **01** | **PDF Document** | `SourceSelectorModal.tsx` | Base64 Data URL | None (Raw PDF byte stream) | Gemini 2.5 Flash (Vision inline_data) | `Question[]` (4-opt MCQ) | `localStorage` |
| **02** | **Word / PPT** | `SourceSelectorModal.tsx` | ArrayBuffer / Raw Text | `mammoth` (DOCX only; PPTX fails) | Gemini 2.5 Flash (Text prompt) | `Question[]` (4-opt MCQ) | `localStorage` |
| **03** | **Topic Name** | `TopicModal.tsx` | Form Strings | None (Direct prompt input) | Gemini 2.5 Flash / Groq Llama 3.3 | `Question[]` (4-opt MCQ) | `localStorage` |
| **04** | **YouTube Video** | `YouTubeModal.tsx` | Raw URL string | **None** (Orphan Flask backend ignored) | Gemini 2.5 Flash (Prompt with URL) | `Question[]` (4-opt MCQ) | `localStorage` |
| **05** | **Web URL** | `UrlModal.tsx` | Raw URL string | **None** (No HTTP fetch / scraping) | Gemini 2.5 Flash (Prompt with URL) | `Question[]` (4-opt MCQ) | `localStorage` |
| **06** | **Image / Photo** | `SourceSelectorModal.tsx` | Base64 Data URL | None (Raw image byte stream) | Gemini 2.5 Flash (Vision inline_data) | `Question[]` (4-opt MCQ) | `localStorage` |
| **07** | **Camera Scan** | `CameraModal.tsx` | Canvas JPEG Data URL | HTML5 MediaDevices Canvas Capture | Gemini 2.5 Flash (Vision inline_data) | `Question[]` (4-opt MCQ) | `localStorage` |
| **08** | **Voice / Audio** | `VoiceModal.tsx` | Speech Transcript | Browser Web Speech API | Gemini 2.5 Flash (Text prompt) | `Question[]` (4-opt MCQ) | `localStorage` |
| **09** | **Manual Entry** | Direct Route (`'editor'`) | Form State | None (Human typing) | None (Optional `aiService.fixQuestions`) | `Question[]` (4-opt MCQ) | `localStorage` |
| **10** | **JSON Data** | `JsonModal.tsx` | Raw JSON string | `JSON.parse` with basic map | None | `Question[]` (4-opt MCQ) | `localStorage` |

---

## 4. Key Architectural Discoveries

### Discovery 1: Complete Absence of Ingestion Servers & Workers
There is **no background worker queue, asynchronous job executor, or server-side parser** handling user ingestions. When a user uploads a 50-page PDF:
1. `FileReader` loads the entire file into browser JavaScript heap memory as a Base64 string.
2. The browser makes a direct synchronous `fetch()` call to Google's Gemini endpoint.
3. The browser main thread is locked waiting for the HTTP response.
4. If the tab is closed, refreshed, or the network drops for 1 second, the entire ingestion job is irrevocably lost.

### Discovery 2: The YouTube & Web URL Ghost Scrapers
- In `App.tsx` lines 531–551, `handleYouTubeSubmit` takes a video URL and passes:
  ```typescript
  aiService.extractFromText(
    `YouTube Video: ${url}\nExtract core educational concepts and build competitive multiple choice questions...`,
    'YouTube Lecture'
  );
  ```
  The application does **not** fetch captions, download audio, or transcribe the video. It passes the raw URL string to the LLM. While a standalone Python service exists in `youtube_backend/main.py` (equipped with `youtube_transcript_api` and `supadata`), **it is completely unreferenced by the frontend web application**.
- In `App.tsx` lines 509–530, `handleUrlSubmit` takes a webpage URL and passes:
  ```typescript
  aiService.extractFromText(
    `Webpage Source URL: ${url}\nPlease construct a competitive exam based on the primary subject of this URL.`,
    url
  );
  ```
  The browser executes **no HTTP GET request, no HTML DOM parsing, and no readability extraction**. It merely passes the URL string to Gemini.

### Discovery 3: Complete Loss of Visual Assets Across All Ingestion Modes
In the official exam pipeline (`scripts/gate_forensic_pipeline.py`), diagrams and visual options are cropped from PDFs using bounding boxes and saved to `web/public/exam-assets/`.
In the user ingestion pipeline:
- If a user uploads a PDF or image with 20 technical diagrams, **zero images are cropped or saved**.
- Gemini extracts text questions from the image, but does not return image coordinates or segmented assets.
- The resulting `Question` object schema does not even have `diagramUrl` or `optionImages` fields!
- The candidate is presented with pure text questions stripped of all figures, circuits, mechanisms, and plots.

### Discovery 4: Hardcoded Fallback Simulation
In `aiService.ts` lines 388–505, if no Gemini API key or Groq API key is present, or if the API returns an error, the system calls `generateSmartLocalMock()`.
This function returns a hardcoded list of **8 fixed physics and computer science questions** (Noether's theorem, first-order kinetics, $\int \sin^2(x) dx$, CAP theorem, mitochondria, Election Commission Article 324, AVL tree complexity, Gauss's law). Regardless of what PDF, URL, or audio topic the user uploaded, they receive these identical 8 questions.

### Discovery 5: Isolation from Database / Supabase
Although Mock.AI has an integrated Supabase database (configured in `web/src/services/supabase.ts` for auth, profiles, classroom, and community posts), **user-created mock tests are never written to Supabase**.
`storage.saveTest(test)` persists tests strictly into browser `localStorage.setItem('mockai_tests', ...)` via `storage.ts`. As a consequence:
- Tests cannot be accessed from another device.
- Tests cannot be shared across students unless published via classroom assignments.
- Clearing browser cache permanently destroys all ingested tests and session history.
