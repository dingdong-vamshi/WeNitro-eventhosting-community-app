import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { Button, Sheet, usePalette } from './ui';

type Confirmation = { title: string; message: string; action?: string; cancel?: string };
type PendingConfirmation = Confirmation & { id: number; scope: string };

/** No action is accepted on dismissal, replacement, navigation, or account change. */
export function createConfirmationController(notify: (value: PendingConfirmation | null) => void, getScope: () => string) {
  let sequence = 0;
  let pending: { value: PendingConfirmation; resolve: (accepted: boolean) => void } | null = null;
  const respond = (id: number, accepted: boolean) => {
    if (!pending || pending.value.id !== id) return;
    const current = pending;
    pending = null;
    notify(null);
    current.resolve(accepted && current.value.scope === getScope());
  };
  return {
    request: (value: Confirmation): Promise<boolean> => {
      if (pending) return Promise.resolve(false);
      return new Promise(resolve => {
        const next = { ...value, id: ++sequence, scope: getScope() };
        pending = { value: next, resolve };
        notify(next);
      });
    },
    respond,
    cancel: () => { if (pending) respond(pending.value.id, false); },
  };
}

const ConfirmationContext = createContext<(value: Confirmation) => Promise<boolean>>(async () => false);
export const useActionConfirmation = () => useContext(ConfirmationContext);

export function ActionConfirmationProvider({ scope, children }: { scope: string; children: React.ReactNode }) {
  const c = usePalette();
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const controller = useRef<ReturnType<typeof createConfirmationController> | null>(null);
  if (!controller.current) controller.current = createConfirmationController(setPending, () => currentScope.current);
  const actions = controller.current;
  useEffect(() => () => actions.cancel(), [scope, actions]);
  return <ConfirmationContext.Provider value={actions.request}>
    {children}
    {pending && pending.scope === scope ? <Sheet centered title={pending.title} close={() => actions.respond(pending.id, false)}>
      <Text style={{ color: c.muted, fontSize: 14, lineHeight: 21 }}>{pending.message}</Text>
      <Button label={pending.action || 'Delete'} danger onPress={() => actions.respond(pending.id, true)} />
      <Button label={pending.cancel || 'Cancel'} variant="outline" onPress={() => actions.respond(pending.id, false)} />
    </Sheet> : null}
  </ConfirmationContext.Provider>;
}
