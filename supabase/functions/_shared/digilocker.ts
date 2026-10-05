export const CONSENT_VERSION = "wenitro-aadhaar-digilocker-sdk-v1";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue
    : {};
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function providerUuid(value: unknown) {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new DigiLockerProviderError(
      "invalid_provider_response",
      "Sandbox returned an invalid DigiLocker session reference.",
      502,
      false,
    );
  }
  return value;
}

export type DigiLockerConfig = {
  environment: "test" | "production";
  key: string;
  secret: string;
  baseUrl: "https://test-api.sandbox.co.in" | "https://api.sandbox.co.in";
};

export function digilockerConfiguration(
  env: (name: string) => string | undefined,
): DigiLockerConfig | null {
  const enabled = env("AADHAAR_DIGILOCKER_ENABLED") ?? env("AADHAAR_OKYC_ENABLED");
  if (enabled !== "true") return null;
  const environment = env("SANDBOX_ENVIRONMENT")?.trim().toLowerCase();
  if (environment !== "test" && environment !== "production") return null;
  const key = env("SANDBOX_API_KEY")?.trim();
  const secret = env("SANDBOX_API_SECRET")?.trim();
  if (!key || !secret) return null;
  const expectedKeyPrefix = environment === "production" ? "key_live_" : "key_test_";
  const expectedSecretPrefix = environment === "production" ? "secret_live_" : "secret_test_";
  if (!key.startsWith(expectedKeyPrefix) || !secret.startsWith(expectedSecretPrefix)) return null;
  return {
    environment,
    key,
    secret,
    baseUrl: environment === "production"
      ? "https://api.sandbox.co.in"
      : "https://test-api.sandbox.co.in",
  };
}

export class DigiLockerProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus = 502,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "DigiLockerProviderError";
  }
}

const providerError = (
  status: number,
  stage: "authenticate" | "create" | "status" | "document",
) => {
  if (status === 401) {
    return new DigiLockerProviderError(
      "provider_authentication",
      "Sandbox rejected the configured API credentials.",
      502,
    );
  }
  if (status === 402) {
    return new DigiLockerProviderError(
      "provider_credits",
      "Sandbox requires an active subscription or wallet credits for DigiLocker verification.",
      502,
    );
  }
  if (status === 403) {
    return new DigiLockerProviderError(
      "digilocker_access_not_enabled",
      "DigiLocker API access is not enabled for this Sandbox account.",
      502,
    );
  }
  if (status === 404) {
    return new DigiLockerProviderError(
      stage === "status" || stage === "document"
        ? "provider_session_not_found"
        : "digilocker_endpoint_not_enabled",
      stage === "status" || stage === "document"
        ? "This DigiLocker session is no longer available. Start a new verification."
        : "The current DigiLocker SDK endpoint is not enabled for this Sandbox account.",
      stage === "status" || stage === "document" ? 410 : 502,
    );
  }
  if (status === 429) {
    return new DigiLockerProviderError(
      "provider_rate_limit",
      "Sandbox is temporarily busy. Please wait before retrying.",
      429,
      true,
    );
  }
  if ([521, 523].includes(status)) {
    return new DigiLockerProviderError(
      status === 521 ? "provider_session_not_found" : "provider_session_not_ready",
      status === 521
        ? "This DigiLocker session is no longer available. Start a new verification."
        : "DigiLocker verification is not complete yet.",
      status === 521 ? 410 : 409,
    );
  }
  if (status >= 500) {
    return new DigiLockerProviderError(
      "provider_unavailable",
      "DigiLocker verification is temporarily unavailable. Please try again.",
      503,
      true,
    );
  }
  return new DigiLockerProviderError(
    "provider_rejected",
    "Sandbox could not complete the DigiLocker request.",
    400,
  );
};

export type DigiLockerProviderStatus =
  | "created"
  | "initialized"
  | "authorized"
  | "succeeded"
  | "failed"
  | "expired";

export function parseSdkSessionStatus(payload: unknown, ownedProviderId: string) {
  const response = record(payload);
  const data = record(response.data);
  if (
    response.code !== 200 ||
    providerUuid(data.id) !== ownedProviderId ||
    ![
      "in.co.sandbox.kyc.digilocker.sdk.session",
      "in.co.sandbox.kyc.digilocker.session",
    ].includes(String(data["@entity"]))
  ) {
    throw new DigiLockerProviderError(
      "provider_session_mismatch",
      "Sandbox returned a DigiLocker session that does not match this account.",
      502,
    );
  }
  const status = String(data.status) as DigiLockerProviderStatus;
  if (![
    "created",
    "initialized",
    "authorized",
    "succeeded",
    "failed",
    "expired",
  ].includes(status)) {
    throw new DigiLockerProviderError(
      "unsupported_provider_status",
      "Sandbox returned an unsupported DigiLocker session status.",
      502,
    );
  }
  const consented = Array.isArray(data.documents_consented) &&
    data.documents_consented.includes("aadhaar");
  return {
    status,
    consented,
    transactionId: providerUuid(response.transaction_id),
  };
}

export function hasIssuedAadhaar(payload: unknown) {
  const response = record(payload);
  const data = record(response.data);
  if (response.code !== 200 || !Array.isArray(data.files)) return false;
  return data.files.some((value) => {
    const file = record(value);
    const metadata = record(file.metadata);
    // Validate only provider metadata. Never fetch, persist, return or log the
    // Aadhaar document URL/content, identity attributes, number, photo or OTP.
    return file["@entity"] === "org.quicko.drive.file" &&
      metadata.issuer_id === "in.gov.uidai" &&
      metadata.ContentType === "application/xml" && Number(file.size) > 0;
  });
}

export function createDigiLockerProvider(
  config: DigiLockerConfig,
  fetcher: typeof fetch = fetch,
) {
  const request = async (
    path: string,
    method: "GET" | "POST",
    stage: "authenticate" | "create" | "status" | "document",
    body?: unknown,
    token?: string,
  ) => {
    let response: Response;
    try {
      response = await fetcher(config.baseUrl + path, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.key,
          "x-api-version": "1.0.0",
          ...(token ? { Authorization: token } : { "x-api-secret": config.secret }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new DigiLockerProviderError(
        "provider_timeout",
        "Sandbox could not be reached. Please try again.",
        503,
        true,
      );
    }
    if (!response.ok) throw providerError(response.status, stage);
    try {
      return record(await response.json());
    } catch {
      throw new DigiLockerProviderError(
        "invalid_provider_response",
        "Sandbox returned an invalid DigiLocker response.",
        502,
      );
    }
  };

  const authenticate = async () => {
    const response = await request("/authenticate", "POST", "authenticate");
    const token = record(response.data).access_token;
    if (response.code !== 200 || typeof token !== "string" || !token) {
      throw new DigiLockerProviderError(
        "provider_authentication",
        "Sandbox authentication failed.",
        502,
      );
    }
    return token;
  };

  return {
    async createSession() {
      const token = await authenticate();
      const response = await request(
        "/kyc/digilocker-sdk/sessions/create",
        "POST",
        "create",
        {
          "@entity": "in.co.sandbox.kyc.digilocker.sdk.session.request",
          flow: "signin",
          doc_types: ["aadhaar"],
        },
        token,
      );
      const data = record(response.data);
      if (
        response.code !== 200 ||
        data["@entity"] !== "in.co.sandbox.kyc.digilocker.sdk.session" ||
        data.status !== "created"
      ) {
        throw new DigiLockerProviderError(
          "invalid_provider_response",
          "Sandbox did not create a valid DigiLocker SDK session.",
          502,
        );
      }
      return {
        providerId: providerUuid(data.id),
        transactionId: providerUuid(response.transaction_id),
      };
    },

    async refresh(providerId: string) {
      providerUuid(providerId);
      const token = await authenticate();
      const status = parseSdkSessionStatus(
        await request(
          `/kyc/digilocker-sdk/sessions/${providerId}/status`,
          "GET",
          "status",
          undefined,
          token,
        ),
        providerId,
      );
      if (status.status !== "succeeded" || !status.consented) {
        return { ...status, issuedAadhaar: false };
      }
      const document = await request(
        `/kyc/digilocker-sdk/sessions/${providerId}/documents/aadhaar`,
        "GET",
        "document",
        undefined,
        token,
      );
      return { ...status, issuedAadhaar: hasIssuedAadhaar(document) };
    },
  };
}
