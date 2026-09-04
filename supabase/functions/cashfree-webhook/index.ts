import {
  adminClient,
  amountToPaisa,
  corsHeaders,
  errorResponse,
  jsonResponse,
  safeProviderMetadata,
  verifyWebhookSignature,
} from "../_shared/cashfree.ts";

type JsonRecord = Record<string, unknown>;

const objectValue = (value: unknown): JsonRecord =>
  value && typeof value === "object" ? (value as JsonRecord) : {};

const localStatus = (paymentStatus: string) => {
  if (paymentStatus === "SUCCESS") return "paid";
  if (paymentStatus === "FAILED") return "failed";
  if (paymentStatus === "USER_DROPPED") return "cancelled";
  return "pending";
};

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-webhook-signature");
    const timestamp = request.headers.get("x-webhook-timestamp");
    const webhookVersion = request.headers.get("x-webhook-version");
    const requestSummary = {
      method: request.method,
      signaturePresent: Boolean(signature),
      timestampPresent: Boolean(timestamp),
      versionPresent: Boolean(webhookVersion),
      webhookVersion,
      contentType: request.headers.get("content-type"),
      rawBodyBytes: new TextEncoder().encode(rawBody).byteLength,
    };
    const validSignature = await verifyWebhookSignature(
      rawBody,
      signature,
      timestamp,
    );
    if (!validSignature) {
      console.warn("cashfree_webhook_rejected", requestSummary);
      return jsonResponse({ error: "Invalid webhook signature." }, 401);
    }

    const payload = objectValue(JSON.parse(rawBody));
    console.info("cashfree_webhook_verified", {
      ...requestSummary,
      eventType: String(payload.type ?? payload.event ?? "unknown").slice(0, 80),
    });
    const data = objectValue(payload.data);
    const order = objectValue(data.order);
    const providerPayment = objectValue(data.payment);
    const orderId = String(order.order_id ?? "").trim();
    const paymentStatus = String(
      providerPayment.payment_status ?? "",
    ).toUpperCase();
    if (!orderId || !paymentStatus) {
      return jsonResponse({ received: true });
    }

    const admin = adminClient();
    if (paymentStatus === "SUCCESS") {
      const amountPaisa = amountToPaisa(providerPayment.payment_amount);
      const finalized = await admin.rpc("finalize_activity_payment", {
        p_order_id: orderId,
        p_provider_payment_id: String(
          providerPayment.cf_payment_id ?? "",
        ),
        p_amount_paisa: amountPaisa,
        p_currency: String(providerPayment.payment_currency ?? ""),
        p_provider_status: "SUCCESS",
        p_provider_metadata: safeProviderMetadata({
          ...order,
          ...providerPayment,
        }),
      });
      if (finalized.error) throw finalized.error;
    } else {
      const recorded = await admin.rpc(
        "record_activity_payment_provider_state",
        {
          p_order_id: orderId,
          p_status: localStatus(paymentStatus),
          p_provider_status: paymentStatus,
          p_provider_payment_id: String(
            providerPayment.cf_payment_id ?? "",
          ),
          p_provider_metadata: safeProviderMetadata({
            ...order,
            ...providerPayment,
          }),
        },
      );
      if (recorded.error) throw recorded.error;
    }

    return jsonResponse({ received: true });
  } catch (error) {
    return errorResponse(error);
  }
});
