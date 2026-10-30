const DEFAULT_WINDOW_MS = 1000;

/** Mede eventos por segundo (ex.: UPS) em janelas consecutivas, sem alocar por evento. */
export class RateMeter {
  private windowStartMs: number | null = null;
  private count = 0;
  private lastRate = 0;

  constructor(private readonly windowMs = DEFAULT_WINDOW_MS) {}

  get perSecond(): number {
    return this.lastRate;
  }

  record(events: number, nowMs: number): void {
    if (this.windowStartMs === null) this.windowStartMs = nowMs;
    this.count += events;
    const elapsed = nowMs - this.windowStartMs;
    if (elapsed < this.windowMs) return;
    this.lastRate = (this.count * 1000) / elapsed;
    this.count = 0;
    this.windowStartMs = nowMs;
  }
}
