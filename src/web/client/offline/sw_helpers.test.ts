/**
 * @jest-environment jsdom
 */

import {
  hasPersistedStorage,
  registerServiceWorker,
  requestPersistedStorage,
} from "@/web/client/offline/sw_helpers";

// @ts-ignore
delete global.navigator;

console.debug = jest.fn();

describe("Service worker helper utilities", () => {
  test("hasPersistedStorage without support returns unsupported", async () => {
    global.navigator = undefined as any;
    await expect(hasPersistedStorage()).resolves.toBe(-1);
  });

  test("hasPersistedStorage if not granted returns 0", async () => {
    global.navigator = {
      storage: { persisted: () => Promise.resolve(false) },
    } as any;
    await expect(hasPersistedStorage()).resolves.toBe(0);
  });

  test("hasPersistedStorage if errors in checking returns 0", async () => {
    global.navigator = {
      storage: { persisted: () => Promise.reject("Error") },
    } as any;
    await expect(hasPersistedStorage()).resolves.toBe(0);
  });

  test("hasPersistedStorage if granted returns 1", async () => {
    global.navigator = {
      storage: { persisted: () => Promise.resolve(true) },
    } as any;
    await expect(hasPersistedStorage()).resolves.toBe(1);
  });

  test("requestPersistedStorage if unsupported returns -1", async () => {
    global.navigator = {
      storage: { persisted: () => Promise.resolve(false), persist: undefined },
    } as any;
    await expect(requestPersistedStorage()).resolves.toBe(-1);
  });

  test("requestPersistedStorage if already granted returns 1", async () => {
    global.navigator = {
      storage: { persisted: () => Promise.resolve(true) },
    } as any;
    await expect(requestPersistedStorage()).resolves.toBe(1);
  });

  test("requestPersistedStorage if persist succeeds returns 1", async () => {
    global.navigator = {
      storage: { persist: () => Promise.resolve(true) },
    } as any;
    await expect(requestPersistedStorage()).resolves.toBe(1);
  });

  test("requestPersistedStorage if persist fails returns 0", async () => {
    global.navigator = {
      storage: { persist: () => Promise.resolve(false) },
    } as any;
    await expect(requestPersistedStorage()).resolves.toBe(0);
  });

  test("requestPersistedStorage if persist errors returns 0", async () => {
    global.navigator = {
      storage: { persist: () => Promise.reject() },
    } as any;
    await expect(requestPersistedStorage()).resolves.toBe(0);
  });

  test("registerServiceWorker if unsupported returns -1", async () => {
    global.navigator = {} as any;
    await expect(registerServiceWorker()).resolves.toBe(-1);
  });

  test("registerServiceWorker if already exists returns 1", async () => {
    global.navigator = {
      serviceWorker: {
        getRegistration: () => Promise.resolve({}),
        ready: Promise.resolve(),
      },
    } as any;
    await expect(registerServiceWorker()).resolves.toBe(1);
  });

  test("registerServiceWorker if exists but fails to ready returns 0", async () => {
    global.navigator = {
      serviceWorker: {
        getRegistration: () => Promise.resolve({}),
        ready: Promise.reject(),
      },
    } as any;
    await expect(registerServiceWorker()).resolves.toBe(0);
  });

  test("registerServiceWorker if creation succeeds returns 1", async () => {
    global.navigator = {
      serviceWorker: {
        getRegistration: () => Promise.resolve(undefined),
        register: () => Promise.resolve({}),
        ready: Promise.resolve(),
      },
    } as any;
    await expect(registerServiceWorker()).resolves.toBe(1);
  });

  test("registerServiceWorker if creation succeeds but fails to ready returns 0", async () => {
    global.navigator = {
      serviceWorker: {
        getRegistration: () => Promise.resolve(undefined),
        register: () => Promise.resolve({}),
        ready: Promise.reject(),
      },
    } as any;
    await expect(registerServiceWorker()).resolves.toBe(0);
  });

  test("registerServiceWorker if checking previous fails but making succeeds returns 1", async () => {
    global.navigator = {
      serviceWorker: {
        getRegistration: () => Promise.reject("Error"),
        register: () => Promise.resolve({}),
        ready: Promise.resolve(),
      },
    } as any;
    await expect(registerServiceWorker()).resolves.toBe(1);
  });

  test("registerServiceWorker if creation fails return 0", async () => {
    global.navigator = {
      serviceWorker: {
        getRegistration: () => Promise.resolve(undefined),
        register: () => Promise.reject("Error"),
        ready: Promise.resolve(),
      },
    } as any;
    await expect(registerServiceWorker()).resolves.toBe(0);
  });
});
