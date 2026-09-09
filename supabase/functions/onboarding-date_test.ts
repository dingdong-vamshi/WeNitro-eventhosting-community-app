import { normalizeOnboardingDateOfBirth } from "../../src/utils/onboarding.ts";

function assertEquals(actual: string, expected: string) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, received ${actual}`);
  }
}

Deno.test("normalizes the displayed DD-MM-YYYY date", () => {
  assertEquals(normalizeOnboardingDateOfBirth("19-10-2005"), "2005-10-19");
});

Deno.test("preserves the database YYYY-MM-DD date", () => {
  assertEquals(normalizeOnboardingDateOfBirth("2005-10-19"), "2005-10-19");
});

Deno.test("trims date input before validation", () => {
  assertEquals(normalizeOnboardingDateOfBirth(" 19-10-2005 "), "2005-10-19");
});
