import { useMediaQuery } from "@/web/client/utils/media_query";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

export interface PwaManager {
  /** Whether we are current in a PWA. */
  isPwa: boolean;
  /** Whether the PWA is already installed. */
  alreadyInstalled?: boolean;
  /** Whether we can currently show the PWA install prompt. */
  canShowPrompt: boolean;
  /**
   * Attempts to show the PWA install prompt.
   *
   * Returns true if the prompt was shown, false otherwise.
   */
  tryToShowPrompt: () => Promise<boolean>;
}

const DEFAULT_VALUE: PwaManager = {
  isPwa: false,
  canShowPrompt: false,
  tryToShowPrompt: async () => false,
};

const ManagerContext: React.Context<PwaManager> = createContext(DEFAULT_VALUE);

type DeferredPromptEvent = Event & {
  prompt: () => Promise<unknown>;
};

async function isPwaInstalled(): Promise<boolean | undefined> {
  if (!("getInstalledRelatedApps" in navigator)) {
    return undefined;
  }
  try {
    const relatedApps: Record<string, string>[] =
      // @ts-expect-error
      await navigator.getInstalledRelatedApps();
    return relatedApps.some((app) => app.platform === "webapp");
  } catch {
    return undefined;
  }
}

export function PwaManagerProvider(props: React.PropsWithChildren) {
  const isPwa = useMediaQuery("(display-mode: standalone)");
  const [event, setEvent] = useState<DeferredPromptEvent | undefined>(
    undefined
  );
  const [alreadyInstalled, setAlreadyInstalled] = useState<boolean | undefined>(
    undefined
  );

  useEffect(() => {
    const listener = (e: Event) => {
      e.preventDefault();
      if ("prompt" in e && typeof e.prompt === "function") {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        setEvent(e as DeferredPromptEvent);
      }
    };
    window.addEventListener("beforeinstallprompt", listener);
    return () => window.removeEventListener("beforeinstallprompt", listener);
  }, []);

  useEffect(() => {
    if (isPwa) {
      return;
    }
    if (
      !("getInstalledRelatedApps" in navigator) ||
      typeof navigator.getInstalledRelatedApps !== "function"
    ) {
      return;
    }

    const setInstalled = () => isPwaInstalled().then(setAlreadyInstalled);
    setInstalled();
    const id = setInterval(setInstalled, 60000);
    return () => clearInterval(id);
  }, [isPwa]);

  const pwaPrompt: PwaManager = useMemo(
    () => ({
      isPwa,
      alreadyInstalled,
      canShowPrompt: event !== undefined,
      tryToShowPrompt: async () => {
        if (event === undefined) {
          return false;
        }
        let success = true;
        try {
          const checker = () => isPwaInstalled().then(setAlreadyInstalled);
          setTimeout(checker, 3000);
          setTimeout(checker, 6000);
          setTimeout(checker, 12000);
          await event.prompt();
        } catch {
          success = false;
        }
        setEvent((e) => (e === event ? undefined : e));
        return success;
      },
    }),
    [event, isPwa, alreadyInstalled]
  );

  return (
    <ManagerContext.Provider value={pwaPrompt}>
      {props.children}
    </ManagerContext.Provider>
  );
}

export function usePwaManager(): PwaManager {
  return useContext(ManagerContext);
}
