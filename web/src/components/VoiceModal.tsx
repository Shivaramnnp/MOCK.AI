import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Square,
  X,
  Sparkles,
  AlertCircle,
  Upload,
  FileAudio,
  CheckCircle2,
  Sliders,
  Check,
  RefreshCw,
} from 'lucide-react';
import { normalizeVoiceTranscript } from '../services/ingestion/audio/voiceNormalizer';
import { validateAudioInput, getFormatFromExtension } from '../services/ingestion/audio/audioValidator';
import { AudioFileInput, LiveVoiceInput } from '../services/ingestion/audio/types';

interface VoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitText: (payload: string | { liveVoice?: LiveVoiceInput; audioFile?: AudioFileInput }) => void;
}

export const VoiceModal: React.FC<VoiceModalProps> = ({ isOpen, onClose, onSubmitText }) => {
  const [activeTab, setActiveTab] = useState<'live' | 'file'>('live');

  // Feature A: Live Voice Dictation State
  const [isRecording, setIsRecording] = useState(false);
  const [rawTranscript, setRawTranscript] = useState('');
  const [confirmedText, setConfirmedText] = useState('');
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);

  // Feature B: Audio File Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileValidationMessage, setFileValidationMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setFileValidationMessage(null);
      if (activeTab === 'live') {
        initSpeech();
      }
    } else {
      stopRecording();
      setRawTranscript('');
      setConfirmedText('');
      setSelectedFile(null);
    }
  }, [isOpen, activeTab]);

  const initSpeech = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError('Web Speech API is not supported in this browser. You can type notes or upload an audio file.');
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
        const cleaned = current.trim();
        setRawTranscript(cleaned);

        // Auto-normalize for candidate preview
        const normalized = normalizeVoiceTranscript(cleaned);
        setConfirmedText(normalized);
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
    } catch (err: any) {
      setError(err.message || 'Failed to initialize microphone');
    }
  };

  const startRecording = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
        setIsRecording(true);
        setError(null);
      } catch (err) {
        console.warn('Speech start error:', err);
      }
    } else {
      initSpeech();
      try {
        recognitionRef.current?.start();
        setIsRecording(true);
      } catch (err) {
        console.warn('Speech start retry error:', err);
      }
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      setIsRecording(false);
    }
  };

  // Feature A Confirmation Handler
  const handleConfirmLiveVoice = () => {
    stopRecording();
    const finalTranscript = confirmedText.trim();
    if (!finalTranscript) return;

    onSubmitText({
      liveVoice: {
        rawTranscript,
        confirmedTranscript: finalTranscript,
        timestamp: Date.now(),
      },
    });
    onClose();
  };

  // Feature B File Upload Handlers
  const handleFileSelect = async (file: File) => {
    setError(null);
    setFileValidationMessage(null);

    const validation = await validateAudioInput({
      file,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    });

    if (!validation.valid) {
      setError(validation.error || 'Invalid audio file.');
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setFileValidationMessage(
      `Accepted: ${file.name} (${validation.format?.toUpperCase()}, ${(file.size / (1024 * 1024)).toFixed(2)} MB)`
    );
  };

  const handleConfirmAudioFile = async () => {
    if (!selectedFile) return;

    onSubmitText({
      audioFile: {
        file: selectedFile,
        fileName: selectedFile.name,
        mimeType: selectedFile.type,
        sizeBytes: selectedFile.size,
      },
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-white dark:bg-darkSurface-elev1 rounded-3xl border border-surface-border dark:border-darkSurface-border shadow-2xl p-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-surface-border dark:border-darkSurface-border">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-purple-500/10 text-purple-500">
              <Mic className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-bold text-lg text-surface-text dark:text-darkSurface-text">
                Voice & Audio Ingestion
              </h3>
              <p className="text-xs text-surface-muted dark:text-darkSurface-muted">
                Live speech dictation and long lecture audio file analysis
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopRecording();
              onClose();
            }}
            className="p-1.5 rounded-lg text-surface-muted hover:text-surface-text transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-xl bg-surface-elev2 dark:bg-darkSurface-elev2 p-1 mt-4 border border-surface-border dark:border-darkSurface-border">
          <button
            type="button"
            onClick={() => {
              stopRecording();
              setActiveTab('live');
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'live'
                ? 'bg-white dark:bg-darkSurface-elev3 text-purple-600 dark:text-purple-400 shadow-sm'
                : 'text-surface-muted hover:text-surface-text'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>A: Live Voice Dictation</span>
          </button>
          <button
            type="button"
            onClick={() => {
              stopRecording();
              setActiveTab('file');
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'file'
                ? 'bg-white dark:bg-darkSurface-elev3 text-purple-600 dark:text-purple-400 shadow-sm'
                : 'text-surface-muted hover:text-surface-text'
            }`}
          >
            <FileAudio className="w-3.5 h-3.5" />
            <span>B: Audio File Ingestion</span>
          </button>
        </div>

        {/* TAB A: LIVE VOICE DICTATION */}
        {activeTab === 'live' && (
          <div className="mt-4 space-y-4">
            {/* Visualizer & Record Button */}
            <div className="flex flex-col items-center justify-center py-6 bg-surface-elev2/50 dark:bg-darkSurface-elev2/50 rounded-2xl border border-surface-border dark:border-darkSurface-border">
              <div className="relative flex items-center justify-center">
                {isRecording && (
                  <div className="absolute w-24 h-24 rounded-full bg-purple-500/20 animate-ping" />
                )}
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`relative z-10 w-16 h-16 rounded-full flex items-center justify-center text-white shadow-glow transition-all ${
                    isRecording
                      ? 'bg-red-500 scale-105'
                      : 'bg-gradient-to-tr from-purple-600 to-brand-primary hover:scale-105'
                  }`}
                >
                  {isRecording ? <Square className="w-6 h-6" /> : <Mic className="w-7 h-7" />}
                </button>
              </div>
              <p className="text-xs font-semibold mt-3 text-surface-muted dark:text-darkSurface-muted">
                {isRecording ? '🎙️ Listening... Speak questions or topic' : 'Tap mic to start dictating'}
              </p>
            </div>

            {/* Transcript Confirmation Box */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-500" />
                  <span>Review & Confirm Spoken Text:</span>
                </label>
                <span className="text-[11px] text-surface-muted">
                  Auto-formatted with LaTeX math & filler cleanup
                </span>
              </div>
              <textarea
                value={confirmedText}
                onChange={(e) => setConfirmedText(e.target.value)}
                rows={4}
                placeholder="Spoken words will appear here. You can edit before generating questions..."
                className="w-full p-3 rounded-2xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text text-xs focus:outline-none focus:border-brand-primary resize-none font-mono"
              />
            </div>

            {/* Confirmation Directives */}
            <p className="text-[11px] text-surface-muted dark:text-darkSurface-muted">
              ⚠️ Strict verification: The test is generated <strong>only after you confirm</strong> the transcription above.
            </p>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  stopRecording();
                  onClose();
                }}
                className="px-4 py-2 text-xs font-semibold text-surface-muted hover:text-surface-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmLiveVoice}
                disabled={!confirmedText.trim()}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-brand-primary text-white text-xs font-bold shadow-md hover:brightness-110 disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                <span>Confirm & Generate Questions</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB B: AUDIO FILE INGESTION */}
        {activeTab === 'file' && (
          <div className="mt-4 space-y-4">
            {/* Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileSelect(file);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`p-8 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                isDragOver
                  ? 'border-purple-500 bg-purple-500/10'
                  : 'border-surface-border dark:border-darkSurface-border bg-surface-elev2/50 hover:border-purple-400'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.wav,.m4a,.ogg,.aac,.flac,.webm"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />
              <FileAudio className="w-10 h-10 text-purple-500 mb-2" />
              <p className="text-xs font-bold text-surface-text dark:text-darkSurface-text mb-1">
                Drop audio recording here or click to browse
              </p>
              <p className="text-[11px] text-surface-muted dark:text-darkSurface-muted">
                Supports MP3, WAV, M4A, OGG, AAC, FLAC, WEBM (Max 100 MB)
              </p>
            </div>

            {/* File Info / Validation Pill */}
            {fileValidationMessage && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs font-medium border border-purple-500/20">
                <Check className="w-4 h-4 shrink-0" />
                <span>{fileValidationMessage}</span>
              </div>
            )}

            <div className="p-3 rounded-xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border dark:border-darkSurface-border text-[11px] text-surface-muted space-y-1">
              <p className="font-semibold text-surface-text dark:text-darkSurface-text">
                Long Audio Architecture:
              </p>
              <p>• Automatically partitions recordings into 5–15 minute logical semantic chunks</p>
              <p>• Retains speaker tags, timestamps, and quotes for provenance</p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-surface-muted hover:text-surface-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAudioFile}
                disabled={!selectedFile}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-brand-primary text-white text-xs font-bold shadow-md hover:brightness-110 disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                <span>Transcribe & Ingest Audio</span>
              </button>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="flex items-center gap-2 mt-4 p-3 rounded-xl bg-red-500/10 text-brand-red text-xs border border-red-500/20">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
};
