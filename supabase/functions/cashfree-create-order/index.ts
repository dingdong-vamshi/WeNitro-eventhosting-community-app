import {
  CashfreeHttpError,
  adminClient,
  authenticatedContext,
  cashfreeRequest,
  checkoutReturnUrl,
  corsHeaders,
  errorResponse,
  firstRecord,
  jsonResponse,
  positiveInteger,
  safeProviderMetadata,
} from "../_shared/cashfree.ts";

type PaymentRow = {
  id: number;
  event_id: number;
  user_id: number;
  provider_order_id: string;
  payment_session_id: string | null;
  amount_paisa: number;
  currency: "INR";
  status: string;
  idempotency_key: string;
  checkout_expires_at: string;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const { client, user } = await authenticatedContext(request);
    const body = (await request.json()) as { activityId?: unknown };
    const activityId = positiveInteger(body.activityId, "Activity ID");

    const prepared = await client.rpc("prepare_activity_payment", {
      p_event_id: activityId,
    });
    if (prepared.error) throw prepared.error;
    const payment = firstRecord(prepared.data as PaymentRow | PaymentRow[]);
    if (!payment) throw new Error("Payment attempt could not be prepared.");

    if (payment.payment_session_id && payment.status === "pending") {
      return jsonResponse({
        paymentId: String(payment.id),
        orderId: payment.provider_order_id,
        paymentSessionId: payment.payment_session_id,
        amountPaisa: payment.amount_paisa,
        currency: payment.currency,
        status: payment.status,
      });
    }

    const customerPhone = user.phone?.trim();
    if (!customerPhone) {
      throw new Error(
        "A verified phone number is required for Cashfree checkout.",
      );
    }

    const returnUrl = checkoutReturnUrl(
      request,
      payment.event_id,
      payment.provider_order_id,
    );
    const orderPayload: Record<string, unknown> = {
      order_id: payment.provider_order_id,
      order_amount: payment.amount_paisa / 100,
      order_currency: payment.currency,
      customer_details: {
        customer_id: "wenitro_" + payment.user_id,
        customer_phone: customerPhone,
        ...(user.email ? { customer_email: user.email } : {}),
      },
      order_expiry_time: payment.checkout_expires_at,
      order_note: "WeNitro activity " + payment.event_id,
      order_tags: {
        activity_id: String(payment.event_id),
        wenitro_payment_id: String(payment.id),
      },
      ...(returnUrl ? { order_meta: { return_url: returnUrl } } : {}),
    };

    let providerOrder: Record<string, unknown>;
    try {
      providerOrder = await cashfreeRequest(
        "/pg/orders",
        { method: "POST", body: JSON.stringify(orderPayload) },
        payment.idempotency_key,
      );
    } catch (error) {
      if (!(error instanceof CashfreeHttpError) || error.status !== 409) {
        throw error;
      }
      providerOrder = await cashfreeRequest(
        "/pg/orders/" + encodeURIComponent(payment.provider_order_id),
      );
    }

    const orderId = String(providerOrder.order_id ?? "");
    const paymentSessionId = String(
      providerOrder.payment_session_id ?? "",
    );
    if (
      orderId !== payment.provider_order_id ||
      !paymentSessionId
    ) {
      throw new Error("Cashfree returned an invalid order response.");
    }
    if (
      Math.round(Number(providerOrder.order_amount) * 100) !==
        payment.amount_paisa ||
      String(providerOrder.order_currency) !== payment.currency
    ) {
      throw new Error("Cashfree order amount did not match the server ledger.");
    }

    const admin = adminClient();
    const recorded = await admin.rpc("record_cashfree_order", {
      p_order_id: orderId,
      p_payment_session_id: paymentSessionId,
      p_provider_status: String(providerOrder.order_status ?? "ACTIVE"),
      p_checkout_expires_at: payment.checkout_expires_at,
      p_provider_metadata: safeProviderMetadata(providerOrder),
    });
    if (recorded.error) throw recorded.error;

    return jsonResponse({
      paymentId: String(payment.id),
      orderId,
      paymentSessionId,
      amountPaisa: payment.amount_paisa,
      currency: payment.currency,
      status: "pending",
    });
  } catch (error) {
    return errorResponse(error);
  }
});
