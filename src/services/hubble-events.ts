export type HubbleSdkEvent =
  | { kind: 'action'; name: 'app_ready' | 'close' | 'error'; properties: Record<string, unknown> }
  | { kind: 'analytics'; name: string; properties: Record<string, unknown> };

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

export function parseHubbleSdkEvent(value: unknown): HubbleSdkEvent | null {
  const data = record(value);
  if (!data) return null;
  const properties = record(data.properties) ?? {};
  if (data.type === 'action' && ['app_ready', 'close', 'error'].includes(String(data.action))) {
    return { kind: 'action', name: String(data.action) as 'app_ready' | 'close' | 'error', properties };
  }
  if (data.type === 'analytics' && typeof data.event === 'string' && data.event.trim()) {
    return { kind: 'analytics', name: data.event.trim(), properties };
  }
  return null;
}

export const isHubbleTerminalEvent = (event: HubbleSdkEvent) =>
  event.kind === 'analytics' && [
    'payment_success',
    'payment_fail',
    'voucher_generation_fail',
  ].includes(event.name);
