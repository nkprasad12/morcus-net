/**
 * @jest-environment jsdom
 */

import {
  WAKE_LOCK_IDLE_MS,
  WakeLockController,
  type WakeLockProvider,
} from "@/web/v2/core/wake_lock.client";

class FakeSentinel extends EventTarget {
  public released = false;
  public readonly type = "screen";
  public onrelease: ((this: WakeLockSentinel, ev: Event) => unknown) | null =
    null;

  public release(): Promise<void> {
    if (!this.released) {
      this.released = true;
      this.dispatchEvent(new Event("release"));
    }
    return Promise.resolve();
  }
}

interface Deferred {
  resolve: (s: FakeSentinel) => void;
  reject: (e: unknown) => void;
}

class FakeWakeLock implements WakeLockProvider {
  public readonly sentinels: FakeSentinel[] = [];
  public readonly pending: Deferred[] = [];
  /** When false, requests stay pending until resolved manually. */
  public autoResolve = true;
  public rejectWith: unknown = null;
  public readonly types: Array<WakeLockType | undefined> = [];

  public request(type?: WakeLockType): Promise<WakeLockSentinel> {
    this.types.push(type);
    if (this.rejectWith !== null) {
      return Promise.reject(this.rejectWith);
    }
    return new Promise<FakeSentinel>((resolve, reject) => {
      const deferred: Deferred = {
        resolve: (s) => {
          this.sentinels.push(s);
          resolve(s);
        },
        reject,
      };
      if (this.autoResolve) {
        deferred.resolve(new FakeSentinel());
      } else {
        this.pending.push(deferred);
      }
    }) as unknown as Promise<WakeLockSentinel>;
  }

  public get requestCount(): number {
    return this.sentinels.length + this.pending.length;
  }

  public get held(): FakeSentinel[] {
    return this.sentinels.filter((s) => !s.released);
  }
}

async function flush() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

describe("WakeLockController", () => {
  let visibility: DocumentVisibilityState;
  let fake: FakeWakeLock;
  let host: HTMLElement;
  let controller: WakeLockController;

  function setVisibility(state: DocumentVisibilityState) {
    visibility = state;
    document.dispatchEvent(new Event("visibilitychange"));
  }

  function create(wakeLock: WakeLockProvider | null = fake) {
    controller = new WakeLockController({ root: host, wakeLock });
    return controller;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    visibility = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
    document.body.innerHTML = `<div id="host"><div id="inner"></div></div>`;
    host = document.getElementById("host")!;
    fake = new FakeWakeLock();
  });

  afterEach(() => {
    controller?.dispose();
    jest.useRealTimers();
  });

  test("acquires a screen lock on connect", async () => {
    create().connect();
    await flush();
    expect(fake.held).toHaveLength(1);
    expect(fake.types).toEqual(["screen"]);
    expect(controller.isHeld).toBe(true);
  });

  test("activity while held does not issue new requests", async () => {
    create().connect();
    await flush();
    for (let i = 0; i < 20; i++) {
      document.dispatchEvent(new Event("scroll"));
      document.dispatchEvent(new Event("pointerdown"));
      document.dispatchEvent(new Event("keydown"));
      controller.extend();
    }
    await flush();
    expect(fake.requestCount).toBe(1);
  });

  test("concurrent extends while a request is in flight dedupe", async () => {
    fake.autoResolve = false;
    create().connect();
    controller.extend();
    controller.extend();
    expect(fake.requestCount).toBe(1);
    fake.pending[0].resolve(new FakeSentinel());
    await flush();
    expect(controller.isHeld).toBe(true);
  });

  test("releases after the idle window with no activity", async () => {
    create().connect();
    await flush();
    jest.advanceTimersByTime(WAKE_LOCK_IDLE_MS - 1);
    expect(controller.isHeld).toBe(true);
    jest.advanceTimersByTime(1);
    expect(controller.isHeld).toBe(false);
    expect(fake.held).toHaveLength(0);
  });

  test.each(["scroll", "pointerdown", "keydown"])(
    "%s pushes the idle deadline out",
    async (type) => {
      create().connect();
      await flush();
      jest.advanceTimersByTime(WAKE_LOCK_IDLE_MS - 1000);
      document.dispatchEvent(new Event(type));
      jest.advanceTimersByTime(WAKE_LOCK_IDLE_MS - 1);
      expect(controller.isHeld).toBe(true);
      jest.advanceTimersByTime(1);
      expect(controller.isHeld).toBe(false);
    }
  );

  test("scrolling an inner container (non-bubbling) counts as activity", async () => {
    create().connect();
    await flush();
    jest.advanceTimersByTime(WAKE_LOCK_IDLE_MS - 1000);
    // Element scroll events do not bubble; the capture listener must see it.
    document
      .getElementById("inner")!
      .dispatchEvent(new Event("scroll", { bubbles: false }));
    jest.advanceTimersByTime(2000);
    expect(controller.isHeld).toBe(true);
  });

  test("activity after an idle release re-acquires", async () => {
    create().connect();
    await flush();
    jest.advanceTimersByTime(WAKE_LOCK_IDLE_MS);
    expect(controller.isHeld).toBe(false);
    document.dispatchEvent(new Event("pointerdown"));
    await flush();
    expect(controller.isHeld).toBe(true);
    expect(fake.requestCount).toBe(2);
  });

  test("browser-initiated release is observed and re-acquired on return", async () => {
    create().connect();
    await flush();
    // Browsers drop screen locks when the page is hidden.
    visibility = "hidden";
    await fake.sentinels[0].release();
    expect(controller.isHeld).toBe(false);

    // Activity while hidden must not request (it would reject anyway).
    document.dispatchEvent(new Event("keydown"));
    await flush();
    expect(fake.requestCount).toBe(1);

    setVisibility("visible");
    await flush();
    expect(controller.isHeld).toBe(true);
    expect(fake.requestCount).toBe(2);
  });

  test("disconnect releases the lock and removes listeners", async () => {
    create().connect();
    await flush();
    controller.dispose();
    expect(fake.held).toHaveLength(0);
    expect(controller.isHeld).toBe(false);

    document.dispatchEvent(new Event("pointerdown"));
    setVisibility("visible");
    controller.extend();
    await flush();
    expect(fake.requestCount).toBe(1);
  });

  test("reconnect acquires again", async () => {
    create().connect();
    await flush();
    controller.dispose();
    controller.connect();
    await flush();
    expect(controller.isHeld).toBe(true);
    expect(fake.held).toHaveLength(1);
  });

  test("a request resolving after disconnect is released immediately", async () => {
    fake.autoResolve = false;
    create().connect();
    controller.dispose();
    const late = new FakeSentinel();
    fake.pending[0].resolve(late);
    await flush();
    expect(late.released).toBe(true);
    expect(controller.isHeld).toBe(false);
  });

  test("a stale request from a previous connection does not block the new one", async () => {
    fake.autoResolve = false;
    create().connect();
    controller.dispose();
    controller.connect();
    expect(fake.requestCount).toBe(2);

    const stale = new FakeSentinel();
    const fresh = new FakeSentinel();
    fake.pending[0].resolve(stale);
    fake.pending[1].resolve(fresh);
    await flush();
    expect(stale.released).toBe(true);
    expect(fresh.released).toBe(false);
    expect(controller.isHeld).toBe(true);
  });

  test("unsupported browsers are a silent no-op", async () => {
    create(null).connect();
    document.dispatchEvent(new Event("scroll"));
    await flush();
    expect(controller.isHeld).toBe(false);
    jest.advanceTimersByTime(WAKE_LOCK_IDLE_MS * 2);
  });

  test("rejected requests are swallowed and retried on next activity", async () => {
    fake.rejectWith = new DOMException("nope", "NotAllowedError");
    create().connect();
    await flush();
    expect(controller.isHeld).toBe(false);

    fake.rejectWith = null;
    document.dispatchEvent(new Event("pointerdown"));
    await flush();
    expect(controller.isHeld).toBe(true);
  });
});
