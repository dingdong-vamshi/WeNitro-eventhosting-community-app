import type { DiscoverActivitiesInput } from '../services/activities-production';

export type ActivityQuickFilter = 'All' | 'Popular' | 'Nearby' | 'Today' | 'Tomorrow';
export type ActivityPriceFilter = 'All' | 'Free' | 'Paid';
export type ActivityGenderFilter = 'All' | 'Male' | 'Female' | 'Non-binary';

type DiscoveryFilterState = {
  quickFilter: ActivityQuickFilter;
  categories: string[];
  dateFrom: string;
  dateTo: string;
  price: ActivityPriceFilter;
  gender: ActivityGenderFilter;
  verifiedOnly: boolean;
};

const dayStart = (value: Date) => {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
};

const dayEnd = (value: Date) => {
  const result = dayStart(value);
  result.setDate(result.getDate() + 1);
  result.setMilliseconds(-1);
  return result;
};

const dateOnly = (value: string, end = false) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T${end ? '23:59:59.999' : '00:00:00'}`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
};

const later = (left: Date | null, right: Date | null) => {
  if (!left) return right;
  if (!right) return left;
  return left.getTime() >= right.getTime() ? left : right;
};

const earlier = (left: Date | null, right: Date | null) => {
  if (!left) return right;
  if (!right) return left;
  return left.getTime() <= right.getTime() ? left : right;
};

export function dateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function activityDiscoveryInput(
  state: DiscoveryFilterState,
  now = new Date(),
): Pick<DiscoverActivitiesInput, 'categories' | 'startsAfter' | 'startsBefore' | 'freeOnly' | 'minPriceInr' | 'genderPreference' | 'verifiedOnly'> {
  let startsAfter = dateOnly(state.dateFrom);
  let startsBefore = dateOnly(state.dateTo, true);

  if (state.quickFilter === 'Today' || state.quickFilter === 'Tomorrow') {
    const target = dayStart(now);
    if (state.quickFilter === 'Tomorrow') target.setDate(target.getDate() + 1);
    startsAfter = later(startsAfter, target);
    startsBefore = earlier(startsBefore, dayEnd(target));
  }

  const genderPreference = state.gender === 'Non-binary'
    ? 'non_binary'
    : state.gender === 'All'
      ? undefined
      : state.gender.toLowerCase();

  return {
    categories: state.categories.length ? state.categories : undefined,
    startsAfter: startsAfter?.toISOString(),
    startsBefore: startsBefore?.toISOString(),
    freeOnly: state.price === 'Free' ? true : undefined,
    minPriceInr: state.price === 'Paid' ? 0.01 : undefined,
    genderPreference,
    verifiedOnly: state.verifiedOnly ? true : undefined,
  };
}

export function activityPriceBadge(activity: {
  price?: string | null;
  costsMayApply?: boolean;
  entryFeeRequired?: boolean;
}) {
  const amount = Number(String(activity.price ?? '').replace(/[^0-9.]/g, ''));
  return activity.costsMayApply || activity.entryFeeRequired || amount > 0 ? 'PAID' : 'FREE';
}
