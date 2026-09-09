import { supabase } from "../lib/supabase";

export type PartnerAccountStatus = "draft" | "pending" | "active" | "suspended" | "rejected";
export type PartnerBusinessProfile = {
  user_id: number;
  business_name: string;
  description: string;
  city: string;
  status: PartnerAccountStatus;
  created_at: string;
  updated_at: string;
};
export type PartnerAccountResult = { profile: PartnerBusinessProfile | null; eligible: boolean };
export type PartnerAccountInput = { business_name: string; description: string; city: string };

export function validatePartnerAccount(input: PartnerAccountInput): string | null {
  if (input.business_name.trim().length < 2 || input.business_name.trim().length > 120) return "Enter a business name between 2 and 120 characters.";
  if (input.description.trim().length > 1000) return "Keep the description within 1,000 characters.";
  if (input.city.trim().length > 120) return "Keep the city within 120 characters.";
  return null;
}

function accountResult(value: unknown): PartnerAccountResult {
  if (!value || typeof value !== "object" || !("eligible" in value) || typeof value.eligible !== "boolean" || !("profile" in value)) throw new Error("Partner account could not load.");
  if (value.profile !== null) {
    const profile = value.profile;
    if (!profile || typeof profile !== "object" || !("user_id" in profile) || typeof profile.user_id !== "number" || !("business_name" in profile) || typeof profile.business_name !== "string" || !("status" in profile) || !["draft", "pending", "active", "suspended", "rejected"].includes(String(profile.status))) throw new Error("Partner account returned an invalid profile.");
  }
  return value as PartnerAccountResult;
}

export const partnerAccountService = {
  async get(): Promise<PartnerAccountResult> {
    const { data, error } = await supabase.rpc("get_my_partner_profile");
    if (error) throw error;
    return accountResult(data);
  },
  async save(input: PartnerAccountInput): Promise<PartnerAccountResult> {
    const validation = validatePartnerAccount(input);
    if (validation) throw new Error(validation);
    const { data, error } = await supabase.rpc("save_my_partner_profile", {
      p_business_name: input.business_name.trim(),
      p_description: input.description.trim(),
      p_city: input.city.trim(),
    });
    if (error) throw error;
    return accountResult(data);
  },
};
