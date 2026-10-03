import {
  adminClient,
  amountToPaisa,
  authenticatedContext,
  cashfreeRequest,
  corsHeaders,
  errorResponse,
  jsonResponse,
  firstRecord,
  paymentVerificationReceipt,
  safeProviderMetadata,
} from "../_shared/cashfree.ts";

type PaymentRow = {
  id: number;
  provider_order_id: string;
  amount_paisa: number;
  currency: string;
  status: string;
  event_id: number;
  user_id: number;
  financial_status: string | null;
};

const localStatus = (providerStatus: string) => {
  if (providerStatus === "PAID") return "paid";
  if (providerStatus === "EXPIRED") return "expired";
  if (providerStatus === "TERMINATED") return "cancelled";
  return "pending";
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const { client } = await authenticatedContext(request);
    const body = (await request.json()) as { orderId?: unknown };
    const orderId = String(body.orderId ?? "").trim();
    if (!/^wn_[A-Za-z0-9_]+$/.test(orderId) || orderId.length > 45) {
      throw new Error("Invalid payment order ID.");
    }

    const owned = await client
      .from("tbl_activity_payments")
      .select("id,event_id,user_id,provider_order_id,amount_paisa,currency,status,financial_status")
      .eq("provider_order_id", orderId)
      .single();
    if (owned.error || !owned.data) {
      throw new Error("Payment order not found.");
    }
    const payment = owned.data as PaymentRow;

    const receipt = async (recorded: PaymentRow) => {
      const participation = await client.from("tbl_event_participants")
        .select("status").eq("event_id", recorded.event_id)
        .eq("user_id", recorded.user_id).maybeSingle();
      if (participation.error) throw participation.error;
      return jsonResponse(paymentVerificationReceipt(recorded, participation.data?.status ?? null));
    };
    // Rechecking a terminal paid order must use its current financial and seat
    // state, including refund cases, without treating provider PAID as admission.
    if (payment.status === "paid") return await receipt(payment);

    const providerOrder = await cashfreeRequest(
      "/pg/orders/" + encodeURIComponent(orderId),
    );
    const providerStatus = String(providerOrder.order_status ?? "ACTIVE");
    const providerAmountPaisa = amountToPaisa(providerOrder.order_amount);
    const providerCurrency = String(providerOrder.order_currency ?? "");
    if (
      String(providerOrder.order_id) !== payment.provider_order_id ||
      providerAmountPaisa !== payment.amount_paisa ||
      providerCurrency !== payment.currency
    ) {
      throw new Error("Provider order does not match the server ledger.");
    }

    const admin = adminClient();
    let recordedPayment: PaymentRow | null = null;
    if (providerStatus === "PAID") {
      const payments = await cashfreeRequest(
        "/pg/orders/" + encodeURIComponent(orderId) + "/payments",
      );
      const attempts = Array.isArray(payments) ? payments : [];
      const successful = attempts.find(
        (attempt) =>
          attempt &&
          typeof attempt === "object" &&
          String((attempt as Record<string, unknown>).payment_status) ===
            "SUCCESS",
      ) as Record<string, unknown> | undefined;
      if (!successful) {
        throw new Error(
          "Cashfree marked the order paid but no successful payment was found.",
        );
      }
      if (
        amountToPaisa(successful.payment_amount) !== payment.amount_paisa ||
        String(successful.payment_currency) !== payment.currency
      ) {
        throw new Error("Provider payment does not match the server ledger.");
      }
      const finalized = await admin.rpc("finalize_activity_payment", {
        p_order_id: orderId,
        p_provider_payment_id: String(successful.cf_payment_id ?? ""),
        p_amount_paisa: payment.amount_paisa,
        p_currency: payment.currency,
        p_provider_status: "PAID",
        p_provider_metadata: safeProviderMetadata({
          ...providerOrder,
          ...successful,
        }),
      });
      if (finalized.error) throw finalized.error;
      recordedPayment = firstRecord(finalized.data as PaymentRow | PaymentRow[]);
    } else {
      const recorded = await admin.rpc(
        "record_activity_payment_provider_state",
        {
          p_order_id: orderId,
          p_status: localStatus(providerStatus),
          p_provider_status: providerStatus,
          p_provider_payment_id: null,
          p_provider_metadata: safeProviderMetadata(providerOrder),
        },
      );
      if (recorded.error) throw recorded.error;
      recordedPayment = firstRecord(recorded.data as PaymentRow | PaymentRow[]);
    }

    if (!recordedPayment) throw new Error("Payment verification did not return a ledger record.");
    return await receipt(recordedPayment);
  } catch (error) {
    return errorResponse(error);
  }
});
