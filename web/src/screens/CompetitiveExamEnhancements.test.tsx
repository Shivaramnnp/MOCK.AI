import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CompetitiveExamPlayerScreen } from './CompetitiveExamPlayerScreen';
import { ExamService } from '../services/examService';
import { ExamPaper } from '../types';

describe('Competitive Exam Player Enhancements (SEC-003, ENG-001, A11Y-001, UX-001)', () => {
  let paper: ExamPaper;

  beforeEach(() => {
    localStorage.clear();
    paper = ExamService.getPaperById('ssc-chsl-2025-13nov-s2')!;
  });

  afterEach(() => {
    cleanup();
  });

  it('A11Y-001: selects options via keyboard shortcuts (1-4, A-D) and advances with Enter', () => {
    const handleExit = vi.fn();
    const handleSubmit = vi.fn();

    render(
      <CompetitiveExamPlayerScreen
        paper={paper}
        userId="user_keyboard_test"
        onExit={handleExit}
        onSubmit={handleSubmit}
      />
    );

    // Initial state: Q1
    expect(screen.getByText(/Question 1 of 100/i)).toBeDefined();

    // Press '2' to select option 1 (Option B: Entomologist)
    fireEvent.keyDown(window, { key: '2' });

    // Press 'Enter' to Save & Next
    fireEvent.keyDown(window, { key: 'Enter' });

    // Should have advanced to Question 2
    expect(screen.getByText(/Question 2 of 100/i)).toBeDefined();

    // Press 'c' to select option 2 (Option C)
    fireEvent.keyDown(window, { key: 'c' });

    // Press 'Enter' to Save & Next to Question 3
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByText(/Question 3 of 100/i)).toBeDefined();
  });

  it('ENG-001: intercepts browser popstate (back button) and opens Exit Confirmation dialog', () => {
    const handleExit = vi.fn();
    const handleSubmit = vi.fn();

    render(
      <CompetitiveExamPlayerScreen
        paper={paper}
        userId="user_back_test"
        onExit={handleExit}
        onSubmit={handleSubmit}
      />
    );

    // Initially modal is not visible
    expect(screen.queryByText(/Your progress will be saved/i)).toBeNull();

    // Simulate browser back button click (popstate event)
    fireEvent(window, new PopStateEvent('popstate'));

    // Modal should now be open
    expect(screen.getByText(/Exit Test\?/i)).toBeDefined();
    expect(screen.getByText(/Your progress will be saved/i)).toBeDefined();

    // Pressing Escape should dismiss the modal
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText(/Your progress will be saved/i)).toBeNull();
  });

  it('SEC-003: does not expose correct answer keys or explanations in active player DOM', () => {
    const handleExit = vi.fn();
    const handleSubmit = vi.fn();

    const { container } = render(
      <CompetitiveExamPlayerScreen
        paper={paper}
        userId="user_sec_test"
        onExit={handleExit}
        onSubmit={handleSubmit}
      />
    );

    // Verify explanation for Q1 is NOT present anywhere in DOM
    const q1Explanation = paper.questions[0].explanation;
    if (q1Explanation) {
      expect(container.textContent).not.toContain(q1Explanation);
    }

    // Verify raw answer key is NOT exposed in the DOM attributes or text
    expect(container.querySelector('[data-correct-answer]')).toBeNull();
    expect(container.querySelector('[data-correct-index]')).toBeNull();
  });

  it('UX-001: opens mobile question palette drawer and supports direct question jump', () => {
    const handleExit = vi.fn();
    const handleSubmit = vi.fn();

    render(
      <CompetitiveExamPlayerScreen
        paper={paper}
        userId="user_mobile_palette_test"
        onExit={handleExit}
        onSubmit={handleSubmit}
      />
    );

    // Mobile grid button should be present
    const gridPillBtn = screen.getByRole('button', { name: /Grid \(1\/100\)/i });
    expect(gridPillBtn).toBeDefined();

    // Click to open mobile drawer
    fireEvent.click(gridPillBtn);

    // Drawer should show instructions
    expect(screen.getByText(/Tap any question to jump directly/i)).toBeDefined();

    // Click on question 15 inside the drawer
    const q15Btn = screen.getAllByRole('button', { name: '15' })[0];
    expect(q15Btn).toBeDefined();
    fireEvent.click(q15Btn);

    // Active question should now be Question 15
    expect(screen.getByText(/Question 15 of 100/i)).toBeDefined();
  });
});
