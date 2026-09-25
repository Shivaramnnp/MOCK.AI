import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { AppRoute, UserProfile } from '../../types';
import { AdConfiguration, AdPlacementId } from './types';
import { canShowAds, DEFAULT_AD_CONFIG, isAdFreeUser, AdPolicyResult } from './adPolicy';

interface AdContextValue {
  config: AdConfiguration;
  currentRoute: AppRoute;
  user?: UserProfile | null;
  isAdFree: boolean;
  canShow: (placement?: AdPlacementId) => AdPolicyResult;
}

const AdContext = createContext<AdContextValue | null>(null);

export interface AdProviderProps {
  children: React.ReactNode;
  currentRoute: AppRoute;
  user?: UserProfile | null;
  config?: Partial<AdConfiguration>;
}

export const AdProvider: React.FC<AdProviderProps> = ({
  children,
  currentRoute,
  user,
  config: customConfig,
}) => {
  const mergedConfig = useMemo<AdConfiguration>(() => {
    return {
      ...DEFAULT_AD_CONFIG,
      ...customConfig,
      slots: {
        ...DEFAULT_AD_CONFIG.slots,
        ...(customConfig?.slots || {}),
      },
    };
  }, [customConfig]);

  const isAdFree = useMemo(() => isAdFreeUser(user), [user]);

  // Dynamic Google AdSense script loader (only if enabled, not testMode, and valid clientId)
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !mergedConfig.enabled ||
      mergedConfig.testMode ||
      !mergedConfig.clientId ||
      mergedConfig.clientId === 'ca-pub-0000000000000000'
    ) {
      return;
    }

    const scriptId = 'google-adsense-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${mergedConfig.clientId}`;
      script.async = true;
      script.crossOrigin = 'anonymous';
      document.head.appendChild(script);
    }
  }, [mergedConfig.enabled, mergedConfig.testMode, mergedConfig.clientId]);

  const value = useMemo<AdContextValue>(() => {
    return {
      config: mergedConfig,
      currentRoute,
      user,
      isAdFree,
      canShow: (placement?: AdPlacementId) =>
        canShowAds({
          route: currentRoute,
          user,
          placement,
        }),
    };
  }, [mergedConfig, currentRoute, user, isAdFree]);

  return <AdContext.Provider value={value}>{children}</AdContext.Provider>;
};

export const useAdContext = (): AdContextValue => {
  const context = useContext(AdContext);
  if (!context) {
    // Provide safe fallback context if rendered outside AdProvider
    return {
      config: DEFAULT_AD_CONFIG,
      currentRoute: 'home',
      isAdFree: false,
      canShow: (placement?: AdPlacementId) =>
        canShowAds({
          route: 'home',
          placement,
        }),
    };
  }
  return context;
};
