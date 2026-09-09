import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { profileProductionService, type Profile } from "./profile-production";
import {
  suggestOnboardingUsername,
  validateOnboardingDateOfBirth,
  validateOnboardingGender,
  validateOnboardingUsername,
  type OnboardingGender,
} from "../utils/onboarding";

export type ProfileOnboardingInput = {
  fullName: string;
  username: string;
  dateOfBirth: string;
  gender?: OnboardingGender | null;
  photoUri?: string | null;
  /** Best-effort Google image import; an explicitly picked photo takes priority. */
  providerAvatarUri?: string | null;
};

export type ProfileOnboardingState = {
  profile: Profile;
  suggestedFullName: string;
  suggestedUsername: string;
  suggestedAvatarUrl: string | null;
};

const safeAvatarUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  try { return new URL(value).protocol === "https:" ? value : null; } catch { return null; }
};

async function authenticatedUser() {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured for this build.");
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Please sign in again to finish your profile.");
  return data.user;
}

async function requireSameIdentity(expectedId: string) {
  if ((await authenticatedUser()).id !== expectedId) {
    throw new Error("Your signed-in account changed. Reopen profile setup before saving.");
  }
}

function isAuthenticationFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const issue = error as { code?: unknown; status?: unknown; statusCode?: unknown; name?: unknown; message?: unknown };
  return ["401", "403"].includes(String(issue.status ?? issue.statusCode ?? "")) ||
    ["42501", "PGRST301", "PGRST302"].includes(String(issue.code ?? "")) ||
    String(issue.name ?? "").startsWith("Auth") ||
    /authentication required|account changed|sign in again|invalid.*(?:jwt|token)|session.*(?:missing|expired)/i.test(String(issue.message ?? ""));
}

function profileError(error: { code?: string; message?: string }): Error {
  if (error.code === "PGRST202" || error.code === "42883") {
    return new Error("Profile setup is temporarily unavailable. The onboarding database update is required.");
  }
  if (error.code === "23505") return new Error("That username is already taken. Choose another.");
  if (error.code === "42501") return new Error("Please sign in again to finish your profile.");
  if (error.code === "22023") return new Error(error.message || "Check your profile details and try again.");
  return new Error("Could not save your profile. Check your connection and try again.");
}

export const profileOnboardingService = {
  async load(): Promise<ProfileOnboardingState> {
    const user = await authenticatedUser();
    const { profile } = await profileProductionService.loadProfile();
    const metadata = user.user_metadata;
    const providerName = typeof metadata.full_name === "string" ? metadata.full_name :
      typeof metadata.name === "string" ? metadata.name : "";
    const fullName = profile.full_name || providerName;
    return {
      profile,
      suggestedFullName: fullName,
      suggestedUsername: profile.onboarding_completed ? profile.username :
        suggestOnboardingUsername(fullName, user.email),
      suggestedAvatarUrl: profile.avatar_url || safeAvatarUrl(metadata.avatar_url ?? metadata.picture),
    };
  },

  /** Call on blur or debounce in the UI; the RPC exposes only availability. */
  async checkUsername(value: string): Promise<{ username: string; available: boolean }> {
    const username = validateOnboardingUsername(value);
    await authenticatedUser();
    const { data, error } = await supabase.rpc("check_onboarding_username", { p_username: username });
    if (error) throw profileError(error);
    if (typeof data !== "boolean") throw new Error("Could not check username availability. Try again.");
    return { username, available: data };
  },

  async complete(input: ProfileOnboardingInput): Promise<Profile> {
    const fullName = input.fullName.trim();
    if (!fullName || fullName.length > 150) throw new Error("Full name must contain 1–150 characters.");
    const username = validateOnboardingUsername(input.username);
    const dateOfBirth = validateOnboardingDateOfBirth(input.dateOfBirth);
    const gender = validateOnboardingGender(input.gender);
    const expectedAuthUserId = (await authenticatedUser()).id;
    // This precheck avoids uploading an optional photo for an already reserved name.
    // The completion RPC repeats the check under a lock to handle concurrent submits.
    const availability = await this.checkUsername(username);
    if (!availability.available) throw new Error("That username is already taken. Choose another.");
    if (input.photoUri) {
      await requireSameIdentity(expectedAuthUserId);
      await profileProductionService.uploadAvatar(input.photoUri, expectedAuthUserId);
    } else {
      const providerAvatar = safeAvatarUrl(input.providerAvatarUri);
      if (providerAvatar) {
        await requireSameIdentity(expectedAuthUserId);
        try {
          await profileProductionService.uploadAvatar(providerAvatar, expectedAuthUserId);
        } catch (error) {
          // A failed optional Google image download must not block profile setup.
          // A changed/expired session remains a hard failure, even for this image.
          await requireSameIdentity(expectedAuthUserId);
          if (isAuthenticationFailure(error)) throw new Error("Please sign in again to finish your profile.");
        }
      }
    }
    await requireSameIdentity(expectedAuthUserId);
    const { error } = await supabase.rpc("complete_my_onboarding", {
      p_expected_auth_user_id: expectedAuthUserId,
      p_full_name: fullName,
      p_username: username,
      p_dob: dateOfBirth,
      p_gender: gender,
    });
    if (error) throw profileError(error);
    await requireSameIdentity(expectedAuthUserId);
    const { profile } = await profileProductionService.loadProfile();
    await requireSameIdentity(expectedAuthUserId);
    return profile;
  },
};
