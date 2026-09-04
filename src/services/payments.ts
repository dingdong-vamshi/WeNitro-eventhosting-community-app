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
  if (error) throw error;
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
): Promise<ActivityPaymentOrder> =>
  invoke<ActivityPaymentOrder>("cashfree-create-order", {
    activityId: positiveActivityId(activityId),
  });

export const launchCashfreeCheckout = async (
  paymentSessionId: string,
  returnUrl: string,
): Promise<CashfreeCheckoutResult> => {
  if (Platform.OS !== "web") {
    throw new Error(
      "Cashfree checkout is currently available only on WeNitro web. Native checkout requires a dedicated Cashfree native build.",
    );
  }
  if (!paymentSessionId.trim()) {
    throw new Error("Payment session ID is required.");
  }
  if (!/^https?:\/\//i.test(returnUrl)) {
    throw new Error("A valid HTTP or HTTPS return URL is required.");
  }

  const { load } = await import("@cashfreepayments/cashfree-js");
  const cashfree = await load({ mode: "sandbox" });
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
  });
};
