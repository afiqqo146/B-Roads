// EXPO_PUBLIC_* variables are inlined at build time. See .env.example.

/** B-Roads server. On a physical phone use your computer's LAN IP, not localhost. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

/** Meta (Facebook) App ID; Instagram and Facebook Stories sharing require one. */
export const META_APP_ID = process.env.EXPO_PUBLIC_META_APP_ID ?? '';

export const REVENUECAT_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
export const REVENUECAT_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';

/** RevenueCat entitlement that unlocks paid features. */
export const PREMIUM_ENTITLEMENT = 'premium';
