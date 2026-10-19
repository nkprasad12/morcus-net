/**
 * Records named events as milliseconds since construction, for the `extras`
 * of an `ApiCalls` telemetry row.
 *
 * A repeated event name gets a numeric suffix (`foo`, `foo_2`, `foo_3`, ...)
 * so no measurement is overwritten.
 */
export class Timer {
  private readonly start: number;
  private readonly events: [string, number][];
  private readonly names: Map<string, number>;

  constructor() {
    this.start = performance.now();
    this.events = [];
    this.names = new Map();
  }

  event(event: string): number {
    const currentTime = performance.now();
    const elapsed = Math.round(100 * (currentTime - this.start)) / 100;
    const i = this.names.get(event);
    let suffix = "";
    if (i === undefined) {
      this.names.set(event, 2);
    } else {
      this.names.set(event, i + 1);
      suffix = `_${i}`;
    }
    this.events.push([event + suffix, elapsed]);
    return elapsed;
  }

  getEvents(): { [key: string]: number } {
    const result: { [key: string]: number } = {};
    this.events.forEach(([eventName, time]) => (result[eventName] = time));
    return result;
  }
}
