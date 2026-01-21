import { useState, useEffect, useCallback } from "react";
import { usePwaManager } from "@/web/client/pwa/pwa_manager";
import {
  requestPersistedStorage,
  type StorageRequirement,
} from "@/web/client/offline_v2/app/persistent_storage";
import { registerServiceWorker } from "@/web/client/offline_v2/app/service_worker_utils";
import { useNotificationPermission } from "@/web/client/offline_v2/app/notifications";
import { SUPPORTED_BROWSERS } from "@/web/client/offline_v2/app/browsers";
import { exhaustiveGuard } from "@/common/misc_utils";

type HelpTextType = StorageRequirement | "Unsupported" | "Registration Failed";
const OFFLINE_DATA_BLURB =
  "ensure your offline data won't be automatically deleted by the system";
const CHROMIUM_PREAMBLE = [
  `In order to ${OFFLINE_DATA_BLURB}, we need persistent storage permissions.`,
  `This is granted automatically by the system`,
  `when installed as an app, when notifications are enabled, or after sufficient usage.`,
].join(" ");
const CHROMIUM_NO_LUCK =
  "If you just installed the app or enabled notifications, wait a few seconds and refresh the page. Otherwise, try again later.";

function UnsupportedBrowser() {
  return (
    <p>
      Your browser is missing some features that are required for Offline Mode
      to work correctly. Please use a supported browser (currently:{" "}
      {SUPPORTED_BROWSERS.join(", ")}) updated within the last 2.5 years.
    </p>
  );
}

function ShowInfoText(props: {
  helpText: HelpTextType;
  tryToEnable: () => Promise<unknown>;
}) {
  const pwaManager = usePwaManager();
  const [notificationStatus, requestNotifications] =
    useNotificationPermission();

  if (props.helpText === "Unsupported") {
    return <UnsupportedBrowser />;
  }

  if (props.helpText === "Registration Failed") {
    return (
      <p>
        The application failed to register for offline use. This may be due to
        browser settings, being in a Private / Incognito window, or in a
        WebView. If none of these apply, please report the issue.
      </p>
    );
  }

  if (props.helpText === "[FF] Not Granted") {
    return (
      <>
        <p>
          Persistent storage is required to {OFFLINE_DATA_BLURB}. Click the
          button below to trigger the request again.
        </p>
        <button className="button" onClick={props.tryToEnable}>
          Retry
        </button>
      </>
    );
  }

  if (props.helpText === "[iOS] Open From Home Screen") {
    return (
      <p>
        Please{" "}
        {pwaManager.alreadyInstalled === true
          ? "open the app"
          : "install the app and open"}{" "}
        from the home screen. This is required to {OFFLINE_DATA_BLURB}.
      </p>
    );
  }

  if (props.helpText === "[Chr] Needs More Signal") {
    const isPwa = pwaManager.isPwa;
    const pwaInstalled = pwaManager.alreadyInstalled === true;
    const notificationGranted = notificationStatus === "Granted";
    const showInstallButton =
      !isPwa && !pwaInstalled && pwaManager.canShowPrompt;

    const nextStep =
      isPwa && notificationGranted ? (
        CHROMIUM_NO_LUCK
      ) : !isPwa && pwaInstalled ? (
        "Try to open the app from the home screen and try from there."
      ) : (
        <>
          {showInstallButton && (
            <div>
              <button className="button" onClick={pwaManager.tryToShowPrompt}>
                Install
              </button>{" "}
              install as app
            </div>
          )}
          {notificationStatus !== "Unsupported" && (
            <div>
              <button className="button" onClick={requestNotifications}>
                Allow Notifications
              </button>{" "}
              enable notifications (we won&apos;t send notifications outside of
              this offline mode flow)
            </div>
          )}
        </>
      );

    return (
      <>
        <p>{CHROMIUM_PREAMBLE}</p>
        <p>{nextStep}</p>
      </>
    );
  }

  exhaustiveGuard(props.helpText);
}

export function InitialSetupUi() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [helpText, setHelpText] = useState<HelpTextType | null>(null);

  useEffect(() => {
    navigator.serviceWorker
      ?.getRegistration()
      .then((reg) => setIsEnabled(reg !== undefined && reg.active !== null));
  }, []);

  const tryToEnable = useCallback(async () => {
    const status = await requestPersistedStorage();
    if (status === "Granted") {
      await register();
    } else {
      setHelpText(status);
    }
  }, []);

  const handleToggle = async () => {
    if (isEnabled) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      setIsEnabled(false);
      return;
    }
    await tryToEnable();
  };

  const register = async () => {
    try {
      const status = await registerServiceWorker();
      if (status === -1) {
        setHelpText("Unsupported");
        setIsEnabled(false);
      } else if (status === 0) {
        setHelpText("Registration Failed");
        setIsEnabled(false);
      } else {
        setIsEnabled(true);
        setHelpText(null);
      }
    } catch (e) {
      setHelpText("Registration Failed");
      setIsEnabled(false);
    }
  };

  if (!("serviceWorker" in navigator)) {
    return (
      <div>
        <UnsupportedBrowser />
      </div>
    );
  }

  return (
    <div>
      <input
        type="checkbox"
        id="off-mode"
        checked={isEnabled}
        onChange={handleToggle}
      />
      <label htmlFor="off-mode"> Offline Features</label>
      {helpText !== null && (
        <div
          style={{
            padding: "12px",
            border: "1px solid #ccc",
            marginTop: "8px",
          }}>
          <ShowInfoText helpText={helpText} tryToEnable={tryToEnable} />
        </div>
      )}
    </div>
  );
}
