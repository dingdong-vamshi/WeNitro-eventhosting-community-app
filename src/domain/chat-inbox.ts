type Message = { id: string; createdAt?: string };

/** An inbox preview is not a full history page. Keep already loaded messages,
 * replace updated matching IDs, and remove any explicit server tombstones.
 * Scope `history` to the same authenticated viewer before calling.
 */
export function mergeInboxPreview<T extends Message>(history: T[], preview: T[], deletedIds: string[] = []): T[] {
  const deleted = new Set(deletedIds);
  const messages = new Map(history.filter(message => !deleted.has(message.id)).map(message => [message.id, message]));
  for (const message of preview) {
    if (!deleted.has(message.id)) messages.set(message.id, message);
  }
  return [...messages.values()].sort((a, b) => {
    const first = Date.parse(a.createdAt ?? '');
    const second = Date.parse(b.createdAt ?? '');
    if (Number.isFinite(first) && Number.isFinite(second) && first !== second) return first - second;
    return a.id.localeCompare(b.id, undefined, { numeric: true });
  });
}
