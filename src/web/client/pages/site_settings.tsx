import { useContext } from "react";
import {
  GlobalBooleans,
  GlobalSettingsContext,
} from "@/web/client/components/global_flags";
import { CheckBox, Container } from "@/web/client/components/generic/basics";

function GlobalSettingsCheckbox(props: {
  label: string;
  settingKey: keyof GlobalBooleans;
}) {
  const globalSettings = useContext(GlobalSettingsContext);
  const enabled = globalSettings.data[props.settingKey] === true;

  return (
    <CheckBox
      label={props.label}
      enabled={enabled}
      onNewValue={(newValue) => {
        const newSettings = { ...globalSettings.data };
        newSettings[props.settingKey] = newValue;
        globalSettings.setData(newSettings);
      }}
    />
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
        onChange={(e) => props.onSelected(e.currentTarget.value)}
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
        {/* <OfflineSettingsSection /> */}
      </div>
    </Container>
  );
}
