export function normalizeOnboardingDateOfBirth(value: string): string {
  const trimmed = value.trim();
  const displayDate = /^(\d{2})-(\d{2})-(\d{4})$/.exec(trimmed);
  if (!displayDate) return trimmed;

  return `${displayDate[3]}-${displayDate[2]}-${displayDate[1]}`;
}
