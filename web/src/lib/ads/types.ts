import { AppRoute, UserProfile } from '../../types';

export type AdPlacementId =
  | 'home_banner'
  | 'explore_banner'
  | 'exam_detail_preview'
  | 'exam_results_footer'
  | 'test_results_footer'
  | 'review_inline'
  | 'analytics_banner'
  | 'marketplace_banner';

export type AdFormat = 'leaderboard' | 'rectangle' | 'banner' | 'responsive' | 'inline';

export interface AdDimensions {
  minHeight: number;
  width?: string | number;
  maxHeight?: number;
}

export interface AdSlotConfig {
  slotId?: string;
  format: AdFormat;
  dimensions: AdDimensions;
  description: string;
}

export interface AdConfiguration {
  clientId?: string;
  enabled: boolean;
  testMode: boolean;
  slots: Record<AdPlacementId, AdSlotConfig>;
}

export interface AdPolicyContext {
  route: AppRoute;
  user?: UserProfile | null;
  placement?: AdPlacementId;
}

export type AdAnalyticsEventType =
  | 'ad_slot_requested'
  | 'ad_slot_rendered'
  | 'ad_impression'
  | 'ad_viewable'
  | 'ad_clicked'
  | 'ad_slot_blocked'
  | 'ad_slot_failed';

export interface AdAnalyticsPayload {
  placement: AdPlacementId;
  format: AdFormat;
  route: AppRoute;
  clientId?: string;
  timestamp: number;
  reason?: string;
  errorMessage?: string;
}
