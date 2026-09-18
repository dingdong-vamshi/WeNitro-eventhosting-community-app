export function isPrivateActivity(item: { visibility?: string | null }) {
  return item.visibility === "private";
}

export function viewerCanListActivity(
  item: { visibility?: string | null; ownerId?: string | null; viewerStatus?: string | null },
  userId?: string | null,
) {
  if (!isPrivateActivity(item)) return true;
  if (userId && item.ownerId === userId) return true;
  return ["going", "approved", "paid", "pending", "waitlist"].includes(String(item.viewerStatus || ""));
}
