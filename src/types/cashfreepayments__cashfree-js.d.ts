declare module "@cashfreepayments/cashfree-js" {
  export type CashfreeCheckoutResult = {
    redirect?: boolean;
    error?: { message?: string };
    paymentDetails?: Record<string, unknown>;
  };

  export type CashfreeCheckoutOptions = {
    paymentSessionId: string;
    redirectTarget?: "_self" | "_blank" | "_top" | "_modal";
  };

  export type CashfreeClient = {
    checkout(
      options: CashfreeCheckoutOptions,
    ): Promise<CashfreeCheckoutResult>;
  };

  export function load(options: {
    mode: "sandbox" | "production";
  }): Promise<CashfreeClient>;
}
