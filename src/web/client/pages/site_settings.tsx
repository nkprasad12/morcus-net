import { useContext } from "react";
import { GlobalSettingsContext } from "@/web/client/components/global_flags";
import { Container } from "@/web/client/components/generic/basics";
import { usePwaManager } from "@/web/client/pwa/pwa_manager";
import { lazyLoaded } from "@/web/client/routing/lazy_loading";

const CDC_GUIDE = "https://www.cdc.gov/niosh/mining/tools/installpwa.html";
const WEB_DEV_GUIDE = "https://web.dev/learn/pwa/installation";

const OfflineControlUi = lazyLoaded("OfflineControlUi");

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

function PwaSection() {
  const pwaManager = usePwaManager();

  if (pwaManager.isPwa) {
    return <div>You are running the installed app ✓</div>;
  }
  if (pwaManager.alreadyInstalled) {
    return (
      <div>
        The app is installed (but you are currently using the web version).
      </div>
    );
  }
  const notInstalled = pwaManager.alreadyInstalled === false;
  if (!pwaManager.canShowPrompt) {
    return (
      <div>
        {!notInstalled && <span>The app may not be installed. </span>}
        <span>
          Please follow the{" "}
          <a href={WEB_DEV_GUIDE} target="_blank" rel="noopener noreferrer">
            instructions
          </a>{" "}
          (alternate{" "}
          <a href={CDC_GUIDE} target="_blank" rel="noopener noreferrer">
            guide
          </a>
          ) to install Morcus as an app on your device .
        </span>
      </div>
    );
  }

  return (
    <button className="button" onClick={pwaManager.tryToShowPrompt}>
      Install Morcus
    </button>
  );
}

export function SiteSettings() {
  return (
    <Container maxWidth="lg">
      <div style={{ padding: "24px" }}>
        <SettingsSection name="Appearance">
          <FontPicker />
        </SettingsSection>
        <SettingsSection name="Offline Mode [Very Experimental]">
          <OfflineControlUi />
        </SettingsSection>
        <SettingsSection name="Install App">
          <PwaSection />
        </SettingsSection>
      </div>
    </Container>
  );
}
