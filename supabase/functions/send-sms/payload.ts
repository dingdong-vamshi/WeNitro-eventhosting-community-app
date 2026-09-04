export type IndianMobile = {
  e164: string;
  national: string;
};

export type ParsedSendSmsHookPayload = {
  phone: IndianMobile;
  otp: string;
};

type SendSmsHookPayload = {
  user?: {
    phone?: unknown;
  };
  sms?: {
    otp?: unknown;
  };
};

export function normalizeIndianMobile(phone: unknown): IndianMobile | null {
  if (typeof phone !== "string") return null;

  const compact = phone.replace(/[\s().-]/g, "");
  const match = /^(?:\+91|91)?([6-9][0-9]{9})$/.exec(compact);
  if (!match) return null;

  return {
    e164: `+91${match[1]}`,
    national: match[1],
  };
}

export function parseSendSmsHookPayload(
  payload: unknown,
): ParsedSendSmsHookPayload | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const hook = payload as SendSmsHookPayload;
  const phone = normalizeIndianMobile(hook.user?.phone);
  const otp = hook.sms?.otp;
  if (!phone || typeof otp !== "string" || !/^[0-9]{6}$/.test(otp)) {
    return null;
  }

  return { phone, otp };
}

export function fast2SmsRequestBody(
  nationalPhone: string,
  otp: string,
  otpId: string,
  otpExpiryMinutes: number,
) {
  return {
    mobile: nationalPhone,
    otp_id: otpId,
    otp,
    otp_length: 6,
    otp_expiry: otpExpiryMinutes,
  };
}
