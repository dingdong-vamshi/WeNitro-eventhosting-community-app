import { supabase } from "../lib/supabase";

export type PartnerAccountStatus = "DRAFT" | "UNDER_REVIEW" | "APPROVED" | "SUSPENDED" | "REJECTED";

export type PartnerBusinessProfile = {
  user_id: number;
  business_name: string;
  description: string;
  city: string;
  activity_types: string[];
  activity_location: string;
  age_category: string;
  status: PartnerAccountStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  decision_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type PartnerPayoutAccount = {
  bank_name: string;
  account_holder_name: string;
  account_number_masked: string;
  ifsc_masked: string;
  upi_id_masked: string;
  review_status: "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "ON_HOLD";
  review_reason: string | null;
  updated_at: string;
};

export type PartnerAccountResult = {
  profile: PartnerBusinessProfile | null;
  payout_account: PartnerPayoutAccount | null;
  eligible: boolean;
  can_host_paid: boolean;
};

export type PartnerAccountInput = {
  business_name: string;
  description: string;
  city: string;
  activity_types: string[];
  activity_location: string;
  age_category: string;
  bank_name: string;
  account_holder_name: string;
  account_number: string;
  ifsc: string;
  upi_id: string;
};

const trimmed = (value: string) => value.trim();

export function validatePartnerAccount(input: PartnerAccountInput): string | null {
  if (trimmed(input.business_name).length < 2 || trimmed(input.business_name).length > 120) return "Enter a business name between 2 and 120 characters.";
  if (trimmed(input.description).length > 1000) return "Keep the description within 1,000 characters.";
  if (trimmed(input.city).length < 2 || trimmed(input.city).length > 120) return "Enter a city between 2 and 120 characters.";
  if (trimmed(input.activity_location).length < 2 || trimmed(input.activity_location).length > 240) return "Enter the location where you usually host activities.";
  if (trimmed(input.age_category).length < 2 || trimmed(input.age_category).length > 80) return "Enter the age category for your activities.";
  const activityTypes = [...new Set(input.activity_types.map(trimmed).filter(Boolean))];
  if (!activityTypes.length || activityTypes.length > 20) return "Choose between 1 and 20 activity types.";

  const accountNumber = input.account_number.replace(/[^A-Za-z0-9]/g, "");
  const upiId = trimmed(input.upi_id).toLowerCase();
  if (!accountNumber && !upiId) return "Provide a bank account or UPI ID for future settlements.";
  if (accountNumber) {
    if (accountNumber.length < 6 || accountNumber.length > 34) return "Enter a valid bank account number.";
    if (trimmed(input.bank_name).length < 2 || trimmed(input.bank_name).length > 120) return "Enter the bank name.";
    if (trimmed(input.account_holder_name).length < 2 || trimmed(input.account_holder_name).length > 160) return "Enter the account holder name.";
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(trimmed(input.ifsc).toUpperCase())) return "Enter a valid 11-character IFSC code.";
  }
  if (upiId && !/^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,63}$/.test(upiId)) return "Enter a valid UPI ID.";
  return null;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

function accountResult(value: unknown): PartnerAccountResult {
  const result = record(value);
  if (!result || typeof result.eligible !== "boolean" || typeof result.can_host_paid !== "boolean" || !("profile" in result) || !("payout_account" in result)) throw new Error("Partner account could not load.");
  if (result.profile !== null) {
    const profile = record(result.profile);
    if (!profile || typeof profile.user_id !== "number" || typeof profile.business_name !== "string" || !["DRAFT", "UNDER_REVIEW", "APPROVED", "SUSPENDED", "REJECTED"].includes(String(profile.status)) || !Array.isArray(profile.activity_types)) throw new Error("Partner account returned an invalid profile.");
  }
  if (result.payout_account !== null) {
    const payout = record(result.payout_account);
    if (!payout || !["UNDER_REVIEW", "APPROVED", "REJECTED", "ON_HOLD"].includes(String(payout.review_status))) throw new Error("Partner account returned invalid settlement details.");
  }
  return result as PartnerAccountResult;
}

export const partnerAccountService = {
  async get(): Promise<PartnerAccountResult> {
    const { data, error } = await supabase.rpc("get_my_partner_profile");
    if (error) throw error;
    return accountResult(data);
  },
  async submit(input: PartnerAccountInput): Promise<PartnerAccountResult> {
    const validation = validatePartnerAccount(input);
    if (validation) throw new Error(validation);
    const application = {
      business_name: trimmed(input.business_name), description: trimmed(input.description), city: trimmed(input.city),
      activity_types: [...new Set(input.activity_types.map(trimmed).filter(Boolean))],
      activity_location: trimmed(input.activity_location), age_category: trimmed(input.age_category),
      bank_name: trimmed(input.bank_name), account_holder_name: trimmed(input.account_holder_name),
      account_number: input.account_number.replace(/[^A-Za-z0-9]/g, ""), ifsc: trimmed(input.ifsc).toUpperCase(),
      upi_id: trimmed(input.upi_id).toLowerCase(),
    };
    const rpc = supabase.rpc as unknown as (name: "submit_partner_application", args: { p_application: typeof application }) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
    const { data, error } = await rpc("submit_partner_application", { p_application: application });
    if (error) throw new Error(error.message);
    return accountResult(data);
  },
};
