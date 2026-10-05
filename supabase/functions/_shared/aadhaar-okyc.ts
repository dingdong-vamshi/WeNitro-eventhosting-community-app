type RecordValue = Record<string, unknown>;

const record = (value: unknown): RecordValue =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const AADHAAR_CONSENT_VERSION = "wenitro-aadhaar-okyc-v1";
export const AADHAAR_REASON =
  "WeNitro identity verification and Trust Score eligibility";

export type AadhaarOkycConfig = {
  environment: "test" | "production";
  baseUrl: "https://test-api.sandbox.co.in" | "https://api.sandbox.co.in";
  key: string;
  secret: string;
};

export class AadhaarProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly httpStatus = 400,
  ) {
    super(message);
    this.name = "AadhaarProviderError";
  }
}

export function aadhaarOkycConfiguration(
  env: (name: string) => string | undefined,
): AadhaarOkycConfig | null {
  if (env("AADHAAR_OKYC_ENABLED") !== "true") return null;
  const environment = env("SANDBOX_ENVIRONMENT");
  if (environment !== "test" && environment !== "production") return null;
  const expectedBase =
    environment === "production"
      ? "https://api.sandbox.co.in"
      : "https://test-api.sandbox.co.in";
  const baseUrl = (env("SANDBOX_BASE_URL") || expectedBase).replace(/\/$/, "");
  if (baseUrl !== expectedBase) return null;
  const key = env("SANDBOX_API_KEY")?.trim();
  const secret = env("SANDBOX_API_SECRET")?.trim();
  if (!key || !secret) return null;
  return { environment, baseUrl: expectedBase, key, secret };
}

function providerTransactionId(value: unknown) {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new AadhaarProviderError(
      "invalid_provider_response",
      "Sandbox returned an invalid verification response.",
      false,
    );
  }
  return value;
}

function referenceId(value: unknown) {
  const candidate = typeof value === "number" ? String(value) : value;
  if (typeof candidate !== "string" || !/^\d{1,30}$/.test(candidate)) {
    throw new AadhaarProviderError(
      "invalid_provider_response",
      "Sandbox returned an invalid verification reference.",
      false,
    );
  }
  return candidate;
}

function publicProviderError(status: number, stage: "otp" | "verify") {
  if (status === 401 || status === 403) {
    return new AadhaarProviderError(
      "provider_authentication",
      "Sandbox authentication or Aadhaar API access is not enabled for this account.",
      false,
      502,
    );
  }
  if (status === 402) {
    return new AadhaarProviderError(
      "provider_credits",
      "Sandbox requires an active subscription or wallet credits for Aadhaar verification.",
      false,
      502,
    );
  }
  if (status === 404) {
    return new AadhaarProviderError(
      "provider_api_disabled",
      "The Aadhaar Offline e-KYC API is not enabled on the Sandbox account.",
      false,
      502,
    );
  }
  if (status === 409) {
    return new AadhaarProviderError(
      "duplicate_request",
      "An Aadhaar OTP request is already active. Please use the latest OTP.",
      false,
      409,
    );
  }
  if (status === 422) {
    return new AadhaarProviderError(
      stage === "verify" ? "invalid_or_expired_otp" : "invalid_aadhaar",
      stage === "verify"
        ? "The OTP is invalid or expired. Request a new OTP and try again."
        : "Sandbox could not accept this Aadhaar number. Check it and try again.",
      false,
      422,
    );
  }
  if (status === 429) {
    return new AadhaarProviderError(
      "provider_rate_limit",
      "Sandbox is temporarily busy. Please wait before retrying.",
      true,
      429,
    );
  }
  if (status >= 500) {
    return new AadhaarProviderError(
      "provider_unavailable",
      "Sandbox could not complete the request. Please try again.",
      true,
      503,
    );
  }
  return new AadhaarProviderError(
    "provider_rejected",
    "Sandbox could not complete the Aadhaar verification request.",
    false,
    400,
  );
}

export function createAadhaarOkycProvider(
  config: AadhaarOkycConfig,
  fetcher: typeof fetch = fetch,
) {
  const request = async (
    path: string,
    stage: "authenticate" | "otp" | "verify",
    body?: unknown,
    token?: string,
  ) => {
    let response: Response;
    try {
      response = await fetcher(config.baseUrl + path, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.key,
          "x-api-version": "1.0.0",
          ...(token
            ? { Authorization: token }
            : { "x-api-secret": config.secret }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new AadhaarProviderError(
        "provider_timeout",
        "Sandbox could not be reached. Please check your connection and retry.",
        true,
        503,
      );
    }
    if (!response.ok) {
      throw publicProviderError(response.status, stage === "verify" ? "verify" : "otp");
    }
    try {
      return record(await response.json());
    } catch {
      throw new AadhaarProviderError(
        "invalid_provider_response",
        "Sandbox returned an invalid verification response.",
        false,
        502,
      );
    }
  };

  const authenticate = async () => {
    const response = await request("/authenticate", "authenticate");
    const token = record(response.data).access_token;
    if (response.code !== 200 || typeof token !== "string" || !token) {
      throw new AadhaarProviderError(
        "provider_authentication",
        "Sandbox authentication failed.",
        false,
        502,
      );
    }
    return token;
  };

  return {
    async generateOtp(aadhaarNumber: string) {
      const token = await authenticate();
      const response = await request(
        "/kyc/aadhaar/okyc/otp",
        "otp",
        {
          "@entity": "in.co.sandbox.kyc.aadhaar.okyc.otp.request",
          aadhaar_number: aadhaarNumber,
          consent: "Y",
          reason: AADHAAR_REASON,
        },
        token,
      );
      const data = record(response.data);
      if (
        response.code !== 200 ||
        data["@entity"] !== "in.co.sandbox.kyc.aadhaar.okyc.otp.response"
      ) {
        throw new AadhaarProviderError(
          "invalid_provider_response",
          "Sandbox did not confirm the OTP request.",
          false,
          502,
        );
      }
      return {
        referenceId: referenceId(data.reference_id),
        transactionId: providerTransactionId(response.transaction_id),
      };
    },

    async verifyOtp(providerReferenceId: string, otp: string) {
      const token = await authenticate();
      const response = await request(
        "/kyc/aadhaar/okyc/otp/verify",
        "verify",
        {
          "@entity": "in.co.sandbox.kyc.aadhaar.okyc.request",
          reference_id: providerReferenceId,
          otp,
        },
        token,
      );
      const data = record(response.data);
      if (
        response.code !== 200 ||
        data["@entity"] !== "in.co.sandbox.kyc.aadhaar.okyc" ||
        referenceId(data.reference_id) !== providerReferenceId
      ) {
        throw new AadhaarProviderError(
          "invalid_provider_response",
          "Sandbox returned an invalid OTP verification response.",
          false,
          502,
        );
      }
      return {
        verified: data.status === "VALID",
        transactionId: providerTransactionId(response.transaction_id),
      };
    },
  };
}
