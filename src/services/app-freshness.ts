import { AppState, Platform } from "react-native";

const FOREGROUND_DEBOUNCE_MS = 1_200;

export function subscribeToAppForeground(callback: () => void | Promise<void>) {
  let lastRunAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let previousState = AppState.currentState;

  const run = () => {
    const wait = Math.max(0, FOREGROUND_DEBOUNCE_MS - (Date.now() - lastRunAt));
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      lastRunAt = Date.now();
      void callback();
    }, wait);
  };

  if (Platform.OS === "web" && typeof window !== "undefined") {
    const onVisibility = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") run();
    };
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }

  const subscription = AppState.addEventListener("change", (nextState) => {
    if (previousState !== "active" && nextState === "active") run();
    previousState = nextState;
  });
  return () => {
    if (timer) clearTimeout(timer);
    subscription.remove();
  };
}
