/**
 * Screen Wake Lock controller.
 *
 * Keeps the display awake while the user is actively engaged with the host
 * (e.g. reading a passage), and lets it sleep normally once they go idle or
 * leave.
 *
 * Model: hold at most one `WakeLockSentinel`, and release it after `idleMs`
 * without user activity. Activity (scrolling anywhere in the document —
 * including inner scroll containers — pointer presses, key presses, returning
 * to the tab, or an explicit {@link WakeLockController.extend} call) only
 * bumps a timestamp; it never issues a fresh `request()` while a lock is held.
 *
 * Lifecycle guarantees:
 * - Disconnecting the host releases the lock and removes every listener.
 * - A `request()` that resolves after disconnect is released immediately.
 * - Browser-initiated releases (tab hidden, low battery) are observed via the
 *   sentinel's `release` event, and the next activity re-acquires.
 * - Unsupported browsers / insecure contexts / rejected requests are silent
 *   no-ops.
 *
 * Zero-JS: pure enhancement; without JS the platform's normal screen timeout
 * applies.
 */

import { BaseController } from "@/web/v2/core/base_element.client";

/** Release the lock after this long without user activity. */
export const WAKE_LOCK_IDLE_MS = 5 * 60 * 1000;

/** The subset of the Screen Wake Lock API this controller depends on. */
export type WakeLockProvider = Pick<WakeLock, "request">;

export interface WakeLockOptions {
  /** Host element whose connection lifetime bounds the lock. */
  root: ParentNode;
  /** Idle window before release. Defaults to {@link WAKE_LOCK_IDLE_MS}. */
  idleMs?: number;
  /**
   * Wake lock implementation. Defaults to `navigator.wakeLock`; pass `null`
   * to simulate an unsupported browser, or a fake in tests.
   */
  wakeLock?: WakeLockProvider | null;
}

/**
 * Document-level events that count as "the user is still here". `scroll` is
 * registered in the capture phase so that scrolls of inner containers (which
 * do not bubble) are observed too.
 */
const ACTIVITY_EVENTS = ["scroll", "pointerdown", "keydown"] as const;

function defaultProvider(): WakeLockProvider | null {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
    return null;
  }
  return navigator.wakeLock;
}

export class WakeLockController extends BaseController {
  private readonly idleMs: number;
  private readonly provider: () => WakeLockProvider | null;
  private sentinel: WakeLockSentinel | null = null;
  /** Lifetime signal of the scope that owns the in-flight request, if any. */
  private pendingFor: AbortSignal | null = null;
  private lastActivity = 0;
  private idleTimer = 0;

  constructor(options: WakeLockOptions) {
    super(options.root);
    this.idleMs = options.idleMs ?? WAKE_LOCK_IDLE_MS;
    const injected = options.wakeLock;
    this.provider =
      injected === undefined ? defaultProvider : () => injected ?? null;
  }

  /** Whether a wake lock is currently held. */
  public get isHeld(): boolean {
    return this.sentinel !== null && !this.sentinel.released;
  }

  /**
   * Records user activity: acquires the lock if it is not held, and pushes
   * the idle deadline out by `idleMs`. Cheap enough to call on every event.
   */
  public extend(): void {
    if (!this.isConnected) return;
    this.lastActivity = Date.now();
    if (this.isHeld) {
      this.armIdleTimer(this.idleMs);
      return;
    }
    if (this.pendingFor === this.scope.signal) return;
    void this.acquire();
  }

  protected override onConnect(): void {
    const doc = this.ownerDocument;
    const onActivity = () => this.extend();
    for (const type of ACTIVITY_EVENTS) {
      this.scope.listen(doc, type, onActivity, {
        capture: true,
        passive: true,
      });
    }
    this.scope.listen(doc, "visibilitychange", () => {
      if (doc.visibilityState === "visible") this.extend();
    });
    this.scope.use(() => {
      // The scope clears its own timers; just forget the stale id.
      this.idleTimer = 0;
      this.release();
    });
    this.extend();
  }

  private async acquire(): Promise<void> {
    if (this.ownerDocument.visibilityState !== "visible") return;
    const provider = this.provider();
    if (!provider) return;

    const signal = this.scope.signal;
    this.pendingFor = signal;
    let sentinel: WakeLockSentinel;
    try {
      sentinel = await provider.request("screen");
    } catch {
      // NotAllowedError (hidden document, battery saver, permissions policy)
      // and friends. Retry happens naturally on the next activity.
      return;
    } finally {
      if (this.pendingFor === signal) this.pendingFor = null;
    }

    if (signal.aborted || this.isHeld) {
      // Host disconnected mid-request (or a newer request won): don't leak.
      releaseQuietly(sentinel);
      return;
    }
    this.sentinel = sentinel;
    sentinel.addEventListener(
      "release",
      () => {
        if (this.sentinel === sentinel) this.sentinel = null;
      },
      { once: true }
    );
    this.checkIdle();
  }

  private armIdleTimer(delayMs: number): void {
    if (this.idleTimer !== 0) return;
    this.idleTimer = this.scope.timeout(() => {
      this.idleTimer = 0;
      this.checkIdle();
    }, delayMs);
  }

  /** Releases if the idle deadline has passed; otherwise re-arms for the remainder. */
  private checkIdle(): void {
    const remaining = this.lastActivity + this.idleMs - Date.now();
    if (remaining > 0) {
      this.armIdleTimer(remaining);
    } else {
      this.release();
    }
  }

  private release(): void {
    const sentinel = this.sentinel;
    this.sentinel = null;
    if (sentinel) releaseQuietly(sentinel);
  }
}

function releaseQuietly(sentinel: WakeLockSentinel): void {
  if (sentinel.released) return;
  void sentinel.release().catch(() => undefined);
}
