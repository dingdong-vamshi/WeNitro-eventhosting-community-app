export function normalizeOnboardingDateOfBirth(value: string): string {
  const trimmed = value.trim();
  const displayDate = /^(\d{2})-(\d{2})-(\d{4})$/.exec(trimmed);
  if (!displayDate) return trimmed;

  return `${displayDate[3]}-${displayDate[2]}-${displayDate[1]}`;
}

export const ONBOARDING_GENDERS = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
  { label: "Non-binary", value: "non_binary" },
  { label: "Prefer not to say", value: "prefer_not_to_say" },
] as const;

export type OnboardingGender = (typeof ONBOARDING_GENDERS)[number]["value"];

export function validateOnboardingUsername(value: string): string {
  const username = value.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    throw new Error("Username must be 3–30 letters, numbers, or underscores.");
  }
  return username;
}

/** A suggestion only: the profile screen requires the user to confirm it. */
export function suggestOnboardingUsername(name: string, email?: string | null): string {
  const seed = name.trim() || email?.split("@")[0] || "";
  return seed.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30);
}

export function validateOnboardingDateOfBirth(value: string, today = new Date()): string | null {
  const date = value.trim();
  if (!date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Date of birth must use YYYY-MM-DD.");
  }
  const birth = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(birth.getTime()) || birth.toISOString().slice(0, 10) !== date) {
    throw new Error("Enter a real date of birth.");
  }
  if (date > today.toISOString().slice(0, 10)) {
    throw new Error("Date of birth cannot be in the future.");
  }
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  if (today.getUTCMonth() < birth.getUTCMonth() ||
      (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate())) age -= 1;
  // This is the existing profile service's age policy, not a new onboarding rule.
  if (age < 18) throw new Error("WeNitro profiles require a minimum age of 18.");
  return date;
}

export function validateOnboardingGender(value: string | null | undefined): OnboardingGender | null {
  if (!value) return null;
  if (!ONBOARDING_GENDERS.some((gender) => gender.value === value)) {
    throw new Error("Choose one of the displayed gender options.");
  }
  return value as OnboardingGender;
}
