import { SourceAdapter, IngestionOptions, IngestionResult } from './SourceAdapter';
import { CanonicalQuestion } from '../../../types/canonicalQuestion';
import { aiProviderService } from '../../ai/aiProviderService';
import { parseCanonicalQuestionsJson } from '../../ai/adapters/adapterHelpers';
import { toLegacyQuestion } from '../questionMigrator';
import { evaluateQualityGate, QualityGateEvaluation } from '../qualityGate';
import { createIngestionError } from '../../../types/ingestionErrors';
import { AudioFileInput, LiveVoiceInput } from '../audio/types';
import { validateAudioInput } from '../audio/audioValidator';
import { processAudioFile } from '../audio/audioEngine';
import { normalizeVoiceTranscript } from '../audio/voiceNormalizer';

export interface AudioInput {
  // Feature A: Live Voice Dictation
  liveVoice?: LiveVoiceInput;
  transcript?: string; // Backwards-compatible string input

  // Feature B: Audio File Ingestion
  audioFile?: AudioFileInput;
  audioBase64?: string; // Backwards-compatible Base64 input
  audioMimeType?: string;
  fileName?: string;
}

export class AudioSourceAdapter implements SourceAdapter<AudioInput> {
  readonly sourceType = 'Audio';

  async validateInput(input: AudioInput): Promise<{ valid: boolean; error?: string }> {
    if (!input) {
      return { valid: false, error: 'Audio input payload is required.' };
    }

    // Branch B: Audio File Ingestion
    if (input.audioFile || input.audioBase64) {
      const fileInput: AudioFileInput = input.audioFile || {
        base64Data: input.audioBase64,
        fileName: input.fileName || 'uploaded_recording.mp3',
        mimeType: input.audioMimeType || 'audio/mp3',
      };
      const v = await validateAudioInput(fileInput);
      return v.valid ? { valid: true } : { valid: false, error: v.error };
    }

    // Branch A: Live Voice Dictation
    const transcriptText =
      input.liveVoice?.confirmedTranscript || input.liveVoice?.rawTranscript || input.transcript;

    if (!transcriptText || transcriptText.trim().length === 0) {
      return {
        valid: false,
        error: 'Please provide either confirmed voice dictation or upload an audio file.',
      };
    }

    if (transcriptText.trim().length < 10) {
      return {
        valid: false,
        error: 'Spoken text is too brief to generate meaningful exam questions.',
      };
    }

    return { valid: true };
  }

  async process(input: AudioInput, options?: IngestionOptions): Promise<IngestionResult> {
    // ══════════════════════════════════════════════════════════════════
    // FEATURE B: AUDIO FILE INGESTION PIPELINE
    // ══════════════════════════════════════════════════════════════════
    if (input.audioFile || input.audioBase64) {
      const fileInput: AudioFileInput = input.audioFile || {
        base64Data: input.audioBase64,
        fileName: input.fileName || 'Audio Lecture',
        mimeType: input.audioMimeType || 'audio/mp3',
      };

      const audioResult = await processAudioFile(fileInput, {
        requestedCount: options?.requestedCount || 6,
        onProgress: options?.onProgress as any,
      });

      const evaluations: QualityGateEvaluation[] = [];
      let verifiedCount = 0;
      let partialCount = 0;
      let reviewCount = 0;
      let failedCount = 0;

      audioResult.questions.forEach((q, index) => {
        q.questionNumber = index + 1;
        const evalRes = evaluateQualityGate(q);
        evaluations.push(evalRes);

        q.verificationStatus = evalRes.status;
        q.verificationReasons = evalRes.reasons;
        q.confidence = evalRes.confidence;

        if (evalRes.status === 'VERIFIED') verifiedCount++;
        else if (evalRes.status === 'PARTIAL') partialCount++;
        else if (evalRes.status === 'REVIEW_REQUIRED') reviewCount++;
        else if (evalRes.status === 'FAILED') failedCount++;
      });

      return {
        success: audioResult.questions.length > 0,
        sourceType: 'Audio',
        sourceTitle: audioResult.sourceTitle,
        questions: audioResult.questions,
        legacyQuestions: audioResult.questions.map(toLegacyQuestion),
        qualityReport: {
          total: audioResult.questions.length,
          verified: verifiedCount,
          partial: partialCount,
          reviewRequired: reviewCount,
          failed: failedCount,
          evaluations,
        },
        warnings: audioResult.warnings,
      };
    }

    // ══════════════════════════════════════════════════════════════════
    // FEATURE A: LIVE VOICE DICTATION PIPELINE
    // (User has reviewed and confirmed the speech transcript)
    // ══════════════════════════════════════════════════════════════════
    const rawText =
      input.liveVoice?.confirmedTranscript || input.liveVoice?.rawTranscript || input.transcript || '';
    const cleanTranscript = normalizeVoiceTranscript(rawText);

    if (cleanTranscript.length < 15) {
      throw createIngestionError(
        'EXTRACTION_FAILED',
        'Recorded audio transcript is too brief to generate meaningful exam questions.',
        `Clean transcript length was only ${cleanTranscript.length} chars`,
        false,
        'TRANSCRIPT_LENGTH'
      );
    }

    const count = options?.requestedCount || 6;
    const prompt = `
Source Material: Confirmed Voice Dictation
Spoken Transcript:
"""
${cleanTranscript.slice(0, 15000)}
"""

Task:
Extract and formulate exactly ${count} rigorous competitive examination questions based strictly on the spoken terminology, concepts, and formulas.
If equations or formulas were spoken, represent them in valid LaTeX $...$.

Return ONLY a valid JSON object matching this schema:
{
  "questions": [
    {
      "questionNumber": 1,
      "questionType": "MCQ",
      "questionText": "Question stem here...",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswerIndex": 0,
      "topic": "${input.fileName || 'Voice Dictation'}",
      "explanation": "Detailed step-by-step reasoning...",
      "citation": {
        "sourceExactText": "Direct quote from spoken transcript"
      }
    }
  ]
}
`;

    const active = aiProviderService.getActiveAdapter();
    if (!active) {
      throw createIngestionError(
        'AI_PROVIDER_ERROR',
        'No AI provider is configured. Please configure an AI Provider in Settings.',
        'Active adapter missing',
        false,
        'PROVIDER_SELECTION'
      );
    }

    const rawResponse = await active.adapter.generateQuestions(prompt, active.connection, { count });
    const questions = parseCanonicalQuestionsJson(JSON.stringify({ questions: rawResponse }), {
      sourceType: 'Audio',
      sourceFile: input.fileName || 'Live Voice Dictation',
    });

    const evaluations: QualityGateEvaluation[] = [];
    let verifiedCount = 0;
    let partialCount = 0;
    let reviewCount = 0;
    let failedCount = 0;

    questions.forEach((q, index) => {
      q.questionNumber = index + 1;
      q.sourceType = 'Audio';
      q.provenance = {
        ...q.provenance,
        sourceType: 'Audio',
        sourceFile: input.fileName || 'Live Voice Dictation',
        sourceExactText: q.citation?.sourceExactText || cleanTranscript.slice(0, 100),
      };

      const evalRes = evaluateQualityGate(q);
      evaluations.push(evalRes);

      q.verificationStatus = evalRes.status;
      q.verificationReasons = evalRes.reasons;
      q.confidence = evalRes.confidence;

      if (evalRes.status === 'VERIFIED') verifiedCount++;
      else if (evalRes.status === 'PARTIAL') partialCount++;
      else if (evalRes.status === 'REVIEW_REQUIRED') reviewCount++;
      else if (evalRes.status === 'FAILED') failedCount++;
    });

    return {
      success: questions.length > 0,
      sourceType: 'Audio',
      sourceTitle: `${input.fileName || 'Voice Dictated'} - Exam`,
      questions,
      legacyQuestions: questions.map(toLegacyQuestion),
      qualityReport: {
        total: questions.length,
        verified: verifiedCount,
        partial: partialCount,
        reviewRequired: reviewCount,
        failed: failedCount,
        evaluations,
      },
    };
  }
}
