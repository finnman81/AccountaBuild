import { getAnalytics, logEvent } from 'firebase/analytics';
import { firebaseApp } from '../firebase/firebase';

let analyticsInstance: ReturnType<typeof getAnalytics> | null = null;

function getAnalyticsInstance() {
  if (!analyticsInstance && firebaseApp) {
    try {
      analyticsInstance = getAnalytics(firebaseApp);
    } catch (error) {
      console.warn('[Analytics] Failed to initialize:', error);
    }
  }
  return analyticsInstance;
}

export function logAnalyticsEvent(eventName: string, params?: Record<string, any>) {
  const analytics = getAnalyticsInstance();
  if (!analytics) {
    console.log('[Analytics] Event (not sent):', eventName, params);
    return;
  }
  
  try {
    logEvent(analytics, eventName, params);
  } catch (error) {
    console.warn('[Analytics] Failed to log event:', error);
  }
}

// Onboarding-specific analytics helpers
export const onboardingAnalytics = {
  screenView: (stepNumber: number, screenName: string, version: number = 1) => {
    logAnalyticsEvent('onboarding_screen_view', { stepNumber, screenName, version });
  },
  
  continue: (fromStep: number, toStep: number) => {
    logAnalyticsEvent('onboarding_continue', { fromStep, toStep });
  },
  
  basicInfoSaved: () => {
    logAnalyticsEvent('onboarding_basic_info_saved');
  },
  
  goalsSaved: () => {
    logAnalyticsEvent('onboarding_goals_saved');
  },
  
  completed: () => {
    logAnalyticsEvent('onboarding_completed');
  },
  
  usernameConflict: () => {
    logAnalyticsEvent('onboarding_username_conflict');
  },
  
  validationError: (field: string) => {
    logAnalyticsEvent('onboarding_validation_error', { field });
  },
  
  transitionViewed: () => {
    logAnalyticsEvent('onboarding_transition_viewed');
  },
};
