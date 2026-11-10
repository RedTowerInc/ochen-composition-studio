export class LatestJob {
  private epoch = 0;
  private abort?: AbortController;
  cancel() {
    this.epoch += 1;
    this.abort?.abort();
  }
  async run<T>(
    revision: number,
    getRevision: () => number,
    task: (signal: AbortSignal) => Promise<T>,
  ): Promise<T | undefined> {
    this.cancel();
    const epoch = this.epoch;
    const controller = new AbortController();
    this.abort = controller;
    try {
      const value = await task(controller.signal);
      if (
        controller.signal.aborted ||
        epoch !== this.epoch ||
        revision !== getRevision()
      )
        return undefined;
      return value;
    } catch (error) {
      if (controller.signal.aborted || epoch !== this.epoch) return undefined;
      throw error;
    }
  }
}

export function yieldToPaint(signal: AbortSignal, delay = 45): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Cancelled", "AbortError"));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, delay);
    signal.addEventListener("abort", abort, { once: true });
  });
}
