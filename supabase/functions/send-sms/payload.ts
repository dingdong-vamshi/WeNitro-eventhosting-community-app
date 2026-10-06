export type IndianMobile = {
  e164: string;
  national: string;
};

export type ParsedSendSmsHookPayload = {
  phone: IndianMobile;
  otp: string;
  userId: string | null;
  operation: string;
};

type SendSmsHookPayload = {
  user?: {
    id?: unknown;
    phone?: unknown;
  };
  sms?: {
    otp?: unknown;
    phone?: unknown;
    sms_type?: unknown;
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
  // GoTrue puts the destination for phone-change OTPs in sms.phone while
  // user.phone remains the user's currently confirmed phone (or is empty).
  // Prefer the requested destination and keep user.phone as a compatibility
  // fallback for older signup-hook payloads.
  const phone = normalizeIndianMobile(hook.sms?.phone ?? hook.user?.phone);
  const otp = hook.sms?.otp;
  if (!phone || typeof otp !== "string" || !/^[0-9]{6}$/.test(otp)) {
    return null;
  }

  const userId = typeof hook.user?.id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(hook.user.id)
    ? hook.user.id
    : null;
  const operation = typeof hook.sms?.sms_type === "string" &&
      /^[a-z_]{2,40}$/.test(hook.sms.sms_type)
    ? hook.sms.sms_type
    : "send_otp";
  return { phone, otp, userId, operation };
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
