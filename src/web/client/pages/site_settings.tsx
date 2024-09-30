import { useContext, useState } from "react";
import {
  GlobalBooleans,
  GlobalSettingsContext,
} from "@/web/client/components/global_flags";
import { Container } from "@/web/client/components/generic/basics";
import type { OfflineSettings } from "@/web/client/offline/offline_settings_storage";
import { useOfflineSettings } from "@/web/client/offline/use_offline_settings";
import { sendToSw } from "@/web/client/offline/communication/app_comms";
import type { BaseResponse } from "@/web/client/offline/communication/comms_types";
import {
  registerServiceWorker,
  requestNotificationPermissions,
} from "@/web/client/offline/sw_helpers";

function GlobalSettingsCheckbox(props: {
  label: string;
  settingKey: keyof GlobalBooleans;
}) {
  const globalSettings = useContext(GlobalSettingsContext);
  const enabled = globalSettings.data[props.settingKey] === true;

  return (
    <div>
      <input
        id={props.label}
        type="checkbox"
        checked={enabled}
        onChange={(e) => {
          const newSettings = { ...globalSettings.data };
          newSettings[props.settingKey] = e.currentTarget.checked;
          globalSettings.setData(newSettings);
        }}
      />
      <label htmlFor={props.label} style={{ paddingLeft: 8 }}>
        {props.label}
      </label>
    </div>
  );
}

function OfflineSettings() {
  const globalSettings = useContext(GlobalSettingsContext);

  if (globalSettings.data.experimentalMode !== true) {
    return null;
  }

  return (
    <details open>
      <summary className="nonDictText text md" style={{ paddingTop: "8px" }}>
        Offline Mode Settings
      </summary>
      <div className="nonDictText text sm light">
        [Caution: experimental and may have bugs.]
      </div>
      <OfflineSettingsCheckbox
        label="Offline Mode Enabled"
        settingKey="offlineModeEnabled"
        salesPitch="use some features"
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
            const checked = e.target.checked;
            setProgress("In progress: please wait");
            await requestNotificationPermissions();
            const status = await registerServiceWorker();
            if (status === -1) {
              setProgress(
                "Error: your browser doesn't support Service Workers :("
              );
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
          className={"nonDictText text md"}
          htmlFor={props.label}
          style={{ paddingLeft: 8 }}>
          {props.label}
        </label>
      </div>
      <div className="nonDictText text sm light">
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
      </div>
    </div>
  );
}

export function SiteSettings() {
  return (
    <Container maxWidth="lg">
      <div style={{ padding: "24px" }}>
        <div className="nonDictText text md">
          <GlobalSettingsCheckbox
            label="Enable Experimental Features"
            settingKey="experimentalMode"
          />
        </div>
        <div className="nonDictText text lg">
          <OfflineSettings />
        </div>
      </div>
    </Container>
  );
}
