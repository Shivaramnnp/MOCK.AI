# SOURCE 07 — CAMERA SCAN: FORENSIC DISCOVERY REPORT
**MOCK.AI Source Ingestion Algorithm Discovery**  
**Date**: 2026-09-28  
**Scope**: In-depth trace of live camera capture, WebRTC video streams, canvas rasterization, and document scanning.  
**Integrity Mode**: Read-Only Audit (Zero Production Code Changes).

---

## 1. Executive Summary: The Shared Image Pipeline Reality

In the Create Mock Test UI (`SourceSelectorModal.tsx:93-100`), Option 7 is presented as:
> **Camera Scan** — *"Scan physical exam paper live"*

Our forensic investigation reveals that **Camera Scan does NOT have a separate processing pipeline**:
1. **Frontend Capture Only**: It provides a React WebRTC modal (`web/src/components/CameraModal.tsx`) that accesses `navigator.mediaDevices.getUserMedia()`, captures a video frame to an HTML5 `<canvas>`, and encodes it as a JPEG data URL.
2. **Funneled into Source 6**: Once captured, `App.tsx:handleCameraCapture()` immediately forwards the Base64 image to the exact same function used by the Image/Photo source:
   `aiService.extractFromBase64File(base64Data, 'image/jpeg', 'Camera Scan')`
3. **Missing Computer Vision Pipeline**: There is **no document edge detection, no perspective unwarping, no shadow removal, no binarization, and no local OCR**. If the candidate holds the exam paper at an angle or under dim lighting, the raw, skewed video frame is sent directly to Gemini.

---

## 2. Technical Pipeline Trace

```
USER ACTION (Tap "Camera Scan")
    ↓
UI COMPONENT (`CameraModal.tsx`)
    ↓
DEVICE PERMISSION: `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })`
    ↓
LIVE VIEWPORT: `<video ref={videoRef} autoPlay playsInline muted />`
    ↓
CAPTURE TRIGGER: User taps "Capture Page"
    ↓
FRAME RASTERIZATION:
  `canvas.width = video.videoWidth || 1280;`
  `canvas.height = video.videoHeight || 720;`
  `ctx.drawImage(video, 0, 0, canvas.width, canvas.height);`
  `const dataUrl = canvas.toDataURL('image/jpeg', 0.9);`
    ↓
PREVIEW & CONFIRM: User taps "Extract MCQs" (`confirmPhoto()`)
    ↓
DISPATCH (`App.tsx:handleCameraCapture(dataUrl)`)
    ↓
    │  [PIPELINE MERGE: CALLS THE IDENTICAL IMAGE PIPELINE]
    ▼
SERVICE CALL: `aiService.ts:extractFromBase64File(dataUrl, 'image/jpeg', 'Camera Scan')`
    ↓
REMOTE INFERENCE (`POST /generateContent` with inline Base64 JPEG to Gemini 2.5 Flash)
    ↓
NORMALIZATION (`adapterHelpers.ts:parseQuestionsJson()`)
    ↓
DISCARD FRAME: Captured canvas image is discarded from memory
    ↓
CURATION (`EditorScreen.tsx`)
    ↓
PERSISTENCE (`storage.ts:saveTest()` -> `localStorage['mockai_tests']`)
```

---

## 3. Forensic Code Inspection

### 3.1 WebRTC Initialization (`web/src/components/CameraModal.tsx:28-43`)
```typescript
  const startCamera = async () => {
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setError('Camera access denied or unavailable. Please check browser permissions.');
    }
  };
```

### 3.2 Canvas Frame Capture (`web/src/components/CameraModal.tsx:52-65`)
```typescript
  const takePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setCapturedImage(dataUrl);
      stopCamera();
    }
  };
```

### 3.3 The Dispatch Merge in `web/src/App.tsx:553-570`
```typescript
  const handleCameraCapture = async (base64Data: string) => {
    setProcessingStatus('Scanning page photo with AI Vision...');
    setProcessingError(null);
    navigateTo('processing');

    try {
      const questions = await aiService.extractFromBase64File(base64Data, 'image/jpeg', 'Camera Scan');
      setEditorInitialData({
        title: 'Camera Scanned Exam',
        category: 'Physical Exam',
        questions,
        existingTest: null,
      });
      navigateTo('editor');
    } catch (err: any) {
      setProcessingError(err.message || 'Failed to scan image.');
    }
  };
```

---

## 4. Computer Vision Audit: Expected Scanner vs Mock.AI Reality

| Scanning Capability | Professional Document Scanner | Current Mock.AI Implementation |
|---|---|---|
| **Document Boundary Detection** | OpenCV Canny edge / polygon contour detection. | **None**. Only a static CSS dashed box overlay (`border-dashed`). |
| **Perspective Correction** | Four-point homography transform to flatten angled pages. | **None**. Skewed frames sent raw. |
| **Keystone & Curvature Correction**| Cylindrical unwarping for curved textbook spines. | **None**. Warped text sent raw. |
| **Illumination / Shadow Removal**| Local adaptive thresholding or background normalization. | **None**. Harsh shadows degrade OCR. |
| **Resolution Management** | Captures full sensor resolution (e.g. 12MP–48MP). | Limited to WebRTC video stream (typically 1280x720 or 1920x1080). Small font becomes blurry. |
| **Multi-Page Scanning** | Batch scans multiple pages into single exam. | **Single-shot only**. Cannot scan page 2 without restarting. |

---

## 5. Current Algorithm (Step-by-Step Sequence)

1. User clicks "Camera Scan" in `SourceSelectorModal.tsx`.
2. `CameraModal.tsx` mounts and invokes `navigator.mediaDevices.getUserMedia()`.
3. Candidate grants camera permissions; rear camera stream displays in `<video>`.
4. User positions paper within the CSS dashed frame and clicks "Capture Page".
5. `takePhoto()` renders the current video frame onto an HTML5 canvas at video resolution (e.g. 1280x720) and serializes to JPEG at 0.9 quality.
6. Camera tracks are stopped to save battery.
7. Candidate inspects the snapshot and clicks "Extract MCQs".
8. `App.tsx:handleCameraCapture()` navigates to `'processing'` and passes the JPEG Data URL to `aiService.extractFromBase64File()`.
9. The Base64 string is transmitted to Gemini 2.5 Flash.
10. Gemini transcribes visible questions into JSON.
11. `parseQuestionsJson()` coerces questions into `Question[]`.
12. The captured photo is discarded from memory.
13. User reviews text questions in `EditorScreen.tsx` and saves to `localStorage`.

---

## 6. Forensic Evaluation & Improvement Recommendations

| Dimension | Assessment |
|---|---|
| **Strengths** | Direct zero-install camera integration in browser using standard WebRTC APIs. |
| **Weaknesses** | Not a genuine document scanner; no edge detection, de-warping, or perspective flattening; video stream resolution limits legibility of dense textbook fonts; single-page only; captured image is discarded. |
| **Root Causes** | Complete lack of client-side computer vision processing (e.g. OpenCV.js / WASM contour detection). |
| **Missing Components** | OpenCV.js document boundary detector and homography transform; multi-page scanning session manager; high-res camera capture via `ImageCapture` API (instead of video frame grab); flash/torch toggle control. |
| **Security Risks** | Lingering MediaStream tracks if modal unmounts prematurely; camera permission denial errors on desktop browsers without webcams. |
| **Data-Fidelity Risks** | Angled or curved page captures cause severe text transcription errors by Gemini Vision. |
