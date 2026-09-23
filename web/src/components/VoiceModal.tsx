import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square, X, Sparkles, AlertCircle } from 'lucide-react';

interface VoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitText: (transcript: string) => void;
}

export const VoiceModal: React.FC<VoiceModalProps> = ({ isOpen, onClose, onSubmitText }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) {
      setTranscript('');
      setError(null);
      initSpeech();
    } else {
      stopRecording();
    }
  }, [isOpen]);

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

  const startRecording = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
        setIsRecording(true);
        setError(null);
      } catch (err) {
        console.warn('Speech start error:', err);
      }
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        // ignore
      }
      setIsRecording(false);
    }
  };

  const handleDone = () => {
    stopRecording();
    if (transcript.trim()) {
      onSubmitText(transcript.trim());
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white dark:bg-darkSurface-elev1 rounded-3xl border border-surface-border dark:border-darkSurface-border shadow-2xl p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-surface-border dark:border-darkSurface-border">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-purple-500/10 text-purple-500">
              <Mic className="w-5 h-5" />
            </span>
            <h3 className="font-bold text-lg text-surface-text dark:text-darkSurface-text">
              Voice Dictation & Recording
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-surface-muted hover:text-surface-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pulse Visualizer */}
        <div className="flex flex-col items-center justify-center py-8">
          <div className="relative flex items-center justify-center">
            {isRecording && (
              <div className="absolute w-28 h-28 rounded-full bg-brand-primary/20 animate-ping" />
            )}
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center text-white shadow-glow transition-all ${
                isRecording
                  ? 'bg-brand-red scale-105'
                  : 'bg-gradient-to-tr from-brand-primary to-brand-variant hover:scale-105'
              }`}
            >
              {isRecording ? <Square className="w-7 h-7" /> : <Mic className="w-8 h-8" />}
            </button>
          </div>
          <p className="text-xs font-semibold mt-4 text-surface-muted dark:text-darkSurface-muted">
            {isRecording ? '🎙️ Listening... Speak questions or topic' : 'Tap mic to start recording'}
          </p>
        </div>

        {/* Transcript Box */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider">
            Live Speech Transcript:
          </label>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={4}
            placeholder="Your spoken words will appear here in real time..."
            className="w-full p-3.5 rounded-2xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2 dark:bg-darkSurface-elev2 text-surface-text dark:text-darkSurface-text text-sm focus:outline-none focus:border-brand-primary resize-none"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 mt-3 p-3 rounded-xl bg-red-500/10 text-brand-red text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-surface-muted hover:text-surface-text"
          >
            Cancel
          </button>
          <button
            onClick={handleDone}
            disabled={!transcript.trim()}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant text-white text-sm font-bold shadow-md hover:brightness-110 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            <span>Generate Questions</span>
          </button>
        </div>
      </div>
    </div>
  );
};
