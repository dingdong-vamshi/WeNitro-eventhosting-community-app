import {
  CONSENT_VERSION,
  createDigiLockerProvider,
  DigiLockerProviderError,
  digilockerConfiguration,
} from "../_shared/digilocker.ts";

type Session = {
  id: string;
  environment: "test" | "production";
  provider_session_id: string | null;
  status: string;
  expires_at: string;
  verified_at: string | null;
};

type Dependencies = {
  authenticate: (request: Request) => Promise<{
    authId: string;
    allowed: boolean;
    syncVerified: () => Promise<unknown>;
  }>;
  ledger: (
    authId: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  env: (name: string) => string | undefined;
  secrets?: () => Promise<Record<string, string>>;
  fetcher?: typeof fetch;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

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
      if (!["availability", "begin", "refresh"].includes(String(action))) {
        return jsonResponse({ error: "Invalid verification action." }, 400);
      }
      const runtimeSecrets = deps.secrets
        ? await deps.secrets().catch(() => ({} as Record<string, string>))
        : {};
      const config = digilockerConfiguration((name) => deps.env(name) ?? runtimeSecrets[name]);
      if (!config) {
        return jsonResponse({
          available: false,
          verified: false,
          status: "unavailable",
          message: "DigiLocker verification is not enabled or its Sandbox credentials do not match the configured environment.",
        });
      }
      const ledger = async (args: Record<string, unknown>): Promise<Session | null> => {
        const { data, error } = await deps.ledger(actor.authId, args);
        if (error) {
          throw new Error(
            /Please wait/.test(error.message)
              ? "Please wait before starting or checking another DigiLocker verification."
              : "Verification session is unavailable. Please start again.",
          );
        }
        return data as Session | null;
      };
      const existing = await ledger({ p_action: "read" });
      const publicStatus = (session: Session | null) => ({
        available: true,
        testMode: config.environment === "test",
        verified: Boolean(session?.verified_at),
        status: session?.verified_at ? "verified" : session?.status ?? "not_started",
      });
      if (action === "availability" || existing?.verified_at) {
        return jsonResponse(publicStatus(existing));
      }
      const provider = createDigiLockerProvider(config, deps.fetcher);

      if (action === "begin") {
        if (body.consent !== true || body.consentVersion !== CONSENT_VERSION) {
          return jsonResponse({ error: "Your explicit consent is required to continue." }, 400);
        }
        const session = await ledger({ p_action: "begin", p_environment: config.environment });
        if (!session) throw new Error("Verification session could not start.");
        try {
          const result = await provider.createSession();
          const recorded = await ledger({
            p_action: "update",
            p_environment: config.environment,
            p_session_id: session.id,
            p_provider_session_id: result.providerId,
            p_status: "created",
            p_transaction_id: result.transactionId,
          });
          return jsonResponse({
            ...publicStatus(recorded),
            status: "created",
            sessionId: result.providerId,
            publicApiKey: config.key,
          });
        } catch (error) {
          await ledger({
            p_action: "update",
            p_environment: config.environment,
            p_session_id: session.id,
            p_status: "failed",
          }).catch(() => null);
          throw error;
        }
      }

      if (!existing?.provider_session_id || existing.environment !== config.environment) {
        return jsonResponse({ error: "Start a new DigiLocker verification session." }, 400);
      }
      if (
        new Date(existing.expires_at).getTime() <= Date.now() ||
        ["failed", "expired"].includes(existing.status)
      ) {
        return jsonResponse({ ...publicStatus(existing), status: "expired", verified: false });
      }
      await ledger({ p_action: "claim_refresh", p_session_id: existing.id });
      const result = await provider.refresh(existing.provider_session_id);
      const verified = config.environment === "production" &&
        result.status === "succeeded" && result.consented && result.issuedAadhaar;
      const recorded = await ledger({
        p_action: "update",
        p_environment: config.environment,
        p_session_id: existing.id,
        p_provider_session_id: existing.provider_session_id,
        p_status: result.status,
        p_verified: verified,
        p_transaction_id: result.transactionId,
      });
      if (verified) await actor.syncVerified();
      const message = verified
        ? "Aadhaar verified. Your Trust Score now includes +20."
        : result.status === "succeeded"
          ? config.environment === "test"
            ? "Sandbox test verification completed. Test sessions do not add Trust Score."
            : "DigiLocker completed, but a consented UIDAI-issued Aadhaar document was not confirmed."
          : result.status === "failed" || result.status === "expired"
            ? "This DigiLocker session ended without verification. Start a new session."
            : "DigiLocker verification is still in progress.";
      return jsonResponse({ ...publicStatus(recorded), status: result.status, message });
    } catch (error) {
      if (error instanceof DigiLockerProviderError) {
        return jsonResponse({
          error: error.message,
          code: error.code,
          retryable: error.retryable,
        }, error.httpStatus);
      }
      const candidate = error instanceof Error ? error.message : "";
      const message = /^(Verification |Please wait |Account unavailable|Authentication required|Missing bearer token)/.test(candidate)
        ? candidate
        : "Verification could not continue.";
      const status = /Authentication required|Missing bearer token/.test(message) ? 401 : 400;
      return jsonResponse({ error: message }, status);
    }
  };
}
