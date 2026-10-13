/**
 * Checks a RevenueCat customer has the "premium" entitlement before letting
 * them create a club. Without REVENUECAT_SECRET_KEY (local development) every
 * request is allowed, matching the app's dev unlock switch.
 */
export type PremiumCheck = (appUserId: string | undefined) => Promise<boolean>;

export function revenueCatCheck(secretKey: string | undefined, fetchImpl: typeof fetch = fetch): PremiumCheck {
  if (!secretKey) return async () => true;
  return async (appUserId) => {
    if (!appUserId) return false;
    const res = await fetchImpl(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
      headers: { authorization: `Bearer ${secretKey}` },
    });
    if (!res.ok) return false;
    const body = (await res.json()) as {
      subscriber?: { entitlements?: Record<string, { expires_date: string | null }> };
    };
    const premium = body.subscriber?.entitlements?.premium;
    return !!premium && (premium.expires_date === null || Date.parse(premium.expires_date) > Date.now());
  };
}
