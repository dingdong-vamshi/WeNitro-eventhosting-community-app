import {
  AADHAAR_CONSENT_VERSION,
  AADHAAR_REASON,
  AadhaarProviderError,
  aadhaarOkycConfiguration,
  createAadhaarOkycProvider,
} from "../_shared/aadhaar-okyc.ts";

type Session = {
  id: string;
  environment: "test" | "production";
  provider_reference_id: string | null;
  status: string;
  expires_at: string;
  verified_at: string | null;
  aadhaar_last4: string | null;
};

type Dependencies = {
  authenticate: (request: Request) => Promise<{ authId: string; allowed: boolean }>;
  ledger: (
    authId: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  env: (name: string) => string | undefined;
  fetcher?: typeof fetch;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

const maskedAadhaar = (last4: string | null | undefined) =>
  last4 && /^\d{4}$/.test(last4) ? `•••• •••• ${last4}` : undefined;

export function createAadhaarHandler(deps: Dependencies) {
  return async function handleAadhaarVerification(request: Request) {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);
    try {
      const actor = await deps.authenticate(request);
      if (!actor.allowed) return jsonResponse({ error: "Account unavailable." }, 403);
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return jsonResponse({ error: "Invalid verification request." }, 400);
      }
      const action = body.action;
      if (!["availability", "sendOtp", "verifyOtp"].includes(String(action))) {
        return jsonResponse({ error: "Invalid verification action." }, 400);
      }
      const config = aadhaarOkycConfiguration(deps.env);
      if (!config) {
        return jsonResponse({
          available: false,
          verified: false,
          status: "unavailable",
          reason: AADHAAR_REASON,
          message: "Aadhaar verification is not enabled yet.",
        });
      }
      const ledger = async (args: Record<string, unknown>): Promise<Session | null> => {
        const { data, error } = await deps.ledger(actor.authId, args);
        if (error) {
          throw new Error(
            /Please wait/.test(error.message)
              ? "Please wait before requesting another Aadhaar OTP."
              : /attempts/i.test(error.message)
                ? "Too many OTP attempts. Request a new OTP."
                : "Verification session is unavailable. Please start again.",
          );
        }
        return data as Session | null;
      };
      const existing = await ledger({ p_action: "read" });
      const publicState = (session: Session | null) => ({
        available: true,
        testMode: config.environment === "test",
        verified: Boolean(session?.verified_at),
        status: session?.verified_at ? "verified" : session?.status ?? "not_started",
        reason: AADHAAR_REASON,
        maskedAadhaar: maskedAadhaar(session?.aadhaar_last4),
      });
      if (action === "availability" || existing?.verified_at) {
        return jsonResponse(publicState(existing));
      }
      const provider = createAadhaarOkycProvider(config, deps.fetcher);

      if (action === "sendOtp") {
        const aadhaarNumber = typeof body.aadhaarNumber === "string" ? body.aadhaarNumber : "";
        if (!/^\d{12}$/.test(aadhaarNumber)) {
          return jsonResponse({ error: "Enter a valid 12-digit Aadhaar number." }, 400);
        }
        if (
          body.consent !== true ||
          body.consentVersion !== AADHAAR_CONSENT_VERSION
        ) {
          return jsonResponse({ error: "Your explicit consent is required to continue." }, 400);
        }
        const session = await ledger({
          p_action: "begin",
          p_environment: config.environment,
          p_aadhaar_last4: aadhaarNumber.slice(-4),
        });
        if (!session) throw new Error("Verification session could not start.");
        try {
          const result = await provider.generateOtp(aadhaarNumber);
          const recorded = await ledger({
            p_action: "update",
            p_environment: config.environment,
            p_session_id: session.id,
            p_provider_reference_id: result.referenceId,
            p_status: "otp_sent",
            p_transaction_id: result.transactionId,
          });
          return jsonResponse({
            ...publicState(recorded),
            message: "OTP sent to the mobile number registered with this Aadhaar.",
          });
        } catch (error) {
          const code = error instanceof AadhaarProviderError ? error.code : "provider_unavailable";
          await ledger({
            p_action: "error",
            p_session_id: session.id,
            p_error_code: code,
          }).catch(() => null);
          throw error;
        }
      }

      const otp = typeof body.otp === "string" ? body.otp : "";
      if (!/^\d{6}$/.test(otp)) {
        return jsonResponse({ error: "Enter the 6-digit OTP sent by Sandbox." }, 400);
      }
      if (
        !existing?.provider_reference_id ||
        existing.environment !== config.environment
      ) {
        return jsonResponse({ error: "Request a new Aadhaar OTP first." }, 400);
      }
      if (
        new Date(existing.expires_at).getTime() <= Date.now() ||
        ["failed", "expired"].includes(existing.status)
      ) {
        return jsonResponse({
          ...publicState(existing),
          verified: false,
          status: "expired",
          message: "This OTP session expired. Request a new OTP.",
        });
      }
      await ledger({ p_action: "claim_verify", p_session_id: existing.id });
      try {
        const result = await provider.verifyOtp(existing.provider_reference_id, otp);
        const verified = config.environment === "production" && result.verified;
        const recorded = await ledger({
          p_action: "update",
          p_environment: config.environment,
          p_session_id: existing.id,
          p_provider_reference_id: existing.provider_reference_id,
          p_status: result.verified ? "succeeded" : "failed",
          p_verified: verified,
          p_transaction_id: result.transactionId,
        });
        return jsonResponse({
          ...publicState(recorded),
          message: verified
            ? "Aadhaar verified. Your Trust Score now includes +20."
            : config.environment === "test"
              ? "Sandbox test verification completed. Test results do not award Trust Score."
              : "Sandbox did not verify this Aadhaar OTP.",
        });
      } catch (error) {
        const code = error instanceof AadhaarProviderError ? error.code : "provider_unavailable";
        await ledger({
          p_action: "error",
          p_session_id: existing.id,
          p_error_code: code,
        }).catch(() => null);
        throw error;
      }
    } catch (error) {
      if (error instanceof AadhaarProviderError) {
        return jsonResponse(
          { error: error.message, code: error.code, retryable: error.retryable },
          error.httpStatus,
        );
      }
      const candidate = error instanceof Error ? error.message : "";
      const message = /^(Verification |Please wait |Too many |Account unavailable|Authentication required|Missing bearer token)/.test(candidate)
        ? candidate
        : "Verification could not continue.";
      const status = /Authentication required|Missing bearer token/.test(message) ? 401 : 400;
      return jsonResponse({ error: message }, status);
    }
  };
}
