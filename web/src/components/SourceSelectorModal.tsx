import React, { useRef } from 'react';
import {
  FileText,
  FileCode,
  Globe,
  Youtube,
  GraduationCap,
  Image as ImageIcon,
  Camera,
  Mic,
  PenTool,
  Code2,
  X,
  Sparkles,
} from 'lucide-react';
import { InputSourceType } from '../types';

interface SourceSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSource: (type: InputSourceType, payload?: any) => void;
}

interface SourceOption {
  type: InputSourceType;
  title: string;
  description: string;
  emoji: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

export const SourceSelectorModal: React.FC<SourceSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelectSource,
}) => {
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const docxInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const sources: SourceOption[] = [
    {
      type: 'PDF',
      title: 'PDF Document',
      description: 'Upload textbook or exam PDF',
      emoji: '📄',
      icon: FileText,
      color: 'bg-red-500/10 text-red-500 border-red-500/20',
    },
    {
      type: 'Docx',
      title: 'Word / PPT',
      description: 'Upload DOCX or PPTX notes',
      emoji: '📝',
      icon: FileCode,
      color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    },
    {
      type: 'Topic',
      title: 'Topic Name',
      description: 'AI generates custom syllabus test',
      emoji: '🎯',
      icon: GraduationCap,
      color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    },
    {
      type: 'YouTube',
      title: 'YouTube Video',
      description: 'Extract transcript & generate MCQs',
      emoji: '▶️',
      icon: Youtube,
      color: 'bg-red-600/10 text-red-600 border-red-600/20',
    },
    {
      type: 'WebUrl',
      title: 'Web URL',
      description: 'Scrape online article or Wikipedia',
      emoji: '🌐',
      icon: Globe,
      color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
    },
    {
      type: 'Image',
      title: 'Image / Photo',
      description: 'Upload textbook photos or diagram',
      emoji: '🖼️',
      icon: ImageIcon,
      color: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    },
    {
      type: 'Camera',
      title: 'Camera Scan',
      description: 'Scan physical exam paper live',
      emoji: '📷',
      icon: Camera,
      color: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
    },
    {
      type: 'Audio',
      title: 'Voice / Audio',
      description: 'Record lecture or dictate queries',
      emoji: '🎙️',
      icon: Mic,
      color: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    },
    {
      type: 'Manual',
      title: 'Manual Entry',
      description: 'Write or paste questions yourself',
      emoji: '✏️',
      icon: PenTool,
      color: 'bg-pink-500/10 text-pink-500 border-pink-500/20',
    },
    {
      type: 'Json',
      title: 'JSON Data',
      description: 'Paste structured test JSON',
      emoji: '{ }',
      icon: Code2,
      color: 'bg-teal-500/10 text-teal-500 border-teal-500/20',
    },
  ];

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white dark:bg-darkSurface-elev1 rounded-3xl border border-surface-border dark:border-darkSurface-border shadow-2xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
        {/* Hidden File Inputs */}
        <input
          type="file"
          ref={pdfInputRef}
          accept="application/pdf"
          className="hidden"
          onChange={(e) => handleFileUpload(e, 'PDF')}
        />
        <input
          type="file"
          ref={docxInputRef}
          accept=".docx,.pptx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          className="hidden"
          onChange={(e) => handleFileUpload(e, 'Docx')}
        />
        <input
          type="file"
          ref={imageInputRef}
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFileUpload(e, 'Image')}
        />

        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-surface-border dark:border-darkSurface-border">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-brand-primary/10 text-brand-primary">
                <Sparkles className="w-5 h-5" />
              </span>
              <h2 className="font-display font-bold text-xl sm:text-2xl text-surface-text dark:text-darkSurface-text">
                Create Mock Test
              </h2>
            </div>
            <p className="text-sm text-surface-muted dark:text-darkSurface-muted mt-1">
              Select an input source to extract or automatically generate MCQs
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-surface-muted hover:bg-surface-elev2 dark:hover:bg-darkSurface-elev2 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 10 Ingestion Options Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
          {sources.map((src) => {
            const Icon = src.icon;
            return (
              <button
                key={src.type}
                onClick={() => {
                  if (src.type === 'PDF') {
                    pdfInputRef.current?.click();
                  } else if (src.type === 'Docx') {
                    docxInputRef.current?.click();
                  } else if (src.type === 'Image') {
                    imageInputRef.current?.click();
                  } else {
                    onSelectSource(src.type);
                    onClose();
                  }
                }}
                className="group relative flex items-center gap-4 p-3.5 rounded-2xl border border-surface-border dark:border-darkSurface-border bg-surface-elev1 dark:bg-darkSurface-elev2 hover:border-brand-primary hover:shadow-md active:scale-[0.98] transition-all text-left"
              >
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center border font-semibold text-lg shrink-0 ${src.color}`}
                >
                  <Icon className="w-6 h-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm text-surface-text dark:text-darkSurface-text group-hover:text-brand-primary transition-colors">
                      {src.title}
                    </span>
                    <span className="text-xs">{src.emoji}</span>
                  </div>
                  <p className="text-xs text-surface-muted dark:text-darkSurface-muted truncate mt-0.5">
                    {src.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
