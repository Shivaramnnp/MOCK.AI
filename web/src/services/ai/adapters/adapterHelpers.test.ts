import { describe, it, expect } from 'vitest';
import {
  parseCanonicalQuestionsJson,
  parseQuestionsJson,
  extractJsonPayload,
  sanitizeErrorMessage,
} from './adapterHelpers';

describe('Adapter Helpers & LLM Normalization', () => {
  it('should extract JSON payload from raw markdown code blocks', () => {
    const raw = `
Here is the extracted test:
\`\`\`json
{
  "questions": [
    {
      "questionText": "What is the speed of light?",
      "options": ["3e8 m/s", "2e8 m/s"],
      "correctAnswerIndex": 0
    }
  ]
}
\`\`\`
Hope this helps!
`;
    const payload = extractJsonPayload(raw);
    expect(payload.questions.length).toBe(1);
    expect(payload.questions[0].questionText).toBe('What is the speed of light?');
  });

  it('should NOT silently pad options to 4 with fake dummy text', () => {
    const raw = JSON.stringify({
      questions: [
        {
          questionText: 'A true/false question?',
          options: ['True', 'False'],
          correctAnswerIndex: 0,
        },
      ],
    });

    const canonical = parseCanonicalQuestionsJson(raw);
    expect(canonical[0].options.length).toBe(2);
    expect(canonical[0].options.map((o) => o.text)).toEqual(['True', 'False']);

    // Check legacy representation also preserves actual options without fake Option C, Option D
    const legacy = parseQuestionsJson(raw);
    expect(legacy[0].options.length).toBe(2);
    expect(legacy[0].options).toEqual(['True', 'False']);
  });

  it('should NOT silently delete options beyond 4', () => {
    const raw = JSON.stringify({
      questions: [
        {
          questionText: 'Which option matches best?',
          options: ['A', 'B', 'C', 'D', 'E'],
          correctAnswerIndex: 4,
        },
      ],
    });

    const canonical = parseCanonicalQuestionsJson(raw);
    expect(canonical[0].options.length).toBe(5);
    expect(canonical[0].answer.correctOptionIndex).toBe(4);

    const legacy = parseQuestionsJson(raw);
    expect(legacy[0].options.length).toBe(5);
    expect(legacy[0].correctAnswerIndex).toBe(4);
  });

  it('should NOT silently coerce an invalid or missing answer to Option A (0)', () => {
    const raw = JSON.stringify({
      questions: [
        {
          questionText: 'What is the answer to this unsolved problem?',
          options: ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
          // Missing correctAnswerIndex or invalid
          correctAnswerIndex: -1,
        },
      ],
    });

    const canonical = parseCanonicalQuestionsJson(raw);
    expect(canonical[0].answer.correctOptionIndex).toBeUndefined();
    expect(canonical[0].verificationStatus).toBe('REVIEW_REQUIRED');
    expect(canonical[0].confidence.answer).toBe(0.0);
    expect(canonical[0].verificationReasons.some((r) => r.includes('NEVER silently coerce to Option A'))).toBe(true);

    const legacy = parseQuestionsJson(raw);
    // Legacy correctAnswerIndex should be -1, NOT coerced to 0!
    expect(legacy[0].correctAnswerIndex).toBe(-1);
    expect(legacy[0].verificationStatus).not.toBe('VERIFIED');
  });

  it('should parse MSQ and NAT questions faithfully', () => {
    const raw = JSON.stringify({
      questions: [
        {
          questionText: 'Which of the following are prime numbers?',
          questionType: 'MSQ',
          options: ['2', '3', '4', '5'],
          correctAnswerIndices: [0, 1, 3],
        },
        {
          questionText: 'Evaluate the limit as x -> 0 of sin(x)/x.',
          questionType: 'NAT',
          options: [],
          answerRange: { min: 1, max: 1 },
        },
      ],
    });

    const canonical = parseCanonicalQuestionsJson(raw);
    expect(canonical[0].questionType).toBe('MSQ');
    expect(canonical[0].answer.correctOptionIndices).toEqual([0, 1, 3]);

    expect(canonical[1].questionType).toBe('NAT');
    expect(canonical[1].answer.natRange).toEqual({ min: 1, max: 1 });
  });

  it('should sanitize and redact API keys from error messages', () => {
    const secret = 'AIzaSyDemoSecretKeyForGoogleApi12345';
    const errorMsg = `Error connecting with key ${secret}: 401 Unauthorized`;
    const sanitized = sanitizeErrorMessage(errorMsg, secret);

    expect(sanitized).not.toContain(secret);
    expect(sanitized).toContain('Authentication failed');
  });
});
