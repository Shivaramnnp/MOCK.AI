import { SourceAdapter, IngestionOptions, IngestionResult } from './SourceAdapter';
import { CanonicalQuestion } from '../../../types/canonicalQuestion';
import { aiProviderService } from '../../ai/aiProviderService';
import { parseCanonicalQuestionsJson } from '../../ai/adapters/adapterHelpers';
import { toLegacyQuestion } from '../questionMigrator';
import { evaluateQualityGate, QualityGateEvaluation } from '../qualityGate';
import { createIngestionError } from '../../../types/ingestionErrors';

export interface AudioInput {
  transcript?: string;
  audioBase64?: string;
  audioMimeType?: string;
  fileName?: string;
}

export class AudioSourceAdapter implements SourceAdapter<AudioInput> {
  readonly sourceType = 'Audio';

  async validateInput(input: AudioInput): Promise<{ valid: boolean; error?: string }> {
    if (!input) {
      return { valid: false, error: 'Audio input payload is required.' };
    }
    const hasTranscript = typeof input.transcript === 'string' && input.transcript.trim().length > 0;
    const hasAudio = typeof input.audioBase64 === 'string' && input.audioBase64.trim().length > 0;

    if (!hasTranscript && !hasAudio) {
      return { valid: false, error: 'Please provide either a transcribed text or an audio recording.' };
    }
    return { valid: true };
  }

  async process(input: AudioInput, options?: IngestionOptions): Promise<IngestionResult> {
    let cleanTranscript = (input.transcript || '').trim();

    // If an audio file was uploaded without prior transcript, check if active provider or backend can transcribe
    if (!cleanTranscript && input.audioBase64) {
      const active = aiProviderService.getActiveAdapter();
      if (active && active.adapter.extractFromBase64File) {
        // Many multimodal LLMs (e.g. Gemini 2.5) support audio/mp3, audio/wav, audio/m4a directly!
        const mime = input.audioMimeType || 'audio/mp3';
        const questions = await active.adapter.extractFromBase64File(
          input.audioBase64,
          mime,
          input.fileName || 'Audio Lecture',
          active.connection
        );
        const jsonStr = JSON.stringify({ questions });
        const canonicalQuestions = parseCanonicalQuestionsJson(jsonStr, {
          sourceType: 'Audio',
          sourceFile: input.fileName || 'Audio Lecture',
        });

        const evaluations: QualityGateEvaluation[] = [];
        let verifiedCount = 0;
        let partialCount = 0;
        let reviewCount = 0;
        let failedCount = 0;

        canonicalQuestions.forEach((q, index) => {
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
          success: canonicalQuestions.length > 0,
          sourceType: 'Audio',
          sourceTitle: input.fileName || 'Audio Lecture Mock Exam',
          questions: canonicalQuestions,
          legacyQuestions: canonicalQuestions.map(toLegacyQuestion),
          qualityReport: {
            total: canonicalQuestions.length,
            verified: verifiedCount,
            partial: partialCount,
            reviewRequired: reviewCount,
            failed: failedCount,
            evaluations,
          },
        };
      } else {
        throw createIngestionError(
          'TRANSCRIPTION_FAILED',
          'Direct audio file transcription requires an AI provider that supports audio input (e.g. Gemini 2.5). Please use voice dictation or switch providers in Settings.',
          'Active adapter lacks audio multimodal capability',
          false,
          'AUDIO_TRANSCRIPTION'
        );
      }
    }

    if (cleanTranscript.length < 20) {
      throw createIngestionError(
        'EXTRACTION_FAILED',
        'Recorded audio transcript is too brief to generate meaningful exam questions.',
        `Transcript length was only ${cleanTranscript.length} chars`,
        false,
        'TRANSCRIPT_LENGTH'
      );
    }

    const count = options?.requestedCount || 6;
    const prompt = `
Source Material: Audio Lecture Dictation
Title: "${input.fileName || 'Dictated Notes'}"

Spoken Transcript Content:
"""
${cleanTranscript.slice(0, 15000)}
"""

Task:
Extract and formulate exactly ${count} rigorous competitive examination questions based strictly on the ideas, formulas, and terminology spoken in this audio.
If equations or formulas are mentioned, convert to LaTeX $...$.

Return ONLY a valid JSON object:
{
  "questions": [
    {
      "questionNumber": 1,
      "questionType": "MCQ",
      "questionText": "Question stem here...",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswerIndex": 0,
      "topic": "${input.fileName || 'Audio Notes'}",
      "explanation": "Detailed step-by-step reasoning...",
      "citation": {
        "sourceExactText": "Direct quote from audio transcript"
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
      sourceFile: input.fileName || 'Audio Dictation',
    });

    const evaluations: QualityGateEvaluation[] = [];
    let verifiedCount = 0;
    let partialCount = 0;
    let reviewCount = 0;
    let failedCount = 0;

    questions.forEach((q, index) => {
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
