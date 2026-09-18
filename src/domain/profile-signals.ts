export const NITRO_STORE_MINIMUM = 500;
export function storeEligible(balance: number) { return Number.isFinite(balance) && balance >= NITRO_STORE_MINIMUM; }

export type TrustSignals = {
  email_verified?: boolean;
  phone_verified?: boolean;
  selfie_verified?: boolean;
  aadhaar_verified?: boolean;
  social_linked?: boolean;
  rating?: number;
  activities_joined?: number;
};

export type TrustPart = { key: string; label: string; points: number; earned: number; done: boolean };

export function trustScoreParts(signals: TrustSignals = {}): { parts: TrustPart[]; total: number } {
  const rating = Number(signals.rating || 0);
  const joined = Number(signals.activities_joined || 0);
  const activityPoints = joined >= 20 ? 30 : joined >= 10 ? 20 : 0;
  const parts: TrustPart[] = [
    { key: 'email', label: 'Email verified', points: 10, earned: signals.email_verified ? 10 : 0, done: Boolean(signals.email_verified) },
    { key: 'phone', label: 'Phone verified', points: 10, earned: signals.phone_verified ? 10 : 0, done: Boolean(signals.phone_verified) },
    { key: 'selfie', label: 'Selfie uploaded', points: 10, earned: signals.selfie_verified ? 10 : 0, done: Boolean(signals.selfie_verified) },
    { key: 'aadhaar', label: 'Aadhaar verified', points: 20, earned: signals.aadhaar_verified ? 20 : 0, done: Boolean(signals.aadhaar_verified) },
    { key: 'social', label: 'Social profiles linked', points: 10, earned: signals.social_linked ? 10 : 0, done: Boolean(signals.social_linked) },
    { key: 'rating', label: '4+ karma rating', points: 10, earned: rating >= 4 ? 10 : 0, done: rating >= 4 },
    { key: 'activities', label: joined >= 20 ? '20+ activities joined' : '10 activities joined', points: 30, earned: activityPoints, done: activityPoints > 0 },
  ];
  return { parts, total: parts.reduce((sum, part) => sum + part.earned, 0) };
}

/** Trust Score / 100 from verification stages, rating, and joined activities. */
export function derivedTrustScore(signals: TrustSignals) {
  return trustScoreParts(signals).total;
}
