/* istanbul ignore file */

// Ignoring from coverage for now since wakeLock isn't available
// by default and it's seemingly difficult to add in at test time.

import { useCallback, useEffect, useRef } from "react";

const EXTENSION_MS = 1000 * 60 * 10;

type Sentinel = Promise<WakeLockSentinel | null>;

export type WakeLockExtender = () => void;

async function requestTimedWakeLock(): Promise<WakeLockSentinel | null> {
  const wakeLockRequest = navigator?.wakeLock?.request();
  // Some browsers may not support wake lock.
  if (wakeLockRequest === undefined) {
    return null;
  }
  try {
    const sentinel = await wakeLockRequest;
    setTimeout(() => sentinel.release(), EXTENSION_MS);
    return sentinel;
  } catch (error) {
    return null;
  }
}

function releaseLocks(locks: Sentinel[]) {
  for (const lock of locks) {
    Promise.resolve(lock).then((sentinel) => sentinel?.release());
  }
}

export function useWakeLock(): WakeLockExtender {
  const wakeLocks = useRef<Sentinel[]>([]);

  const cleanup = useCallback(() => {
    releaseLocks(wakeLocks.current);
    wakeLocks.current = [];
  }, []);

  const requestLock = useCallback(() => {
    const lock = requestTimedWakeLock();
    releaseLocks(wakeLocks.current);
    wakeLocks.current = [lock];
  }, []);

  useEffect(() => {
    requestLock();
    // If the Morcus window is moved to the background and then back to the
    // foreground, we need to re-request the wake lock as if the user came to
    // the page anew.
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        requestLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      cleanup();
    };
  }, [cleanup, requestLock]);

  return requestLock;
}
