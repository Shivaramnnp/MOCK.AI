# SOURCE 08 — VOICE / AUDIO: FORENSIC DISCOVERY REPORT
**MOCK.AI Source Ingestion Algorithm Discovery**  
**Date**: 2026-09-28  
**Scope**: In-depth trace of voice dictation, Web Speech API integration, and audio transcription pipeline.  
**Integrity Mode**: Read-Only Audit (Zero Production Code Changes).

---

## 1. Executive Summary: Voice Dictation vs True Audio Ingestion

In the Create Mock Test modal (`SourceSelectorModal.tsx:101-108`), Option 8 is titled:
> **Voice / Audio** — *"Record lecture or dictate queries"*

Our forensic code inspection reveals:
1. **No Audio File Ingestion**: The system **cannot upload or process audio files** (`.mp3`, `.wav`, `.m4a`, `.aac`). There is no file input, no audio decoder, and no server-side transcription backend (e.g. OpenAI Whisper, Deepgram, or Google Cloud Speech-to-Text).
2. **Browser Web Speech API Only**: The feature is strictly a live microphone dictation tool (`web/src/components/VoiceModal.tsx`) relying on the browser's native `webkitSpeechRecognition`.
3. **Severe Browser Incompatibility**: Web Speech API is proprietary and notoriously inconsistent across browsers. It works on Google Chrome, but is **completely unsupported or disabled by default on Firefox and many desktop Safari versions**, rendering the feature entirely dead for those users.

---

## 2. Technical Pipeline Trace

```
USER ACTION (Tap "Voice / Audio" in SourceSelectorModal)
    ↓
UI COMPONENT (`VoiceModal.tsx`)
    ↓
SPEECH RECOGNITION INIT:
  `const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;`
  `const recognition = new SpeechRecognition();`
  `recognition.continuous = true; recognition.interimResults = true;`
    ↓
STREAMING TRANSCRIPTION:
  `recognition.onresult = (event) => { current += event.results[i][0].transcript + ' '; }`
    ↓
LIVE UI UPDATE: Words stream into `<textarea value={transcript} />`
    ↓
USER ACTION: User clicks "Generate Questions" (`handleDone()`)
    ↓
DISPATCH (`App.tsx:handleVoiceSubmit(transcript)`)
    ↓
PASS TO SERVICE: `aiService.ts:extractFromText(transcript, 'Voice Notes')`
    ↓
TRUNCATION: `text.slice(0, 15000)`
    ↓
REMOTE INFERENCE (`POST /generateContent` to Gemini 2.5 Flash)
    ↓
NORMALIZATION (`adapterHelpers.ts:parseQuestionsJson()`)
    ↓
CURATION (`EditorScreen.tsx`)
    ↓
PERSISTENCE (`storage.ts:saveTest()` -> `localStorage['mockai_tests']`)
```

---

## 3. Forensic Code Inspection

### 3.1 Speech Recognition Hook (`web/src/components/VoiceModal.tsx:26-65`)
```typescript
  const initSpeech = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError('Web Speech API is not supported in this browser. Please type or paste below.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let current = '';
        for (let i = 0; i < event.results.length; i++) {
          current += event.results[i][0].transcript + ' ';
        }
        setTranscript(current.trim());
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setError('Microphone access denied. Please allow microphone permissions.');
        }
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
      startRecording();
    } catch (err: any) {
      setError(err.message || 'Failed to initialize microphone');
    }
  };
```

### 3.2 Dispatch in `web/src/App.tsx:572-589`
```typescript
  const handleVoiceSubmit = async (transcript: string) => {
    setProcessingStatus('Transforming voice lecture into structured questions...');
    setProcessingError(null);
    navigateTo('processing');

    try {
      const questions = await aiService.extractFromText(transcript, 'Voice Notes');
      setEditorInitialData({
        title: 'Voice Dictated Exam',
        category: 'Audio Notes',
        questions,
        existingTest: null,
      });
      navigateTo('editor');
    } catch (err: any) {
      setProcessingError(err.message || 'Failed to generate questions from voice.');
    }
  };
```

---

## 4. Audio Pipeline Comparison: Professional Audio Ingestion vs Mock.AI

| Audio Processing Step | Enterprise Audio Ingestion | Current Mock.AI Implementation |
|---|---|---|
| **Audio File Upload** | Supports MP3, WAV, M4A, FLAC up to 500MB. | **Unsupported**. No audio file picker. |
| **Speech-to-Text Model** | OpenAI Whisper Large v3 / Deepgram Nova-2. | Browser Web Speech API (`webkitSpeechRecognition`). |
| **Offline Transcription** | Local Whisper WASM or server transcription. | **Fails offline**. Browser speech API requires active Google connection. |
| **Timestamps** | Word-level and segment-level timestamps (`[00:14.200]`). | **None**. Only a flat concatenated string. |
| **Speaker Diarization** | Separates Lecturer from Student questions. | **None**. |
| **Lecture Chunking** | Splits 1-hour lectures into 10-minute topic chunks. | **None**. Only reads the first 15,000 characters. |
| **Audio Storage** | Retains audio playback synchronized to questions. | **Audio is never recorded or saved**. |

---

## 5. Current Algorithm (Step-by-Step Sequence)

1. User clicks "Voice / Audio" in `SourceSelectorModal.tsx`.
2. `VoiceModal.tsx` mounts.
3. Component checks for `window.SpeechRecognition || window.webkitSpeechRecognition`.
4. If missing (e.g. Firefox), it displays: `"Web Speech API is not supported in this browser. Please type or paste below."`
5. If supported, microphone permissions are requested.
6. The user speaks. Browser speech recognition fires `onresult` events, accumulating text into `transcript`.
7. User reviews the dictated text in the `<textarea>` and clicks "Generate Questions".
8. `recognition.stop()` terminates the audio session.
9. `App.tsx:handleVoiceSubmit(transcript)` sets status and navigates to `'processing'`.
10. `aiService.extractFromText(transcript, 'Voice Notes')` slices the transcript to 15,000 characters.
11. Prompt is transmitted to Gemini 2.5 Flash.
12. Gemini generates JSON questions.
13. `parseQuestionsJson()` normalizes to `Question[]`.
14. User edits questions in `EditorScreen.tsx` and saves to `localStorage`.

---

## 6. Forensic Evaluation & Improvement Recommendations

| Dimension | Assessment |
|---|---|
| **Strengths** | Zero backend compute cost for speech recognition (delegated to browser); real-time text transcription visualizer. |
| **Weaknesses** | Cannot ingest recorded audio files (MP3/WAV/M4A); completely broken on Firefox and Safari; no timestamps or speaker segmentation; cannot handle 60-minute university lectures; audio is never recorded. |
| **Root Causes** | Complete reliance on browser Web Speech API instead of a robust server-side or WASM audio ingestion pipeline. |
| **Missing Components** | Audio file upload handler (`<input type="file" accept="audio/*">`); Whisper / Deepgram backend service; audio waveform visualizer; chunked transcript processing with timestamp alignment. |
| **Security Risks** | Microphone permission persistence; raw voice transcripts forwarded to third-party LLMs without user consent warning. |
| **Data-Fidelity Risks** | Technical jargon and mathematical terms (e.g. "eigenvalue", "dihydrogen monoxide") are severely mistranscribed by standard browser Web Speech models. |
