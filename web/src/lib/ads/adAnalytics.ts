import { AdAnalyticsEventType, AdAnalyticsPayload } from './types';

class AdAnalytics {
  private isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

  /**
   * Tracks an ad telemetry event. Never throws errors to guarantee zero impact on UI or learning state.
   */
  public track(type: AdAnalyticsEventType, payload: AdAnalyticsPayload): void {
    try {
      if (this.isDev) {
        // Debug logging in development only
        // eslint-disable-next-line no-console
        console.debug(`[MOCK.AI Ads Telemetry] ${type}:`, payload);
      }

      // Dispatch custom DOM event for external listeners / analytics bridges
      if (typeof window !== 'undefined') {
        const customEvent = new CustomEvent('mockai:ad_event', {
          detail: { type, ...payload },
        });
        window.dispatchEvent(customEvent);
      }
    } catch {
      // Intentionally silent: telemetry failures must NEVER break user experience
    }
  }

  public trackSlotRequested(payload: Omit<AdAnalyticsPayload, 'timestamp'>): void {
    this.track('ad_slot_requested', { ...payload, timestamp: Date.now() });
  }

  public trackSlotRendered(payload: Omit<AdAnalyticsPayload, 'timestamp'>): void {
    this.track('ad_slot_rendered', { ...payload, timestamp: Date.now() });
  }

  public trackImpression(payload: Omit<AdAnalyticsPayload, 'timestamp'>): void {
    this.track('ad_impression', { ...payload, timestamp: Date.now() });
  }

  public trackViewable(payload: Omit<AdAnalyticsPayload, 'timestamp'>): void {
    this.track('ad_viewable', { ...payload, timestamp: Date.now() });
  }

  public trackClick(payload: Omit<AdAnalyticsPayload, 'timestamp'>): void {
    this.track('ad_clicked', { ...payload, timestamp: Date.now() });
  }

  public trackBlocked(payload: Omit<AdAnalyticsPayload, 'timestamp'>): void {
    this.track('ad_slot_blocked', { ...payload, timestamp: Date.now() });
  }

  public trackFailed(payload: Omit<AdAnalyticsPayload, 'timestamp'>): void {
    this.track('ad_slot_failed', { ...payload, timestamp: Date.now() });
  }
}

export const adAnalytics = new AdAnalytics();
