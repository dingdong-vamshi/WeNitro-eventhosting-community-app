export type WorkspaceSection = "profile" | "activities" | "communities" | "people" | "vibes" | "stories" | "conversations";

// Only refresh state consumed by the foreground screen. Dedicated screens
// (Partner Dashboard, histories, settings, forms) own their own service reads.
export function foregroundWorkspaceSections(screen: string): WorkspaceSection[] {
  switch (screen) {
    case "feed": case "firstFeed": return ["activities", "vibes", "stories"];
    case "activities": case "activityDetail": case "saved": return ["activities"];
    case "liked": return ["activities", "vibes"];
    case "communities": case "communityDetail": return ["communities"];
    case "vibes": return ["vibes"];
    case "chat": return ["conversations", "stories", "people"];
    case "search": return ["activities", "communities", "people"];
    case "profile": return ["profile", "activities", "vibes", "communities"];
    case "host": case "createActivity": case "editProfile": case "verification":
    case "socialLinks": case "partnerAccount": return ["profile"];
    default: return [];
  }
}

type WorkspaceSlices = {
  activities: unknown[]; communities: unknown[]; people: unknown[];
  vibes: unknown[]; stories: unknown[]; conversations: unknown[];
  likedIds: string[]; savedIds: string[];
};

export function mergeWorkspaceRefresh<T extends WorkspaceSlices>(current: T, refreshed: T, sections: WorkspaceSection[]): T {
  const next = { ...current, ...(sections.includes("profile") ? refreshed : {}) };
  const collectionSections = ["activities", "communities", "people", "vibes", "stories", "conversations"] as const;
  for (const section of collectionSections) next[section] = sections.includes(section) ? refreshed[section] : current[section];
  const refreshedNamespace = (id: string) => (id.startsWith("activity:") && sections.includes("activities"))
    || (id.startsWith("vibe:") && sections.includes("vibes"));
  next.likedIds = [...current.likedIds.filter(id => !refreshedNamespace(id)), ...refreshed.likedIds.filter(refreshedNamespace)];
  next.savedIds = sections.includes("activities") ? refreshed.savedIds : current.savedIds;
  return next;
}
