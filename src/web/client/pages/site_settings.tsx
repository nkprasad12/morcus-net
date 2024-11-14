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
  hasPersistedStorage,
  registerServiceWorker,
  requestNotificationPermissions,
  requestPersistedStorage,
} from "@/web/client/offline/sw_helpers";

const OFFLINE_STORAGE_MESSAGE =
  "You may see up to two permission requests." +
  " The first is for Notifications, and the second is for Persistent Storage.\n" +
  " It is recommended that you grant these permissions (otherwise, the system may deem" +
  " Morcus Latin Tools and its data to be unimportant and clear the data).";

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

// @ts-expect-error [Code works but is not ready to deploy]
function OfflineSettingsSection() {
  const globalSettings = useContext(GlobalSettingsContext);

  if (globalSettings.data.experimentalMode !== true) {
    return null;
  }

  return (
    <details open>
      <summary className="nonDictText text md" style={{ paddingTop: "8px" }}>
        Offline Mode [Experimental]
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
            const checked = e.target.checked;
            setProgress("In progress: please wait");
            const status = await registerServiceWorker();
            if (status === -1) {
              setProgress(
                "Error: your browser doesn't support Service Workers :("
              );
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

function DropDown(props: {
  label: string;
  id: string;
  options: string[];
  default?: string;
  onSelected: (value: string) => unknown;
}) {
  return (
    <>
      <label htmlFor={props.id}>{props.label} </label>
      <select
        name={props.id}
        id={props.id}
        onChange={(e) => props.onSelected(e.target.value)}
        defaultValue={props.default}>
        {props.options.map((o) => (
          <option value={o} key={o}>
            {o}
          </option>
        ))}
      </select>
    </>
  );
}

function FontPicker() {
  const globalSettings = useContext(GlobalSettingsContext);

  return (
    <DropDown
      label="Font"
      id="font-drop-down"
      options={["serif", "sans-serif"]}
      default={globalSettings.data.fontFamily}
      onSelected={(font) => globalSettings.mergeData({ fontFamily: font })}
    />
  );
}

function SettingsSection(props: React.PropsWithChildren<{ name: string }>) {
  return (
    <details>
      <summary className="nonDictText text sm">{props.name}</summary>
      <div className="text sm">{props.children}</div>
    </details>
  );
}

export function SiteSettings() {
  return (
    <Container maxWidth="lg">
      <div style={{ padding: "24px" }}>
        <SettingsSection name="Appearance">
          <FontPicker />
        </SettingsSection>
        <SettingsSection name="Experiments">
          <GlobalSettingsCheckbox
            label="Enable Experimental Features"
            settingKey="experimentalMode"
          />
        </SettingsSection>
      </div>
    </Container>
  );
}
