import { Platform } from "react-native";

import { supabase } from "../lib/supabase";

export type ActivityPaymentStatus =
  | "created"
  | "pending"
  | "paid"
  | "failed"
  | "cancelled"
  | "expired";

export type ActivityPaymentOrder = {
  paymentId: string;
  orderId: string;
  paymentSessionId: string;
  amountPaisa: number;
  currency: "INR";
  status: ActivityPaymentStatus;
};

export type ActivityPaymentVerification = {
  orderId: string;
  status: ActivityPaymentStatus;
  paid: boolean;
};

export type CashfreeCheckoutResult = {
  redirected: boolean;
  completed: boolean;
  errorMessage?: string;
};

export type CashfreeMode = "sandbox" | "production";

export const cashfreeMode = (): CashfreeMode => {
  const configured = process.env.EXPO_PUBLIC_CASHFREE_MODE?.trim().toLowerCase();
  if (!configured) {
    if (__DEV__) return "sandbox";
    throw new Error("EXPO_PUBLIC_CASHFREE_MODE is required for production checkout.");
  }
  if (configured === "sandbox" || configured === "test") return "sandbox";
  if (configured === "production" || configured === "live") return "production";
  throw new Error("EXPO_PUBLIC_CASHFREE_MODE must be sandbox or production.");
};

export const cashfreeCheckoutAvailability = (): { available: boolean; message?: string } =>
  Platform.OS === "web"
    ? { available: true }
    : {
        available: false,
        message: "Secure online payment is currently available on WeNitro web only. This native build does not include the Cashfree SDK.",
      };

const positiveActivityId = (activityId: string | number) => {
  const id = Number(activityId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error("Activity ID must be a positive integer.");
  }
  return id;
};

const invoke = async <T>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> => {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
  });
  if (error) {
    const context = typeof error === "object" && error && "context" in error ? error.context : null;
    if (context instanceof Response) {
      const payload = await context.clone().json().catch(() => null) as { error?: unknown } | null;
      if (typeof payload?.error === "string" && payload.error.trim()) throw new Error(payload.error);
    }
    throw new Error(error.message || "Payment service is unavailable.");
  }
  if (!data || typeof data !== "object") {
    throw new Error("Payment service returned an invalid response.");
  }
  if ("error" in data && typeof data.error === "string") {
    throw new Error(data.error);
  }
  return data as T;
};

export const createActivityPayment = (
  activityId: string | number,
): Promise<ActivityPaymentOrder> => {
  const request = invoke<ActivityPaymentOrder>("cashfree-create-order", {
    activityId: positiveActivityId(activityId),
  });
  return request.then(order => {
    if (!order.paymentSessionId?.trim() || !/^wn_[A-Za-z0-9_]+$/.test(order.orderId) || !Number.isSafeInteger(order.amountPaisa) || order.amountPaisa <= 0 || order.currency !== "INR") {
      throw new Error("Payment service returned an invalid order.");
    }
    return order;
  });
};

export const launchCashfreeCheckout = async (
  paymentSessionId: string,
  returnUrl: string,
): Promise<CashfreeCheckoutResult> => {
  const availability = cashfreeCheckoutAvailability();
  if (!availability.available) throw new Error(availability.message);
  if (!paymentSessionId.trim()) {
    throw new Error("Payment session ID is required.");
  }
  if (!/^https?:\/\//i.test(returnUrl)) {
    throw new Error("A valid HTTP or HTTPS return URL is required.");
  }

  const { load } = await import("@cashfreepayments/cashfree-js");
  const cashfree = await load({ mode: cashfreeMode() });
  if (!cashfree) throw new Error("Cashfree checkout could not be loaded.");

  const result = await cashfree.checkout({
    paymentSessionId,
    redirectTarget: "_modal",
  });
  if (result?.redirect) {
    return { redirected: true, completed: false };
  }
  if (result?.error) {
    return {
      redirected: false,
      completed: false,
      errorMessage:
        result.error.message ?? "Cashfree checkout was not completed.",
    };
  }
  if (result?.paymentDetails) {
    if (typeof window !== "undefined") window.location.assign(returnUrl);
    return { redirected: false, completed: true };
  }
  return { redirected: false, completed: false };
};

export const verifyActivityPayment = (
  orderId: string,
): Promise<ActivityPaymentVerification> => {
  const normalized = orderId.trim();
  if (!/^wn_[A-Za-z0-9_]+$/.test(normalized) || normalized.length > 45) {
    throw new Error("Invalid payment order ID.");
  }
  return invoke<ActivityPaymentVerification>("cashfree-verify-payment", {
    orderId: normalized,
  }).then(result => {
    if (result.orderId !== normalized || typeof result.paid !== "boolean" || !["created", "pending", "paid", "failed", "cancelled", "expired"].includes(result.status)) {
      throw new Error("Payment verification returned an invalid response.");
    }
    return result;
  });
};
