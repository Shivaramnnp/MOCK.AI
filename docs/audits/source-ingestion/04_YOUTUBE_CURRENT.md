# SOURCE 04 — YOUTUBE VIDEO: FORENSIC DISCOVERY REPORT
**MOCK.AI Source Ingestion Algorithm Discovery**  
**Date**: 2026-09-28  
**Scope**: In-depth trace of YouTube ingestion, transcript fetching, and the disconnected Python backend service.  
**Integrity Mode**: Read-Only Audit (Zero Production Code Changes).

---

## 1. Executive Summary: The Ghost Scraper Architecture

In the Create Mock Test UI (`SourceSelectorModal.tsx:70-76` and `InputModals.tsx:267-342`), Option 4 is presented as:
> **YouTube Video** — *"Extract transcript & generate MCQs"*

Our forensic investigation revealed a **critical architectural disconnect**:
1. **The Disconnected Python Service**: The repository contains a dedicated Flask microservice (`youtube_backend/main.py`) implemented specifically to fetch transcripts via `supadata` and `youtube-transcript-api`.
2. **The Frontend Reality**: `web/src/App.tsx` **completely ignores `youtube_backend`**. When a candidate inputs a YouTube link, the frontend simply interpolates the raw URL into a text prompt and passes it to Google Gemini!
3. **The Consequence**: The system does not actually download, transcribe, or read the YouTube video. It relies entirely on whether Gemini can infer or hallucinate the video's content from the URL text alone.

---

## 2. Technical Pipeline Trace

```
USER INPUT (YouTube URL, e.g. "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    ↓
UI COMPONENT (`InputModals.tsx:YouTubeModal`)
    ↓
VALIDATION (`!url.trim()`)
    ↓
DISPATCH (`App.tsx:handleYouTubeSubmit(url)`)
    ↓
    │  [DISCONNECT POINT: `youtube_backend/main.py` IS NEVER CALLED!]
    ▼
SYNTHETIC PROMPT CREATION (`App.tsx:537-540`)
    ↓
PASS TO SERVICE: `aiService.ts:extractFromText("YouTube Video: https://...", "YouTube Lecture")`
    ↓
TRUNCATION: `text.slice(0, 15000)` (slices the prompt containing the URL string)
    ↓
REMOTE INFERENCE (`POST /generateContent` to Gemini 2.5 Flash)
    ↓
LLM REASONING: Gemini sees the URL string and attempts to guess the video topic
    ↓
NORMALIZATION (`adapterHelpers.ts:parseQuestionsJson()`)
    ↓
CURATION (`EditorScreen.tsx`)
    ↓
PERSISTENCE (`storage.ts:saveTest()` -> `localStorage['mockai_tests']`)
```

---

## 3. Forensic Code Inspection

### 3.1 The Frontend Handler (`web/src/App.tsx:531-551`)

```typescript
  const handleYouTubeSubmit = async (url: string) => {
    setProcessingStatus('Fetching YouTube video concepts & generating MCQs...');
    setProcessingError(null);
    navigateTo('processing');

    try {
      const questions = await aiService.extractFromText(
        `YouTube Video: ${url}\nExtract core educational concepts and build competitive multiple choice questions. Ignore speaker filler words.`,
        'YouTube Lecture'
      );
      setEditorInitialData({
        title: 'YouTube Lecture Mock Test',
        category: 'Video Lecture',
        questions,
        existingTest: null,
      });
      navigateTo('editor');
    } catch (err: any) {
      setProcessingError(err.message || 'Failed to process YouTube link.');
    }
  };
```

### 3.2 The Disconnected Backend Service (`youtube_backend/main.py`)

A full Flask service exists in `youtube_backend/main.py` (lines 38–117):
```python
@app.route('/transcript')
def get_transcript():
    video_url = request.args.get('url', '')
    if not video_url:
        return jsonify({"error": "no_url", "message": "No URL provided"}), 400

    video_id = extract_video_id(video_url)
    if not video_id:
        return jsonify({"error": "invalid_url", "message": "Invalid YouTube URL."}), 400

    # Method 1: Supadata.ai (Primary)
    supadata_key = os.environ.get('SUPADATA_API_KEY', '')
    if supadata_key:
        ...
        transcript = client.transcript(url=video_url, text=True)
        return jsonify({ "transcript": content.strip(), "title": get_title(video_id), ... })

    # Method 2: youtube-transcript-api (Fallback)
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        data = YouTubeTranscriptApi.get_transcript(video_id)
        full_text = " ".join([entry.get('text', '').strip() for entry in data])
        return jsonify({ "transcript": full_text.strip(), ... })
    except Exception as e:
        ...
```

### 3.3 The Evidence of Disconnection
1. **Zero Endpoint References**: Searching `web/src/` for `5002` (the Flask port), `/transcript`, or any reference to `youtube_backend` yields **0 results**.
2. **Missing Network Calls**: In `App.tsx`, there is no `fetch('http://localhost:5002/transcript?url=...')` or production backend URL.
3. **Title and Category are Static**: `App.tsx` hardcodes `title: 'YouTube Lecture Mock Test'` and `category: 'Video Lecture'`. It never retrieves the video's actual title from oEmbed or YouTube API.

---

## 4. How the System Behaves When Tested

When a user submits a YouTube URL:
1. **Known Pre-Trained Videos**: If a user submits a widely known URL (e.g. 3Blue1Brown's Essence of Calculus or Khan Academy videos that existed in Gemini's training set), Gemini may recognize the video ID or title patterns and generate relevant questions from its training weights.
2. **New or Private Videos**: If a teacher uploads an unlisted lecture recorded yesterday, Gemini receives only:
   `"YouTube Video: https://www.youtube.com/watch?v=s8Yk73k9w... Extract core educational concepts..."`
   Because Gemini has no real-time internet browsing capability in this API configuration and the video was uploaded after the training cutoff, **Gemini hallucinates arbitrary educational concepts or returns generic science questions**.
3. **Dead Citations**: The UI never produces video timestamps (e.g. "Answer discussed at 04:12"). Although `Citation.youtubeTimestamp` is declared in `types/index.ts:5`, it is never populated.

---

## 5. Current Algorithm (Step-by-Step Sequence)

1. User clicks "YouTube Video" in `SourceSelectorModal.tsx`.
2. `YouTubeModal.tsx` opens with an input field: `"https://www.youtube.com/watch?v=..."`.
3. User pastes a YouTube URL and clicks "Extract Transcript".
4. `YouTubeModal` validates that `url.trim()` is non-empty, calls `onSubmit(url.trim())`, and closes.
5. `App.tsx:handleYouTubeSubmit(url)` sets status `"Fetching YouTube video concepts & generating MCQs..."` and navigates to `'processing'`.
6. `App.tsx` builds a string: `"YouTube Video: " + url + "\nExtract core educational concepts and build competitive multiple choice questions. Ignore speaker filler words."`.
7. `aiService.extractFromText()` slices the text to 15,000 characters and wraps it in `EXTRACTION_SYSTEM_PROMPT`.
8. Direct client-side `fetch()` call is made to Gemini 2.5 Flash.
9. Gemini parses the prompt and generates JSON questions based on training data or guesses.
10. `parseQuestionsJson()` normalizes questions to 4 options.
11. `App.tsx` sets `title: 'YouTube Lecture Mock Test'` and navigates to `'editor'`.
12. User saves the test to `localStorage['mockai_tests']`.

---

## 6. Forensic Evaluation & Improvement Recommendations

| Dimension | Assessment |
|---|---|
| **Strengths** | Fast UI response (no waiting for video downloading or speech-to-text processing). |
| **Weaknesses** | Complete failure to actually read video transcripts; total hallucination on new or unlisted videos; disconnected backend service; zero timestamp citations; no audio speech-to-text for videos lacking captions. |
| **Root Causes** | Frontend was never wired to `youtube_backend/main.py`; reliance on LLM to guess content from URL string. |
| **Missing Components** | Active API bridge between `web/src/` and `youtube_backend/`; fallback to Whisper audio transcription for uncaptioned videos; video metadata extraction (title, duration, channel); chunking with timestamp alignment. |
| **Security Risks** | SSRF risk if a backend proxy is added without URL validation; prompt injection embedded in YouTube URL query parameters. |
| **Data-Fidelity Risks** | High hallucination risk; questions generated bear zero relation to what the speaker actually said. |
