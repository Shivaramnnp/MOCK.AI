import { describe, it, expect, vi } from 'vitest';
import { PdfSourceAdapter } from './PdfSourceAdapter';
import { OfficeSourceAdapter, extractTextFromPptx } from './OfficeSourceAdapter';
import { TopicSourceAdapter } from './TopicSourceAdapter';
import { YouTubeSourceAdapter, extractYouTubeVideoId } from './YouTubeSourceAdapter';
import { WebUrlSourceAdapter, isSafePublicUrl, extractCleanArticleText } from './WebUrlSourceAdapter';
import { ImageSourceAdapter } from './ImageSourceAdapter';
import { CameraSourceAdapter } from './CameraSourceAdapter';
import { AudioSourceAdapter } from './AudioSourceAdapter';
import { ManualSourceAdapter } from './ManualSourceAdapter';
import { JsonSourceAdapter } from './JsonSourceAdapter';
import { ingestionService } from '../ingestionService';

describe('Source Ingestion Adapters (All 10 Modalities)', () => {
  describe('Source 01: PDF Document Adapter', () => {
    const adapter = new PdfSourceAdapter();

    it('should validate PDF base64 input correctly', async () => {
      expect((await adapter.validateInput({ base64Data: '', fileName: 'test.pdf' })).valid).toBe(false);
      expect((await adapter.validateInput({ base64Data: 'JVBERi0xLjQKJcTl8uXr', fileName: 'test.pdf' })).valid).toBe(false); // too short
      expect((await adapter.validateInput({ base64Data: 'JVBERi0xLjQK' + 'A'.repeat(200), fileName: 'test.pdf' })).valid).toBe(true);
    });

    it('should reject PDFs exceeding the 20MB limit with a friendly message', async () => {
      const hugeBase64 = 'A'.repeat(29 * 1024 * 1024);
      const res = await adapter.validateInput({ base64Data: hugeBase64, fileName: 'huge.pdf' });
      expect(res.valid).toBe(false);
      expect(res.error).toContain('larger than 20MB');
    });
  });

  describe('Source 02: Word & PowerPoint Adapter', () => {
    const adapter = new OfficeSourceAdapter();

    it('should validate arrayBuffer input', async () => {
      expect((await adapter.validateInput({ arrayBuffer: new ArrayBuffer(10), fileName: 'test.docx' })).valid).toBe(false);
      expect((await adapter.validateInput({ arrayBuffer: new ArrayBuffer(1024), fileName: 'test.docx' })).valid).toBe(true);
    });
  });

  describe('Source 03: Topic Name Adapter', () => {
    const adapter = new TopicSourceAdapter();

    it('should validate topic and question count bounds', async () => {
      expect((await adapter.validateInput({ topic: '' })).valid).toBe(false);
      expect((await adapter.validateInput({ topic: '  ' })).valid).toBe(false);
      expect((await adapter.validateInput({ topic: 'Thermodynamics', count: 0 })).valid).toBe(false);
      expect((await adapter.validateInput({ topic: 'Thermodynamics', count: 150 })).valid).toBe(false);
      expect((await adapter.validateInput({ topic: 'Thermodynamics', count: 10 })).valid).toBe(true);
    });
  });

  describe('Source 04: YouTube Video Adapter', () => {
    const adapter = new YouTubeSourceAdapter();

    it('should extract video ID from standard watch, share, shorts, and embed URLs', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ?si=test')).toBe('dQw4w9WgXcQ');
      expect(extractYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(extractYouTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(extractYouTubeVideoId('https://example.com/not-youtube')).toBeNull();
    });

    it('should reject invalid YouTube links during validation', async () => {
      const res = await adapter.validateInput({ url: 'https://vimeo.com/12345' });
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Invalid YouTube URL');
    });
  });

  describe('Source 05: Web URL Adapter', () => {
    const adapter = new WebUrlSourceAdapter();

    it('should enforce strict SSRF security against internal and cloud metadata IPs', () => {
      expect(isSafePublicUrl('http://localhost:3000/api').safe).toBe(false);
      expect(isSafePublicUrl('http://127.0.0.1:8080').safe).toBe(false);
      expect(isSafePublicUrl('http://169.254.169.254/latest/meta-data/').safe).toBe(false);
      expect(isSafePublicUrl('http://10.0.0.5/admin').safe).toBe(false);
      expect(isSafePublicUrl('http://192.168.1.1').safe).toBe(false);
      expect(isSafePublicUrl('http://172.20.0.1').safe).toBe(false);
      expect(isSafePublicUrl('file:///etc/passwd').safe).toBe(false);
      expect(isSafePublicUrl('ftp://example.com').safe).toBe(false);

      // Safe public domains
      expect(isSafePublicUrl('https://en.wikipedia.org/wiki/General_Relativity').safe).toBe(true);
      expect(isSafePublicUrl('https://gate2025.iitr.ac.in').safe).toBe(true);
    });

    it('should cleanly strip scripts, styles, and markup to extract article content', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Quantum Mechanics Fundamentals</title>
            <style>body { color: red; }</style>
            <script>alert('bad');</script>
          </head>
          <body>
            <nav><a href="/">Home</a></nav>
            <article>
              <h1>Principles of Superposition</h1>
              <p>In quantum mechanics, particles can exist in a linear combination of states.</p>
            </article>
            <footer>Copyright 2026</footer>
          </body>
        </html>
      `;
      const { title, text } = extractCleanArticleText(html);
      expect(title).toBe('Quantum Mechanics Fundamentals');
      expect(text).toContain('Principles of Superposition');
      expect(text).toContain('linear combination of states');
      expect(text).not.toContain('alert');
      expect(text).not.toContain('color: red');
      expect(text).not.toContain('<nav>');
    });
  });

  describe('Source 06: Image / Photo Adapter', () => {
    const adapter = new ImageSourceAdapter();

    it('should validate base64 image data', async () => {
      expect((await adapter.validateInput({ base64Data: '', mimeType: 'image/png' })).valid).toBe(false);
      expect((await adapter.validateInput({ base64Data: 'iVBORw0KGgo' + 'A'.repeat(150), mimeType: 'image/png' })).valid).toBe(true);
    });
  });

  describe('Source 07: Camera Scan Adapter', () => {
    const adapter = new CameraSourceAdapter();

    it('should delegate camera snapshot validation to image validator', async () => {
      expect((await adapter.validateInput({ base64Data: '' })).valid).toBe(false);
      expect((await adapter.validateInput({ base64Data: 'data:image/jpeg;base64,' + 'A'.repeat(200) })).valid).toBe(true);
    });
  });

  describe('Source 08: Voice / Audio Adapter', () => {
    const adapter = new AudioSourceAdapter();

    it('should validate speech transcript or audio file presence', async () => {
      expect((await adapter.validateInput({})).valid).toBe(false);
      expect((await adapter.validateInput({ transcript: '   ' })).valid).toBe(false);
      expect((await adapter.validateInput({ transcript: 'Photosynthesis occurs in chloroplasts generating ATP and NADPH.' })).valid).toBe(true);
      expect((await adapter.validateInput({ audioBase64: 'UklGRiQAAABXQVZFZ' })).valid).toBe(true);
    });
  });

  describe('Source 09: Manual Entry Adapter', () => {
    const adapter = new ManualSourceAdapter();

    it('should process manual questions with non-standard option counts, MSQ, and NAT without corruption', async () => {
      const result = await adapter.process({
        title: 'Mixed Competitive Practice',
        questions: [
          {
            questionNumber: 1,
            questionText: 'Is the following statement True or False: Entropy always increases in an isolated system?',
            options: [{ text: 'True' }, { text: 'False' }],
            correctAnswerIndex: 0,
          },
          {
            questionNumber: 2,
            questionText: 'Select all prime numbers less than 10:',
            questionType: 'MSQ',
            options: [{ text: '2' }, { text: '3' }, { text: '4' }, { text: '5' }],
            correctAnswerIndices: [0, 1, 3],
          },
          {
            questionNumber: 3,
            questionText: 'Compute the value of 5! (5 factorial):',
            questionType: 'NAT',
            options: [],
            natValue: 120,
            natRange: { min: 120, max: 120 },
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.questions.length).toBe(3);

      // Q1: Exactly 2 options preserved without fake padding!
      expect(result.questions[0].options.length).toBe(2);
      expect(result.questions[0].options.map((o) => o.text)).toEqual(['True', 'False']);

      // Q2: MSQ with multiple correct answers preserved!
      expect(result.questions[1].questionType).toBe('MSQ');
      expect(result.questions[1].answer.correctOptionIndices).toEqual([0, 1, 3]);

      // Q3: NAT with numeric range preserved!
      expect(result.questions[2].questionType).toBe('NAT');
      expect(result.questions[2].answer.natValue).toBe(120);
    });
  });

  describe('Source 10: JSON Data Adapter', () => {
    const adapter = new JsonSourceAdapter();

    it('should validate JSON syntax', async () => {
      expect((await adapter.validateInput({ jsonText: '' })).valid).toBe(false);
      expect((await adapter.validateInput({ jsonText: '{ broken: json' })).valid).toBe(false);
      expect((await adapter.validateInput({ jsonText: '{"questions": []}' })).valid).toBe(true);
    });

    it('should preserve rich competitive question metadata during JSON import', async () => {
      const sampleJson = JSON.stringify({
        title: 'GATE Sample Import',
        questions: [
          {
            id: 'gate-sample-q1',
            questionNumber: 1,
            questionText: 'What is the eigenvalues of $\\begin{pmatrix} 2 & 0 \\\\ 0 & 3 \\end{pmatrix}$?',
            questionType: 'MCQ',
            options: ['2 and 3', '1 and 5', '0 and 6', '4 and 9', 'None of these'], // 5 options!
            correctAnswerIndex: 0,
            marks: 2,
            negativeMarks: 0.66,
            diagramUrl: '/exam-assets/sample_diag.png',
            contentBlocks: [
              {
                type: 'text',
                content: 'What is the eigenvalues of $\\begin{pmatrix} 2 & 0 \\\\ 0 & 3 \\end{pmatrix}$?',
              },
            ],
          },
        ],
      });

      const result = await adapter.process({ jsonText: sampleJson });

      expect(result.success).toBe(true);
      expect(result.questions.length).toBe(1);

      const q = result.questions[0];
      // Check 5 options NOT truncated to 4!
      expect(q.options.length).toBe(5);
      expect(q.options[4].text).toBe('None of these');
      // Check marks preserved
      expect(q.scoring.marks).toBe(2);
      expect(q.scoring.negativeMarks).toBe(0.66);
      // Check diagram preserved
      expect(q.diagramUrl).toBe('/exam-assets/sample_diag.png');
    });
  });

  describe('Unified IngestionService Registry', () => {
    it('should resolve adapters for all 10 source types without exception', () => {
      const types = [
        'PDF',
        'Docx',
        'Topic',
        'YouTube',
        'WebUrl',
        'Image',
        'Camera',
        'Audio',
        'Manual',
        'Json',
      ] as const;

      for (const t of types) {
        const adp = ingestionService.getAdapter(t);
        expect(adp).toBeDefined();
        expect(adp.sourceType).toBe(t);
      }
    });
  });
});
