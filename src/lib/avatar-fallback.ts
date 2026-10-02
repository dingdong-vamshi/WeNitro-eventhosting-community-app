const AVATAR_COLORS = ['#5B3DA0', '#24558F', '#8B3F68', '#276B67', '#8B572F', '#444D98', '#815229', '#536E30'] as const;

/** Stable per identity, not random on every render; every color has white-text contrast. */
export function avatarFallbackColor(identity: string) {
  let hash = 2166136261;
  for (const character of identity) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
  return AVATAR_COLORS[(hash >>> 0) % AVATAR_COLORS.length];
}

export function avatarInitials(name: string) {
  return name.trim().split(/\s+/).map(word => word.match(/[\p{L}\p{N}]/u)?.[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
}
