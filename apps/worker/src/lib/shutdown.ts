export type ShutdownCloser = () => Promise<void> | void;

export interface ShutdownOptions {
  log?: (...args: unknown[]) => void;
  exit?: (code: number) => void;
}

/**
 * Ensures a process only shuts down once even if multiple signals arrive in quick succession,
 * and keeps the close order deterministic for all worker resources.
 */
export function createGracefulShutdown(
  closers: ShutdownCloser[],
  exit: (code: number) => void = (code) => process.exit(code),
  options: ShutdownOptions = {}
): (signal: NodeJS.Signals | string) => Promise<void> {
  let closed = false;
  const log = options.log ?? console.log;

  return async (signal: NodeJS.Signals | string) => {
    if (closed) return;
    closed = true;

    log(`[worker] graceful shutdown triggered by ${signal}`);

    const results = await Promise.allSettled(closers.map((close) => close()));
    const failures = results.filter((result) => result.status === "rejected");

    if (failures.length > 0) {
      log(`[worker] shutdown completed with ${failures.length} close failures`);
    }

    exit(0);
  };
}
