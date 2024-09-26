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
import { registerServiceWorker } from "@/web/client/offline/sw_helpers";

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
        Offline Mode Settings [Experimental]
      </summary>
      <OfflineSettingsCheckbox
        label="Offline Mode Enabled"
        settingKey="offlineModeEnabled"
      />
      <OfflineSettingsCheckbox
        label="Smith and Hall [Offline]"
        settingKey="shDownloaded"
      />
    </details>
  );
}

function OfflineSettingsCheckbox(props: {
  label: string;
  settingKey: keyof OfflineSettings;
}) {
  const setting = useOfflineSettings()?.[props.settingKey];
  const [progress, setProgress] = useState("-");
  return (
    <div>
      <div>
        <input
          id={props.label}
          type="checkbox"
          checked={setting === true}
          onChange={async (e) => {
            const checked = e.target.checked;
            setProgress("pending");
            if (props.settingKey === "offlineModeEnabled" && checked) {
              const status = await registerServiceWorker();
              if (status === -1) {
                setProgress("Browser doesn't support Service Workers :(");
              }
            }
            const updateProgress = (res: BaseResponse) => {
              if (res.progress !== undefined) {
                setProgress(`${res.progress}% complete`);
              } else if (res.complete) {
                const success = res.success === true;
                setProgress(`${success ? "Done!" : "Failed :("}`);
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
      <div className="text md light">Progress: {progress}</div>
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
