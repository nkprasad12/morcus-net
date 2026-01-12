import { useContext } from "react";
import { GlobalSettingsContext } from "@/web/client/components/global_flags";
import { Container } from "@/web/client/components/generic/basics";
import { lazyLoaded } from "@/web/client/routing/lazy_loading";

const OfflineSettingsSection = lazyLoaded("OfflineSettingsSection");

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
        <OfflineSettingsSection />
      </div>
    </Container>
  );
}
