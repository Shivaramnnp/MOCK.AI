import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aiService } from './aiService';

describe('AiService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should generate smart local mock questions when offline or fallback is triggered', () => {
    const questions = aiService.generateSmartLocalMock('Quantum Physics', 4);
    expect(questions.length).toBe(4);
    questions.forEach((q) => {
      expect(q.options.length).toBe(4);
      expect(q.correctAnswerIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctAnswerIndex).toBeLessThanOrEqual(3);
      expect(q.questionText).toBeTruthy();
      expect(q.verificationStatus).toBe('VERIFIED');
    });
  });

  it('should correctly repair questions with missing options in fixQuestions fallback', async () => {
    // Mock fetch to simulate network error and trigger local fallback
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network offline simulation'));

    const imperfectQuestions = [
      {
        questionText: 'What is the speed of light in vacuum?',
        options: ['$3 \\times 10^8$ m/s', '$3 \\times 10^6$ m/s'], // only 2 options
        correctAnswerIndex: -1, // invalid index
      },
    ];

    const fixed = await aiService.fixQuestions(imperfectQuestions as any);
    expect(fixed.length).toBe(1);
    expect(fixed[0].options.length).toBe(4);
    expect(fixed[0].correctAnswerIndex).toBeGreaterThanOrEqual(0);
    expect(fixed[0].verificationStatus).toBe('VERIFIED');
  });

  it('should parse Gemini JSON responses correctly when API succeeds', async () => {
    const mockGeminiResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  questions: [
                    {
                      questionText: 'What is Newton’s first law?',
                      options: ['Law of inertia', 'Law of acceleration', 'Law of action-reaction', 'Law of gravitation'],
                      correctAnswerIndex: 0,
                      topic: 'Mechanics',
                      explanation: 'An object remains at rest or in uniform motion unless acted upon by a net force.',
                    },
                  ],
                }),
              },
            ],
          },
        },
      ],
    };

    vi.spyOn(aiService, 'getGeminiApiKey').mockReturnValue('test-mock-api-key');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockGeminiResponse,
    } as any);

    const questions = await aiService.generateFromTopic('Mechanics', 'MEDIUM', 1);
    expect(questions.length).toBe(1);
    expect(questions[0].questionText).toBe('What is Newton’s first law?');
    expect(questions[0].correctAnswerIndex).toBe(0);
    expect(questions[0].options[0]).toBe('Law of inertia');
  });
});
