# MOCK.AI — SOURCE INGESTION FILE MAP
**Complete Inventory of Files, Handlers, Services, and Renderers across all 10 Sources**  
**Date**: 2026-09-28  
**Scope**: Exact repository paths in `/Users/shivarampatel/AndroidStudioProjects/MOCK.AI`  
**Integrity Mode**: Read-Only Audit (Zero Production Code Changes).

---

## 1. Global & Shared Architecture Files

| Component Role | Exact Repository Path | Function / Responsibility |
|---|---|---|
| **Root Application Router** | `web/src/App.tsx` | Hosts modal states, file upload handlers, navigation dispatch (`navigateTo('processing')`, `navigateTo('editor')`, `navigateTo('test_player')`), and persistence to localStorage. |
| **Main Source Selection Modal** | `web/src/components/SourceSelectorModal.tsx` | Presents the 10 ingestion options with icons, hidden file inputs for PDF/Word/Image, and triggers `onSelectSource(type, payload)`. |
| **Specialized Input Modals** | `web/src/components/InputModals.tsx` | Hosts `TopicModal`, `UrlModal`, `YouTubeModal`, and `JsonModal`. |
| **Camera Modal** | `web/src/components/CameraModal.tsx` | WebRTC MediaDevices camera viewfinder with canvas snapshot export. |
| **Voice Dictation Modal** | `web/src/components/VoiceModal.tsx` | HTML5 Web Speech API listener with live transcript text box. |
| **Core AI Service** | `web/src/services/aiService.ts` | Orchestrates LLM prompt construction, Gemini / Groq API requests, response normalization, and offline mock fallback. |
| **AI Provider Hub** | `web/src/services/ai/aiProviderService.ts` | Manages user BYOK connections (Google Gemini, OpenAI, Groq, Custom OpenAI-compatible). |
| **AI Adapter Registry** | `web/src/services/ai/aiProviderRegistry.ts` | Provider definitions, default endpoints, supported model lists, and icon configurations. |
| **AI Adapters** | `web/src/services/ai/adapters/geminiAdapter.ts`<br>`web/src/services/ai/adapters/groqAdapter.ts`<br>`web/src/services/ai/adapters/openAiAdapter.ts`<br>`web/src/services/ai/adapters/customOpenAiAdapter.ts` | Provider-specific request formatting, vision handling, error sanitization, and response parsing. |
| **AI Adapter Helpers** | `web/src/services/ai/adapters/adapterHelpers.ts` | Hosts canonical `EXTRACTION_SYSTEM_PROMPT`, `parseQuestionsJson()`, and `sanitizeErrorMessage()`. |
| **Local Storage Engine** | `web/src/services/storage.ts` | Key-value browser persistence for user tests (`mockai_tests`), profiles, streaks, and settings. |
| **Intermediate Processing Screen** | `web/src/screens/ProcessingScreen.tsx` | Animated 4-step loading visualization displayed during async LLM inference. |
| **Question Editor Screen** | `web/src/screens/EditorScreen.tsx` | Post-ingestion curation screen allowing users to edit question text, options, answers, and trigger `onAiFixAll`. |
| **Practice Test Player** | `web/src/screens/TestPlayerScreen.tsx` | Active exam delivery engine for user-created mock tests. |
| **Math & Latex Renderer** | `web/src/components/LatexRenderer.tsx` | KaTeX mathematical equation, symbol, and variable renderer. |
| **Structured Content Renderer** | `web/src/components/StructuredContentRenderer.tsx` | Advanced renderer supporting markdown tables, code blocks, diagrams, and content blocks (used in competitive exams). |
| **Types Definition** | `web/src/types/index.ts` | Defines `Question`, `InputSourceType`, `TestHistory`, `TestSessionState`, `CompetitiveQuestion`, `ExamPaper`, `ContentBlock`. |
| **AI Provider Types** | `web/src/types/aiProvider.ts` | Defines `AIProviderConnection`, `AIProviderAdapter`, `ConnectionTestResult`. |
| **Offline Forensic Pipeline** | `scripts/gate_forensic_pipeline.py` | Standalone Python batch pipeline for official GATE papers (PyMuPDF, bounding box crops, answer keys). |
| **YouTube Backend Service** | `youtube_backend/main.py` | Standalone Python Flask server with Supadata and `youtube-transcript-api` (currently disconnected from frontend). |

---

## 2. Source-by-Source File Breakdown

### SOURCE 01 — PDF DOCUMENT
- **UI Files**:
  - `web/src/components/SourceSelectorModal.tsx` (lines 45–52, 149–153, 200–202)
  - `web/src/App.tsx` (lines 435–438, 446–463)
  - `web/src/screens/ProcessingScreen.tsx`
  - `web/src/screens/EditorScreen.tsx`
- **Services**:
  - `web/src/services/aiService.ts` (`extractFromBase64File`)
  - `web/src/services/ai/adapters/geminiAdapter.ts` (`extractFromBase64File`)
  - `web/src/services/storage.ts` (`saveTest`)
- **Libraries**:
  - Browser Native: `FileReader` (`readAsDataURL`)
  - External API: Google Generative Language API (`gemini-2.5-flash:generateContent`)
- **Parsers**:
  - Browser-side: **None** (No PDF.js, No PyMuPDF, No PDF text parser).
  - External: Gemini Multimodal Vision API parses PDF byte stream.
  - JSON Parser: `web/src/services/ai/adapters/adapterHelpers.ts` (`parseQuestionsJson`).
- **Prompts**:
  - `web/src/services/aiService.ts` line 182:
    `"Analyze this image or document and extract all exam questions or generate conceptual MCQs from it.\n" + EXTRACTION_SYSTEM_PROMPT`
- **Schemas**:
  - Input: `application/pdf` raw binary encoded as Base64 Data URL.
  - Output: `Question[]` (`web/src/types/index.ts:9-20`).
- **Database Tables / Buckets**:
  - Database: **None** (Not stored in Supabase).
  - Storage Bucket: **None** (PDF file is never stored in Supabase Storage or S3; destroyed when tab unloads).
  - Local Storage: `localStorage.getItem('mockai_tests')`.
- **Renderers**:
  - `web/src/screens/EditorScreen.tsx` (Preview mode via `LatexRenderer`)
  - `web/src/screens/TestPlayerScreen.tsx` (Active exam via `LatexRenderer`)

---

### SOURCE 02 — WORD / PPT (DOCX & PPTX)
- **UI Files**:
  - `web/src/components/SourceSelectorModal.tsx` (lines 53–60, 154–160, 203–204)
  - `web/src/App.tsx` (lines 439–443, 465–488)
  - `web/src/screens/ProcessingScreen.tsx`
  - `web/src/screens/EditorScreen.tsx`
- **Services**:
  - `web/src/services/aiService.ts` (`extractTextFromDocx`, `extractFromText`)
  - `web/src/services/ai/adapters/geminiAdapter.ts` (`extractFromText`)
  - `web/src/services/storage.ts` (`saveTest`)
- **Libraries**:
  - NPM: `mammoth` (version `^1.9.0` in `web/package.json`)
  - Browser Native: `File.prototype.arrayBuffer()`
- **Parsers**:
  - DOCX Parser: `mammoth.extractRawText({ arrayBuffer })` in `web/src/services/aiService.ts:124-126`.
  - PPTX Parser: **MISSING / BROKEN** (No PPTX library installed; calling mammoth on `.pptx` throws exception).
- **Prompts**:
  - `web/src/services/aiService.ts` lines 68–77:
    `Source Material Title: "${title}"\nContent:\n"""\n${text.slice(0, 15000)}\n"""\nExtract and construct comprehensive multiple choice questions...`
- **Schemas**:
  - Input: `.docx`, `.pptx` binary arrayBuffer.
  - Intermediate: Raw string `extractedText.slice(0, 15000)`.
  - Output: `Question[]` (`web/src/types/index.ts:9-20`).
- **Database Tables / Buckets**:
  - Database: **None**.
  - Storage Bucket: **None**.
  - Local Storage: `localStorage.getItem('mockai_tests')`.
- **Renderers**:
  - `web/src/screens/EditorScreen.tsx`
  - `web/src/screens/TestPlayerScreen.tsx`

---

### SOURCE 03 — TOPIC NAME
- **UI Files**:
  - `web/src/components/SourceSelectorModal.tsx` (lines 61–68, 207–209)
  - `web/src/components/InputModals.tsx` (`TopicModal`, lines 16–190)
  - `web/src/App.tsx` (lines 406–407, 490–507)
  - `web/src/screens/ProcessingScreen.tsx`
  - `web/src/screens/EditorScreen.tsx`
- **Services**:
  - `web/src/services/aiService.ts` (`generateFromTopic`)
  - `web/src/services/ai/aiProviderService.ts`
  - `web/src/services/ai/adapters/geminiAdapter.ts` (`generateQuestions`)
  - `web/src/services/ai/adapters/groqAdapter.ts` (`generateQuestions`)
  - `web/src/services/storage.ts` (`saveTest`)
- **Libraries**:
  - External API: Gemini API (`gemini-2.5-flash`), Groq API (`llama-3.3-70b-versatile`).
- **Parsers**:
  - Response Parser: `parseQuestionsJson()` in `web/src/services/ai/adapters/adapterHelpers.ts`.
- **Prompts**:
  - `web/src/services/aiService.ts` lines 39–46:
    `Create ${count} high-quality multiple choice questions for the following topic:\nTopic: "${topic}"\nDifficulty: ${difficulty}\n\nEnsure the questions test core concepts, formulas, edge cases, and reasoning.\n` + `EXTRACTION_SYSTEM_PROMPT`
- **Schemas**:
  - Input: Form fields (`topic: string`, `difficulty: 'EASY'|'MEDIUM'|'HARD'|'COMPETITIVE'`, `count: number`).
  - Output: `Question[]` (`web/src/types/index.ts:9-20`).
- **Database Tables / Buckets**:
  - Database: **None**.
  - Storage Bucket: **None**.
  - Local Storage: `localStorage.getItem('mockai_tests')`.
- **Renderers**:
  - `web/src/screens/EditorScreen.tsx`
  - `web/src/screens/TestPlayerScreen.tsx`

---

### SOURCE 04 — YOUTUBE VIDEO
- **UI Files**:
  - `web/src/components/SourceSelectorModal.tsx` (lines 69–76, 207–209)
  - `web/src/components/InputModals.tsx` (`YouTubeModal`, lines 267–342)
  - `web/src/App.tsx` (lines 410–411, 531–551)
  - `web/src/screens/ProcessingScreen.tsx`
  - `web/src/screens/EditorScreen.tsx`
- **Services**:
  - `web/src/services/aiService.ts` (`extractFromText`)
  - `web/src/services/storage.ts` (`saveTest`)
  - Backend Service (Orphaned / Unconnected): `youtube_backend/main.py`
- **Libraries**:
  - Backend (Python): `flask`, `supadata`, `youtube-transcript-api` (in `youtube_backend/requirements.txt`).
  - Frontend: Native `fetch` (currently bypasses `youtube_backend`).
- **Parsers**:
  - Backend: `YouTubeTranscriptApi.get_transcript(video_id)` in `youtube_backend/main.py:81`.
  - Frontend: **None**.
- **Prompts**:
  - `web/src/App.tsx` lines 537–540:
    `YouTube Video: ${url}\nExtract core educational concepts and build competitive multiple choice questions. Ignore speaker filler words.` passed into `aiService.extractFromText()`.
- **Schemas**:
  - Input: `url: string`.
  - Output: `Question[]` (`web/src/types/index.ts:9-20`).
- **Database Tables / Buckets**:
  - Database: **None**.
  - Storage Bucket: **None**.
  - Local Storage: `localStorage.getItem('mockai_tests')`.
- **Renderers**:
  - `web/src/screens/EditorScreen.tsx`
  - `web/src/screens/TestPlayerScreen.tsx`

---

### SOURCE 05 — WEB URL
- **UI Files**:
  - `web/src/components/SourceSelectorModal.tsx` (lines 77–84, 207–209)
  - `web/src/components/InputModals.tsx` (`UrlModal`, lines 192–265)
  - `web/src/App.tsx` (lines 408–409, 509–530)
  - `web/src/screens/ProcessingScreen.tsx`
  - `web/src/screens/EditorScreen.tsx`
- **Services**:
  - `web/src/services/aiService.ts` (`extractFromText`)
  - `web/src/services/storage.ts` (`saveTest`)
- **Libraries**:
  - External API: Gemini API / Groq API.
- **Parsers**:
  - Scraper / HTML Parser: **NONE** (No Readability, no Cheerio, no Puppeteer, no fetch).
- **Prompts**:
  - `web/src/App.tsx` lines 515–518:
    `Webpage Source URL: ${url}\nPlease construct a competitive exam based on the primary subject of this URL.` passed into `aiService.extractFromText()`.
- **Schemas**:
  - Input: `url: string`.
  - Output: `Question[]` (`web/src/types/index.ts:9-20`).
- **Database Tables / Buckets**:
  - Database: **None**.
  - Storage Bucket: **None**.
  - Local Storage: `localStorage.getItem('mockai_tests')`.
- **Renderers**:
  - `web/src/screens/EditorScreen.tsx`
  - `web/src/screens/TestPlayerScreen.tsx`

---

### SOURCE 06 — IMAGE / PHOTO
- **UI Files**:
  - `web/src/components/SourceSelectorModal.tsx` (lines 85–92, 161–167, 205–206)
  - `web/src/App.tsx` (lines 435–438, 446–463)
  - `web/src/screens/ProcessingScreen.tsx`
  - `web/src/screens/EditorScreen.tsx`
- **Services**:
  - `web/src/services/aiService.ts` (`extractFromBase64File`)
  - `web/src/services/ai/adapters/geminiAdapter.ts` (`extractFromBase64File`)
  - `web/src/services/storage.ts` (`saveTest`)
- **Libraries**:
  - Browser Native: `FileReader` (`readAsDataURL`)
  - External API: Gemini Vision API (`gemini-2.5-flash:generateContent`)
- **Parsers**:
  - Image Preprocessing: **None** (No canvas resizing, no compression, no OpenCV/WASM).
  - OCR: Handled remotely by Gemini Vision.
- **Prompts**:
  - `web/src/services/aiService.ts` line 182:
    `"Analyze this image or document and extract all exam questions or generate conceptual MCQs from it.\n" + EXTRACTION_SYSTEM_PROMPT`
- **Schemas**:
  - Input: `image/*` encoded as Base64 Data URL.
  - Output: `Question[]` (`web/src/types/index.ts:9-20`).
- **Database Tables / Buckets**:
  - Database: **None**.
  - Storage Bucket: **None** (The uploaded image is discarded; not saved to Supabase storage).
  - Local Storage: `localStorage.getItem('mockai_tests')`.
- **Renderers**:
  - `web/src/screens/EditorScreen.tsx`
  - `web/src/screens/TestPlayerScreen.tsx`

---

### SOURCE 07 — CAMERA SCAN
- **UI Files**:
  - `web/src/components/SourceSelectorModal.tsx` (lines 93–100, 207–209)
  - `web/src/components/CameraModal.tsx` (lines 1–151)
  - `web/src/App.tsx` (lines 414–415, 553–570)
  - `web/src/screens/ProcessingScreen.tsx`
  - `web/src/screens/EditorScreen.tsx`
- **Services**:
  - `web/src/services/aiService.ts` (`extractFromBase64File`)
  - `web/src/services/ai/adapters/geminiAdapter.ts` (`extractFromBase64File`)
  - `web/src/services/storage.ts` (`saveTest`)
- **Libraries**:
  - Browser Native: `navigator.mediaDevices.getUserMedia`, `HTMLCanvasElement.toDataURL('image/jpeg', 0.9)`.
- **Parsers**:
  - Document Edge Detection / Unwarping: **None**.
  - OCR: Gemini Vision.
- **Prompts**:
  - `web/src/services/aiService.ts` line 182:
    `"Analyze this image or document and extract all exam questions or generate conceptual MCQs from it.\n" + EXTRACTION_SYSTEM_PROMPT`
- **Schemas**:
  - Input: JPEG Data URL from canvas.
  - Output: `Question[]` (`web/src/types/index.ts:9-20`).
- **Database Tables / Buckets**:
  - Database: **None**.
  - Storage Bucket: **None** (Captured photo is discarded).
  - Local Storage: `localStorage.getItem('mockai_tests')`.
- **Renderers**:
  - `web/src/screens/EditorScreen.tsx`
  - `web/src/screens/TestPlayerScreen.tsx`

---

### SOURCE 08 — VOICE / AUDIO
- **UI Files**:
  - `web/src/components/SourceSelectorModal.tsx` (lines 101–108, 207–209)
  - `web/src/components/VoiceModal.tsx` (lines 1–182)
  - `web/src/App.tsx` (lines 416–417, 572–589)
  - `web/src/screens/ProcessingScreen.tsx`
  - `web/src/screens/EditorScreen.tsx`
- **Services**:
  - `web/src/services/aiService.ts` (`extractFromText`)
  - `web/src/services/storage.ts` (`saveTest`)
- **Libraries**:
  - Browser Native: `window.SpeechRecognition` / `window.webkitSpeechRecognition`.
- **Parsers**:
  - Speech-to-Text: Native browser Web Speech API.
  - Audio File Decoder / Whisper: **None**.
- **Prompts**:
  - `web/src/services/aiService.ts` lines 68–77:
    `Source Material Title: "Voice Notes"\nContent:\n"""\n${transcript.slice(0, 15000)}\n"""\nExtract and construct comprehensive multiple choice questions...`
- **Schemas**:
  - Input: Live transcript string.
  - Output: `Question[]` (`web/src/types/index.ts:9-20`).
- **Database Tables / Buckets**:
  - Database: **None**.
  - Storage Bucket: **None** (Audio is never recorded to audio file or stored).
  - Local Storage: `localStorage.getItem('mockai_tests')`.
- **Renderers**:
  - `web/src/screens/EditorScreen.tsx`
  - `web/src/screens/TestPlayerScreen.tsx`

---

### SOURCE 09 — MANUAL ENTRY
- **UI Files**:
  - `web/src/components/SourceSelectorModal.tsx` (lines 109–116, 207–209)
  - `web/src/App.tsx` (lines 418–434)
  - `web/src/screens/EditorScreen.tsx` (lines 1–483)
- **Services**:
  - `web/src/services/aiService.ts` (`fixQuestions` - optional AI button)
  - `web/src/services/storage.ts` (`saveTest`)
- **Libraries**:
  - React standard state management (`useState`, controlled inputs).
- **Parsers**:
  - None required (direct user form typing).
- **Prompts**:
  - Optional "AI Fix All" button in `EditorScreen.tsx` invokes `aiService.fixQuestions(questions)` (`aiService.ts:213-224`).
- **Schemas**:
  - State: `Question[]` initialized with 1 blank template question (`id: 'q-1'`, `questionText: ''`, `options: ['', '', '', '']`).
  - Output: `Question[]` (`web/src/types/index.ts:9-20`).
- **Database Tables / Buckets**:
  - Database: **None**.
  - Storage Bucket: **None**.
  - Local Storage: `localStorage.getItem('mockai_tests')`.
- **Renderers**:
  - `web/src/screens/EditorScreen.tsx`
  - `web/src/screens/TestPlayerScreen.tsx`

---

### SOURCE 10 — JSON DATA
- **UI Files**:
  - `web/src/components/SourceSelectorModal.tsx` (lines 117–124, 207–209)
  - `web/src/components/InputModals.tsx` (`JsonModal`, lines 345–454)
  - `web/src/App.tsx` (lines 412–413, 591–612)
  - `web/src/screens/EditorScreen.tsx`
- **Services**:
  - `web/src/services/storage.ts` (`saveTest`)
- **Libraries**:
  - JavaScript standard `JSON.parse()`.
- **Parsers**:
  - In-line mapping in `web/src/App.tsx:592-608`.
- **Prompts**:
  - **None** (Direct data ingestion).
- **Schemas**:
  - Input JSON syntax: Accepts `{ "questions": [ { "questionText": string, "options": string[], "correctAnswerIndex": number, ... } ] }` or top-level array.
  - Output: `Question[]` (`web/src/types/index.ts:9-20`).
- **Database Tables / Buckets**:
  - Database: **None**.
  - Storage Bucket: **None**.
  - Local Storage: `localStorage.getItem('mockai_tests')`.
- **Renderers**:
  - `web/src/screens/EditorScreen.tsx`
  - `web/src/screens/TestPlayerScreen.tsx`
