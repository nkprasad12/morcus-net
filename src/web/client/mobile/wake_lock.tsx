/* istanbul ignore file */

// Ignoring from coverage for now since wakeLock isn't available
// by default and it's seemingly difficult to add in at test time.

import { useCallback, useEffect, useRef } from "react";

const POLL_INTERVAL = 1000 * 60 * 10;

type Sentinel = WakeLockSentinel | Promise<WakeLockSentinel> | null;

function startWatchdog(
  sentinelRef: React.MutableRefObject<Sentinel>,
  lastActionTime: React.MutableRefObject<number>,
  watchdogActive: React.MutableRefObject<boolean>
) {
  watchdogActive.current = true;
  setTimeout(() => {
    watchdogActive.current = false;
    if (sentinelRef.current === null) {
      return;
    }
    const expirationTime = lastActionTime.current + POLL_INTERVAL;
    if (Date.now() < expirationTime) {
      startWatchdog(sentinelRef, lastActionTime, watchdogActive);
      return;
    }
    Promise.resolve(sentinelRef.current).then((sentinel) => sentinel.release());
    sentinelRef.current = null;
  }, POLL_INTERVAL);
}

function initialize(
  sentinelRef: React.MutableRefObject<Sentinel>,
  lastActionTime: React.MutableRefObject<number>,
  watchdogActive: React.MutableRefObject<boolean>
) {
  const sentinelPromise = navigator?.wakeLock?.request();
  // Some browsers may not support wake lock.
  if (sentinelPromise === undefined) {
    return;
  }
  sentinelRef.current = sentinelPromise;
  sentinelPromise
    .then((sentinel) => {
      sentinelRef.current = sentinel;
      if (!watchdogActive.current) {
        startWatchdog(sentinelRef, lastActionTime, watchdogActive);
      }
    })
    .catch(() => {
      sentinelRef.current = null;
    });
}

export type WakeLockExtender = () => void;

export function useWakeLock(): WakeLockExtender {
  const wakeLock = useRef<Sentinel>(null);
  const lastActionTime = useRef<number>(Date.now());
  const watchdogActive = useRef<boolean>(false);

  useEffect(() => {
    initialize(wakeLock, lastActionTime, watchdogActive);
    return () => {
      if (wakeLock.current === null) {
        return;
      }
      Promise.resolve(wakeLock.current).then((lock) => lock.release());
      wakeLock.current = null;
    };
  }, []);

  return useCallback(() => {
    lastActionTime.current = Date.now();
    if (!watchdogActive.current && wakeLock.current !== null) {
      // We have the wake lock, but the watchdog has gone to sleep.
      startWatchdog(wakeLock, lastActionTime, watchdogActive);
    } else if (wakeLock.current !== null) {
      // If we don't have the wake lock, then re-initialize. This
      // will only start the watchdog if needed.
      initialize(wakeLock, lastActionTime, watchdogActive);
    }
  }, []);
}
