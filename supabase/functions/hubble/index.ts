import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.112.4";
import {
  createHubbleHandler,
  type HubbleConfig,
  type HubbleLedgerResult,
  type HubbleTokenContext,
} from "./handler.ts";

const required = (values: Record<string, string>, name: string) => {
  const value = (Deno.env.get(name) ?? values[name] ?? "").trim();
  if (!value) throw new Error(`Hubble configuration ${name} is unavailable.`);
  return value;
};

const keyFromDictionary = (name: string) => {
  const raw = Deno.env.get(name);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed.default ?? Object.values(parsed)[0] ?? null;
  } catch {
    return null;
  }
};

const supabaseUrl = () => Deno.env.get("SUPABASE_URL") ?? "";
const publishableKey = () => Deno.env.get("SUPABASE_ANON_KEY") ??
  keyFromDictionary("SUPABASE_PUBLISHABLE_KEYS") ?? "";
const secretKey = () => Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  keyFromDictionary("SUPABASE_SECRET_KEYS") ?? "";
const admin = (): SupabaseClient => createClient(supabaseUrl(), secretKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

let runtimeSecrets: Record<string, string> | null = null;
const secrets = async () => {
  if (runtimeSecrets) return runtimeSecrets;
  const result = await admin().rpc("provider_runtime_secrets");
  runtimeSecrets = !result.error && result.data && typeof result.data === "object"
    ? result.data as Record<string, string>
    : {};
  return runtimeSecrets;
};

const configuration = async (): Promise<HubbleConfig> => {
  const values = await secrets();
  const environment = required(values, "HUBBLE_ENVIRONMENT");
  const sdkUrl = required(values, "HUBBLE_SDK_URL");
  if (environment !== "staging" || sdkUrl !== "https://sdk.dev.myhubble.money/") {
    throw new Error("Hubble staging is unavailable.");
  }
  return {
    environment,
    sdkUrl,
    clientId: required(values, "HUBBLE_CLIENT_ID"),
    appSecret: required(values, "HUBBLE_APP_SECRET"),
    sharedSecret: required(values, "HUBBLE_SECRET"),
    privateKey: required(values, "HUBBLE_PRIVATE_KEY").replaceAll("\\n", "\n"),
  };
};

const rpc = async <T>(name: string, args: Record<string, unknown>) => {
  const result = await admin().rpc(name, args);
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
};

const handler = createHubbleHandler({
  config: configuration,
  authenticate: async (request) => {
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) throw new Error("Missing bearer token");
    const client = createClient(supabaseUrl(), publishableKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    });
    const result = await client.auth.getUser(authorization.slice(7));
    if (result.error || !result.data.user || result.data.user.is_anonymous) {
      throw new Error("Authentication required");
    }
    return result.data.user.id;
  },
  tokenContext: (authId) => rpc<HubbleTokenContext>("hubble_token_context", {
    p_auth_user_id: authId,
  }),
  balance: (userId) => rpc("hubble_get_balance", { p_user_id: userId }),
  debit: (args) => rpc<HubbleLedgerResult>("hubble_debit", {
    p_user_id: args.userId,
    p_coins: args.coins,
    p_reference_id: args.referenceId,
    p_note: args.note,
  }),
  reverse: (args) => rpc<HubbleLedgerResult>("hubble_reverse", {
    p_user_id: args.userId,
    p_reference_id: args.referenceId,
    p_note: args.note,
  }),
});

Deno.serve(handler);
