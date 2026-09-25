import { AppRoute, UserProfile } from '../../types';
import { AdPlacementId, AdPolicyContext, AdConfiguration } from './types';

/**
 * Hard Invariant: Active mock test routes are STRICTLY AD-FREE.
 * When attempting an examination, the learner must experience zero distraction.
 */
export const ACTIVE_TEST_ROUTES: readonly AppRoute[] = ['exam_player', 'test_player'] as const;

/**
 * Sensitive routes where advertisements must not be rendered.
 */
export const SENSITIVE_ROUTES: readonly AppRoute[] = ['processing'] as const;

/**
 * Determines whether a route is an active test session.
 */
export function isTestRoute(route: AppRoute): boolean {
  return ACTIVE_TEST_ROUTES.includes(route);
}

/**
 * Determines whether a user holds Pro or Ad-Free entitlements.
 */
export function isAdFreeUser(user?: UserProfile | null): boolean {
  if (!user) return false;
  
  // Cast to any to check potential Pro flags or future tier fields safely
  const u = user as unknown as {
    isPro?: boolean;
    tier?: string;
    entitlements?: { adsFree?: boolean };
  };

  return Boolean(
    u.isPro === true ||
    u.tier === 'pro' ||
    u.tier === 'premium' ||
    u.entitlements?.adsFree === true
  );
}

export interface AdPolicyResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Evaluates whether an ad can be displayed in the given context.
 * Enforces the core invariant: ACTIVE MOCK TEST = STRICTLY AD-FREE.
 */
export function canShowAds(context: AdPolicyContext): AdPolicyResult {
  const { route, user, placement } = context;

  // 1. HARD INVARIANT: Active test in progress
  if (isTestRoute(route)) {
    return {
      allowed: false,
      reason: 'Active mock test in progress: strictly ad-free environment',
    };
  }

  // 2. Sensitive non-test routes (e.g. AI processing / generation)
  if (SENSITIVE_ROUTES.includes(route)) {
    return {
      allowed: false,
      reason: `Route "${route}" is designated as distraction-free`,
    };
  }

  // 3. Pro / Ad-Free user entitlement
  if (isAdFreeUser(user)) {
    return {
      allowed: false,
      reason: 'User has Pro/Ad-Free entitlement',
    };
  }

  // 4. Validate allowed placements
  if (placement) {
    const validPlacements: AdPlacementId[] = [
      'home_banner',
      'explore_banner',
      'exam_detail_preview',
      'exam_results_footer',
      'test_results_footer',
      'review_inline',
      'analytics_banner',
      'marketplace_banner',
    ];
    if (!validPlacements.includes(placement)) {
      return {
        allowed: false,
        reason: `Placement "${placement}" is not recognized or permitted`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Default ad configuration with reserved layout dimensions for CLS prevention.
 */
export const DEFAULT_AD_CONFIG: AdConfiguration = {
  clientId: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADSENSE_CLIENT_ID) || 'ca-pub-0000000000000000',
  enabled: true,
  testMode: (typeof import.meta !== 'undefined' && import.meta.env?.DEV) ?? true,
  slots: {
    home_banner: {
      format: 'responsive',
      dimensions: { minHeight: 90 },
      description: 'Home screen bottom content banner',
    },
    explore_banner: {
      format: 'leaderboard',
      dimensions: { minHeight: 90 },
      description: 'Explore catalog banner between header and exam cards',
    },
    exam_detail_preview: {
      format: 'rectangle',
      dimensions: { minHeight: 120 },
      description: 'Exam detail syllabus area (separated from Start button)',
    },
    exam_results_footer: {
      format: 'responsive',
      dimensions: { minHeight: 100 },
      description: 'Competitive exam results screen footer',
    },
    test_results_footer: {
      format: 'responsive',
      dimensions: { minHeight: 100 },
      description: 'Quick test results screen footer',
    },
    review_inline: {
      format: 'inline',
      dimensions: { minHeight: 90 },
      description: 'Review screen separator between question items',
    },
    analytics_banner: {
      format: 'responsive',
      dimensions: { minHeight: 90 },
      description: 'Analytics dashboard bottom banner',
    },
    marketplace_banner: {
      format: 'responsive',
      dimensions: { minHeight: 90 },
      description: 'Marketplace feed banner',
    },
  },
};
