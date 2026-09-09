export const NITRO_STORE_MINIMUM = 500;
export function storeEligible(balance: number) { return Number.isFinite(balance) && balance >= NITRO_STORE_MINIMUM; }
/** Only weights explicitly evidenced in the profile specification are awarded. */
export function derivedTrustScore(signals: { phone_verified: boolean; aadhaar_verified: boolean; social_linked: boolean; rating: number }) {
 return (signals.phone_verified ? 20 : 0) + (signals.aadhaar_verified ? 20 : 0) + (signals.social_linked ? 10 : 0) + (signals.rating >= 4 ? 10 : 0);
}
