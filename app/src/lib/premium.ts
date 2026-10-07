import { Platform } from 'react-native';
import Purchases, { type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';
import { PREMIUM_ENTITLEMENT, REVENUECAT_ANDROID_KEY, REVENUECAT_IOS_KEY } from './config';

/**
 * Premium (paid) features are sold as a subscription through RevenueCat, which
 * wraps the App Store and Google Play billing. Without API keys (local dev,
 * Expo Go) billing is disabled and the paywall offers a dev unlock instead.
 */
const apiKey = Platform.select({ ios: REVENUECAT_IOS_KEY, android: REVENUECAT_ANDROID_KEY }) ?? '';
export const billingEnabled = apiKey.length > 0;

let configured = false;

export function configureBilling(onChange: (premium: boolean) => void) {
  if (!billingEnabled || configured) return;
  Purchases.configure({ apiKey });
  configured = true;
  Purchases.addCustomerInfoUpdateListener((info) => onChange(hasPremium(info)));
  Purchases.getCustomerInfo()
    .then((info) => onChange(hasPremium(info)))
    .catch(() => {});
}

export const hasPremium = (info: CustomerInfo) => PREMIUM_ENTITLEMENT in info.entitlements.active;

export async function getPremiumPackages(): Promise<PurchasesPackage[]> {
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

export async function buy(pkg: PurchasesPackage): Promise<boolean> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return hasPremium(customerInfo);
}

export async function restore(): Promise<boolean> {
  return hasPremium(await Purchases.restorePurchases());
}
