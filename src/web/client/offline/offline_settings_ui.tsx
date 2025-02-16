import type { OfflineSettings } from "@/web/client/offline/offline_settings_storage";
import { useOfflineSettings } from "@/web/client/offline/use_offline_settings";
import { sendToSw } from "@/web/client/offline/communication/app_comms";
import type { BaseResponse } from "@/web/client/offline/communication/comms_types";
import {
  hasPersistedStorage,
  registerServiceWorker,
  requestNotificationPermissions,
  requestPersistedStorage,
} from "@/web/client/offline/sw_helpers";
import { useContext, useState } from "react";
import { GlobalSettingsContext } from "@/web/client/components/global_flags";

const OFFLINE_STORAGE_MESSAGE =
  "You may see up to two permission requests." +
  " The first is for Notifications, and the second is for Persistent Storage.\n" +
  " It is recommended that you grant these permissions (otherwise, the system may deem" +
  " Morcus Latin Tools and its data to be unimportant and clear the data).";

export function OfflineSettingsSection() {
  const globalSettings = useContext(GlobalSettingsContext);

  if (globalSettings.data.experimentalMode !== true) {
    return null;
  }

  return (
    <details open>
      <summary className="nonDictText text sm" style={{ paddingTop: "8px" }}>
        Offline Mode [Very Experimental]
      </summary>
      <OfflineSettingsCheckbox
        label="Offline Mode Enabled"
        settingKey="offlineModeEnabled"
        salesPitch="use some features"
        offDetails={OFFLINE_STORAGE_MESSAGE}
      />
      <OfflineSettingsCheckbox
        label="Smith and Hall"
        settingKey="shDownloaded"
        salesPitch="use S&H"
        downloadSizeMb={10}
      />
      <OfflineSettingsCheckbox
        label="Lewis and Short"
        settingKey="lsDownloaded"
        downloadSizeMb={30}
        salesPitch="use L&S"
      />
      <OfflineSettingsCheckbox
        label="Latin Inflections"
        settingKey="morceusDownloaded"
        downloadSizeMb={1}
        salesPitch="search inflected Latin words"
      />
    </details>
  );
}

function OfflineSettingsCheckbox(props: {
  label: string;
  settingKey: keyof OfflineSettings;
  salesPitch: string;
  downloadSizeMb?: number;
  offDetails?: string;
}) {
  const [disabled, setDisabled] = useState(false);
  const [progress, setProgress] = useState<string | undefined>(undefined);
  const allSettings = useOfflineSettings();
  const setting = allSettings?.[props.settingKey];

  const settingOn = setting === true;
  const showDownloadInfo = !settingOn && props.downloadSizeMb !== undefined;

  if (
    props.settingKey !== "offlineModeEnabled" &&
    !allSettings?.offlineModeEnabled
  ) {
    return null;
  }

  return (
    <div>
      <div>
        <input
          id={props.label}
          type="checkbox"
          checked={setting === true}
          disabled={disabled}
          onChange={async (e) => {
            const checked = e.currentTarget.checked;
            setProgress("In progress: please wait");
            const status = await registerServiceWorker();
            if (status === -1) {
              setProgress(
                "Error: your browser doesn't support Service Workers."
              );
              return;
            }
            if (status === 0) {
              setProgress("Error: Service Worker registration failed.");
              return;
            }
            if (props.settingKey === "offlineModeEnabled" && checked) {
              await requestNotificationPermissions();
              console.log(await hasPersistedStorage());
              await requestPersistedStorage();
            }
            setDisabled(true);
            const updateProgress = (res: BaseResponse) => {
              if (res.progress !== undefined) {
                setProgress(`In progress: ${res.progress}% complete`);
              } else if (res.complete) {
                const success = res.success === true;
                setProgress(success ? undefined : "An error occurred.");
                setDisabled(false);
              }
            };
            sendToSw(
              {
                channel: "OfflineSettingToggled",
                data: { settingKey: props.settingKey, desiredValue: checked },
              },
              (res) => updateProgress(res.data)
            );
          }}
        />
        <label
          className={"nonDictText text sm"}
          htmlFor={props.label}
          style={{ paddingLeft: 8 }}>
          {props.label}
        </label>
      </div>
      <div className="nonDictText text xs light">
        <div>
          {settingOn ? "You can" : "Check to"} {props.salesPitch} offline.
        </div>
        {progress ? (
          <div>{progress}</div>
        ) : (
          showDownloadInfo && (
            <div>Download Size: {props.downloadSizeMb} MB.</div>
          )
        )}
        {!settingOn && props.offDetails !== undefined && (
          <div>{props.offDetails}</div>
        )}
      </div>
    </div>
  );
}
