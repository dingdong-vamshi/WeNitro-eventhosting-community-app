export const AADHAAR_ACTIONS = {
  availability: "availability",
  begin: "begin",
  refresh: "refresh",
  legacySendOtp: "sendOtp",
  legacyVerifyOtp: "verifyOtp",
} as const;

export type AadhaarAction =
  typeof AADHAAR_ACTIONS[keyof typeof AADHAAR_ACTIONS];
export type DigiLockerAction =
  | typeof AADHAAR_ACTIONS.availability
  | typeof AADHAAR_ACTIONS.begin
  | typeof AADHAAR_ACTIONS.refresh;
export type LegacyOkycAction =
  | typeof AADHAAR_ACTIONS.legacySendOtp
  | typeof AADHAAR_ACTIONS.legacyVerifyOtp;

const knownActions = new Set<AadhaarAction>(Object.values(AADHAAR_ACTIONS));
const legacyActions = new Set<LegacyOkycAction>([
  AADHAAR_ACTIONS.legacySendOtp,
  AADHAAR_ACTIONS.legacyVerifyOtp,
]);

export const isAadhaarAction = (value: unknown): value is AadhaarAction =>
  typeof value === "string" && knownActions.has(value as AadhaarAction);

export const isLegacyOkycAction = (
  value: AadhaarAction,
): value is LegacyOkycAction => legacyActions.has(value as LegacyOkycAction);
