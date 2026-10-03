/** Display follows the server collection mode; ordinary hosts never collect through WeNitro. */
export function activityDisplayPrice(input: {
  priceInr: number;
  isPaid: boolean;
  paymentCollectionMode: 'onsite' | 'cashfree';
  costsMayApply?: boolean;
  entryFeeRequired?: boolean;
}): string {
  const hasCost = input.isPaid || input.priceInr > 0 || input.costsMayApply || input.entryFeeRequired;
  if (!hasCost) return 'Free';
  if (input.paymentCollectionMode === 'onsite') return 'Costs may apply';
  return input.priceInr > 0 ? `₹${input.priceInr}` : 'Price unavailable';
}
