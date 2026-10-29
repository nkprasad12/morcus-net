/** A value created on first use, or when its {@link Warmup} reaches it. */
export interface Lazy<T> {
  get(): T;
}

/**
 * Defers expensive startup work (opening databases, building tables) until
 * after the server is listening, while still letting an early request create
 * whatever it needs on demand.
 *
 * Tasks run in registration order, one per event loop turn, so requests that
 * arrive during warm-up are served between tasks rather than after all of
 * them.
 */
export class Warmup {
  private readonly tasks: Array<() => void> = [];
  private stopped = false;

  constructor(
    private readonly log: (message: string) => void = console.debug
  ) {}

  /**
   * Returns a singleton created by `create` on its first `get()` (or when
   * warm-up reaches it), logging how long creation took under `name`.
   *
   * Unlike `singletonOf`, an `undefined` result is cached too, so an optional
   * resource that is absent isn't looked for again on every call.
   */
  lazy<T>(name: string, create: () => T): Lazy<T> {
    let created = false;
    let value: T;
    const get = () => {
      if (!created) {
        const start = performance.now();
        value = create();
        created = true;
        this.log(`${name} init: ${(performance.now() - start).toFixed(2)} ms`);
      }
      return value;
    };
    this.tasks.push(get);
    return { get };
  }

  /**
   * Adds a task that manages its own caching. With a `name`, logs how long it
   * took; without one, the task is expected to log its own timing (if any).
   */
  add(task: () => void, name?: string): void {
    if (name === undefined) {
      this.tasks.push(task);
      return;
    }
    this.tasks.push(() => {
      const start = performance.now();
      task();
      this.log(`${name}: ${(performance.now() - start).toFixed(2)} ms`);
    });
  }

  /** Runs every registered task in order, one per `setImmediate` turn. */
  start(): void {
    const runFrom = (index: number) => {
      if (this.stopped || index >= this.tasks.length) {
        return;
      }
      setImmediate(() => {
        if (this.stopped) {
          return;
        }
        this.tasks[index]();
        runFrom(index + 1);
      });
    };
    runFrom(0);
  }

  /** Skips any tasks that haven't run yet. */
  stop(): void {
    this.stopped = true;
  }
}
