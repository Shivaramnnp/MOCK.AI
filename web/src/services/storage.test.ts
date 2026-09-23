import { describe, it, expect, beforeEach } from 'vitest';
import { storage } from './storage';
import { TestHistory } from '../types';

describe('StorageService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should initialize and return default seed tests', () => {
    const tests = storage.getTests();
    expect(tests.length).toBeGreaterThan(0);
    expect(tests[0]).toHaveProperty('title');
    expect(tests[0].questions.length).toBeGreaterThan(0);
  });

  it('should save a new test and retrieve it', () => {
    const customTest: TestHistory = {
      id: 'test-custom-1',
      title: 'Custom Organic Chemistry Exam',
      category: 'Chemistry',
      questions: [
        {
          questionText: 'Which reagent distinguishes aldehydes from ketones?',
          options: ["Tollens' reagent", 'Lucas reagent', 'Biuret reagent', 'Benedict reagent'],
          correctAnswerIndex: 0,
          topic: 'Aldehydes',
          explanation: "Tollens' reagent precipitates silver mirror with aldehydes.",
        },
      ],
      createdAt: Date.now(),
      lastTakenAt: null,
      bestScore: null,
      bestScorePercent: null,
      bestTotal: 1,
    };

    storage.saveTest(customTest);
    const retrieved = storage.getTestById('test-custom-1');
    expect(retrieved).toBeDefined();
    expect(retrieved?.title).toBe('Custom Organic Chemistry Exam');
  });

  it('should update score and track study streak', () => {
    const tests = storage.getTests();
    const target = tests[0];

    storage.updateTestScore(target.id, 4, 5, 1, 95);
    const updated = storage.getTestById(target.id);

    expect(updated?.bestScore).toBe(4);
    expect(updated?.bestScorePercent).toBe(80);
    expect(updated?.lastTakenAt).not.toBeNull();

    const streak = storage.getStreak();
    expect(streak.currentStreak).toBeGreaterThanOrEqual(1);
  });

  it('should handle class creation and enrollment', () => {
    const newClass = storage.createClass('Computer Science 301', 'teacher-1', 'Prof. Smith');
    expect(newClass.name).toBe('Computer Science 301');
    expect(newClass.joinCode).toHaveLength(6);

    const joinRes = storage.joinClass(newClass.joinCode, 'student-99', 'Alex Doe');
    expect(joinRes.success).toBe(true);

    const classes = storage.getClasses();
    const cls = classes.find((c) => c.classId === newClass.classId);
    expect(cls?.studentIds).toContain('student-99');
  });

  it('should toggle daily task completion', () => {
    const tasks = storage.getDailyTasks();
    const firstTask = tasks[0];
    const initialStatus = firstTask.isDone;

    const toggled = storage.toggleTask(firstTask.id);
    const target = toggled.find((t) => t.id === firstTask.id);
    expect(target?.isDone).toBe(!initialStatus);
  });
});
