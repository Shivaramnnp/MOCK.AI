import { describe, it, expect } from 'vitest';
import { isTestRoute, isAdFreeUser, canShowAds, ACTIVE_TEST_ROUTES } from './adPolicy';
import { UserProfile } from '../../types';

describe('AdPolicy Engine & Hard Invariants', () => {
  describe('Invariant 1: ACTIVE MOCK TEST = STRICTLY AD-FREE', () => {
    it('strictly classifies exam_player and test_player as active test routes', () => {
      expect(isTestRoute('exam_player')).toBe(true);
      expect(isTestRoute('test_player')).toBe(true);
      expect(ACTIVE_TEST_ROUTES).toEqual(['exam_player', 'test_player']);
    });

    it('classifies non-test routes as not active test routes', () => {
      expect(isTestRoute('home')).toBe(false);
      expect(isTestRoute('explore')).toBe(false);
      expect(isTestRoute('explore_exam')).toBe(false);
      expect(isTestRoute('exam_results')).toBe(false);
      expect(isTestRoute('results')).toBe(false);
      expect(isTestRoute('exam_review')).toBe(false);
      expect(isTestRoute('review')).toBe(false);
      expect(isTestRoute('analytics')).toBe(false);
    });

    it('returns allowed: false when current route is exam_player', () => {
      const result = canShowAds({
        route: 'exam_player',
        placement: 'home_banner',
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Active mock test in progress');
    });

    it('returns allowed: false when current route is test_player', () => {
      const result = canShowAds({
        route: 'test_player',
        placement: 'exam_detail_preview',
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Active mock test in progress');
    });
  });

  describe('Invariant 2: Sensitive non-test routes are ad-free', () => {
    it('blocks ads on processing route', () => {
      const result = canShowAds({
        route: 'processing',
        placement: 'home_banner',
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('distraction-free');
    });
  });

  describe('Invariant 3: Pro & Ad-Free Entitlement', () => {
    it('detects isPro flag as ad-free', () => {
      const proUser = { uid: '1', email: 'pro@mock.ai', fullName: 'Pro User', isPro: true } as unknown as UserProfile;
      expect(isAdFreeUser(proUser)).toBe(true);

      const result = canShowAds({
        route: 'home',
        user: proUser,
        placement: 'home_banner',
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('User has Pro/Ad-Free entitlement');
    });

    it('detects tier: pro or premium as ad-free', () => {
      const tierProUser = { uid: '2', email: 'tier@mock.ai', fullName: 'Tier User', tier: 'pro' } as unknown as UserProfile;
      expect(isAdFreeUser(tierProUser)).toBe(true);

      const result = canShowAds({
        route: 'home',
        user: tierProUser,
        placement: 'home_banner',
      });
      expect(result.allowed).toBe(false);
    });

    it('allows standard free-tier users to view ads on permitted routes', () => {
      const freeUser = { uid: '3', email: 'free@mock.ai', fullName: 'Free User' } as UserProfile;
      expect(isAdFreeUser(freeUser)).toBe(false);

      const result = canShowAds({
        route: 'home',
        user: freeUser,
        placement: 'home_banner',
      });
      expect(result.allowed).toBe(true);
    });
  });

  describe('Permitted Placements Validation', () => {
    it('allows verified non-exam placements on non-exam routes', () => {
      const validPlacements = [
        'home_banner',
        'explore_banner',
        'exam_detail_preview',
        'exam_results_footer',
        'test_results_footer',
        'review_inline',
        'analytics_banner',
        'marketplace_banner',
      ] as const;

      for (const placement of validPlacements) {
        const result = canShowAds({
          route: 'home',
          placement,
        });
        expect(result.allowed).toBe(true);
      }
    });

    it('rejects invalid or unauthorized placements', () => {
      const result = canShowAds({
        route: 'home',
        placement: 'unauthorized_exam_sidebar' as any,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not recognized or permitted');
    });
  });
});
