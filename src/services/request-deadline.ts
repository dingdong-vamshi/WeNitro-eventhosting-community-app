/** Bound a UI operation, aborting compatible network requests on timeout/cleanup. */
export function withRequestDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  message: string,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  let cancel: () => void;
  const deadline = new Promise<T>((_, reject) => {
    const stop = (error: Error) => { controller.abort(); reject(error); };
    cancel = () => stop(new Error("Request cancelled."));
    timer = setTimeout(() => stop(new Error(message)), timeoutMs);
    if (parentSignal?.aborted) cancel();
    else parentSignal?.addEventListener("abort", cancel, { once: true });
  });
  const task = Promise.resolve().then(() => {
    if (controller.signal.aborted) throw new Error("Request cancelled.");
    return operation(controller.signal);
  });
  return Promise.race([task, deadline]).finally(() => {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", cancel);
  });
}
