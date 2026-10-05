import { authenticatedContext, adminClient } from "../_shared/cashfree.ts";
import { createContentModerationHandler } from "./handler.ts";

Deno.serve(createContentModerationHandler({
  env: (name) => Deno.env.get(name),
  authenticate: async (request) => {
    const { user, client } = await authenticatedContext(request);
    const identity = await client.rpc("get_current_app_user_id");
    return { authId: user.id, allowed: !identity.error && Boolean(identity.data) };
  },
  loadImage: async (_authId, image) => {
    const { data, error } = await adminClient().storage.from(image.storageBucket).download(image.storagePath);
    if (error || !data) throw new Error("Image could not be loaded for safety review.");
    return { bytes: new Uint8Array(await data.arrayBuffer()), contentType: data.type || "application/octet-stream" };
  },
  begin: async (authId, scope, items) => await adminClient().rpc("content_moderation_begin", {
    p_auth_id: authId, p_scope: scope, p_items: items,
  }),
  resolve: async (authId, requestId, result) => await adminClient().rpc("content_moderation_resolve", {
    p_auth_id: authId, p_request_id: requestId, ...result,
  }),
  secrets: async () => {
    const { data, error } = await adminClient().rpc("provider_runtime_secrets");
    if (error || !data || typeof data !== "object") return {};
    return data as Record<string, string>;
  },
}));
