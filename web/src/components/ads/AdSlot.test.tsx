import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { AdSlot } from './AdSlot';
import { AdProvider } from '../../lib/ads/AdContext';
import { UserProfile } from '../../types';

describe('AdSlot Component & Active Exam Safety', () => {
  const mockFreeUser: UserProfile = {
    uid: 'u-123',
    email: 'learner@mock.ai',
    fullName: 'Test Learner',
    role: 'STUDENT',
    createdAt: Date.now(),
  };

  const mockProUser: UserProfile = {
    uid: 'u-pro',
    email: 'pro@mock.ai',
    fullName: 'Pro Learner',
    role: 'STUDENT',
    createdAt: Date.now(),
    ...({ isPro: true } as any),
  };

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    // Setup IntersectionObserver class mock in jsdom
    class MockIntersectionObserver {
      callback: (entries: any[]) => void;
      constructor(callback: (entries: any[]) => void) {
        this.callback = callback;
      }
      observe(target: Element) {
        this.callback([{ isIntersecting: true, target }]);
      }
      unobserve() {}
      disconnect() {}
    }
    window.IntersectionObserver = MockIntersectionObserver as any;
  });

  describe('HARD INVARIANT: ACTIVE MOCK TEST = STRICTLY AD-FREE', () => {
    it('renders ZERO DOM nodes when currentRoute is exam_player', () => {
      const { container, queryByTestId } = render(
        <AdProvider currentRoute="exam_player" user={mockFreeUser}>
          <AdSlot placement="home_banner" />
        </AdProvider>
      );

      // Absolutely zero DOM elements rendered
      expect(container.firstChild).toBeNull();
      expect(queryByTestId('ad-slot')).toBeNull();
    });

    it('renders ZERO DOM nodes when currentRoute is test_player', () => {
      const { container, queryByTestId } = render(
        <AdProvider currentRoute="test_player" user={mockFreeUser}>
          <AdSlot placement="exam_detail_preview" />
        </AdProvider>
      );

      // Absolutely zero DOM elements rendered
      expect(container.firstChild).toBeNull();
      expect(queryByTestId('ad-slot')).toBeNull();
    });

    it('renders ZERO DOM nodes on sensitive processing route', () => {
      const { container, queryByTestId } = render(
        <AdProvider currentRoute="processing" user={mockFreeUser}>
          <AdSlot placement="home_banner" />
        </AdProvider>
      );

      expect(container.firstChild).toBeNull();
      expect(queryByTestId('ad-slot')).toBeNull();
    });
  });

  describe('Entitlement Safety: Pro users receive zero ads', () => {
    it('renders ZERO DOM nodes for Pro user on home screen', () => {
      const { container, queryByTestId } = render(
        <AdProvider currentRoute="home" user={mockProUser}>
          <AdSlot placement="home_banner" />
        </AdProvider>
      );

      expect(container.firstChild).toBeNull();
      expect(queryByTestId('ad-slot')).toBeNull();
    });

    it('renders ZERO DOM nodes for Pro user on results screen', () => {
      const { container, queryByTestId } = render(
        <AdProvider currentRoute="exam_results" user={mockProUser}>
          <AdSlot placement="exam_results_footer" />
        </AdProvider>
      );

      expect(container.firstChild).toBeNull();
      expect(queryByTestId('ad-slot')).toBeNull();
    });
  });

  describe('Non-Test Route Rendering & CLS Prevention', () => {
    it('renders valid ad container with Advertisement label on home route', () => {
      const { queryByTestId, getByText } = render(
        <AdProvider currentRoute="home" user={mockFreeUser}>
          <AdSlot placement="home_banner" />
        </AdProvider>
      );

      const slot = queryByTestId('ad-slot');
      expect(slot).not.toBeNull();
      expect(slot?.getAttribute('data-placement')).toBe('home_banner');

      // Standard-compliant labeling
      expect(getByText(/Advertisement/i)).toBeDefined();
      expect(getByText(/MOCK.AI Sponsor/i)).toBeDefined();
    });

    it('enforces min-height constraint to eliminate Cumulative Layout Shift (CLS)', () => {
      const { queryByTestId } = render(
        <AdProvider currentRoute="explore" user={mockFreeUser}>
          <AdSlot placement="explore_banner" />
        </AdProvider>
      );

      const slot = queryByTestId('ad-slot');
      expect(slot).not.toBeNull();
      // Should have inline style minHeight >= 90px
      expect(slot?.style.minHeight).toBe('90px');
    });

    it('renders test preview fallback cleanly in test mode without AdSense errors', () => {
      const { getByText } = render(
        <AdProvider
          currentRoute="exam_results"
          user={mockFreeUser}
          config={{ testMode: true, clientId: 'ca-pub-0000000000000000' }}
        >
          <AdSlot placement="exam_results_footer" />
        </AdProvider>
      );

      expect(getByText(/Support MOCK.AI Free Tier/i)).toBeDefined();
      expect(getByText(/Sponsored/i)).toBeDefined();
    });

    it('renders properly on review screen', () => {
      const { queryByTestId } = render(
        <AdProvider currentRoute="review" user={mockFreeUser}>
          <AdSlot placement="review_inline" />
        </AdProvider>
      );
      expect(queryByTestId('ad-slot')).not.toBeNull();
      expect(queryByTestId('ad-slot')?.getAttribute('data-placement')).toBe('review_inline');
    });

    it('renders properly on explore_exam screen with 120px minHeight', () => {
      const { queryByTestId } = render(
        <AdProvider currentRoute="explore_exam" user={mockFreeUser}>
          <AdSlot placement="exam_detail_preview" />
        </AdProvider>
      );
      expect(queryByTestId('ad-slot')).not.toBeNull();
      expect(queryByTestId('ad-slot')?.style.minHeight).toBe('120px');
    });
  });
});
