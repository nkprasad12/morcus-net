import { type DictLang } from "@/common/dictionaries/dictionaries";
import {
  LatinDict,
  type LatinDictInfo,
} from "@/common/dictionaries/latin_dicts";
import { autocompleteOptions } from "@/web/client/pages/dictionary/search/autocomplete_options";
import { useState, useContext, useCallback } from "react";
import { DictChip } from "@/web/client/pages/dictionary/dict_chips";
import {
  DEFAULT_HIGHLIGHT_STRENGTH,
  GlobalSettingsContext,
  type DictionaryMobileLayoutType,
} from "@/web/client/components/global_flags";
import { SearchBox } from "@/web/client/components/generic/search";
import { NumberSelector } from "@/web/client/components/generic/selectors";
import { Solarized } from "@/web/client/styling/colors";
import { ModalDialog } from "@/web/client/components/generic/overlays";
import { useOfflineSettings } from "@/web/client/offline/use_offline_settings";
import type { OnSearchQuery } from "@/web/client/pages/dictionary/dict_context";

const MOBILE_LAYOUT_TYPES: DictionaryMobileLayoutType[] = ["Classic", "Drawer"];
const MOBILE_LAYOUT_DESCRIPTIONS: Record<DictionaryMobileLayoutType, string> = {
  Drawer: "Ancillary content in a bottom drawer",
  Classic: "All content in one column",
};

function HighlightStrengthSelector(props: {
  highlightStrength: number;
  setHighlightStrength: (newValue: number) => unknown;
}) {
  return (
    <NumberSelector
      label="Highlight Strength"
      light
      value={props.highlightStrength}
      setValue={props.setHighlightStrength}
      step={10}
      min={10}
      max={90}
    />
  );
}

function useOfflineDictData() {
  const settings = useOfflineSettings();
  const enabled = settings?.offlineModeEnabled === true;

  return {
    offlineModeOn: enabled,
    shouldDisable: {
      inflections: enabled && settings?.morceusDownloaded !== true,
      "S&H": enabled && settings?.shDownloaded !== true,
      "L&S": enabled && settings?.lsDownloaded !== true,
      "R&A": enabled && settings?.raDownloaded !== true,
      GES: enabled && settings?.gesDownloaded !== true,
      GAF: enabled && settings?.gafDownloaded !== true,
      GRG: enabled && settings?.georgesDownloaded !== true,
      EGL: enabled && settings?.eglDownloaded !== true,
      NUM: enabled,
    },
  };
}

function OptionSubsection(props: { children: React.ReactNode }) {
  return (
    <div className="text sm light" style={{ marginTop: "8px" }}>
      {props.children}
    </div>
  );
}

function SearchSettings(props: {
  isEmbedded?: boolean;
  dicts: LatinDictInfo[];
  setDicts: (newDicts: LatinDictInfo[]) => unknown;
}) {
  const globalSettings = useContext(GlobalSettingsContext);
  const inflectedSetting = props.isEmbedded
    ? globalSettings.data.embeddedInflectedSearch
    : globalSettings.data.inflectedSearch;
  const inflectedSearch = inflectedSetting === true;
  const { shouldDisable, offlineModeOn } = useOfflineDictData();

  return (
    <details open className="optionSection">
      <summary className="text sm light">Search Settings</summary>
      {offlineModeOn && (
        <div className="text xs">
          Note: Offline Mode is enabled, so features that are not downloaded
          will be disabled.
        </div>
      )}
      <OptionSubsection>Dictionaries</OptionSubsection>
      <div>
        {LatinDict.AVAILABLE.map((dict) => (
          <div key={dict.key}>
            <input
              id={dict.key + "option"}
              type="checkbox"
              checked={!shouldDisable[dict.key] && props.dicts.includes(dict)}
              disabled={shouldDisable[dict.key]}
              onChange={(e) => {
                const dicts = new Set(props.dicts);
                if (e.currentTarget.checked) {
                  dicts.add(dict);
                } else {
                  dicts.delete(dict);
                }
                props.setDicts([...dicts]);
              }}
            />
            <label htmlFor={dict.key + "option"}>
              <span>
                <DictChip label={dict.key} />{" "}
                <span
                  className={
                    "text sm" + (shouldDisable[dict.key] ? " light" : "")
                  }>
                  {dict.displayName}
                </span>
              </span>
            </label>
          </div>
        ))}
      </div>
      <OptionSubsection>Inflection</OptionSubsection>
      <div>
        <div>
          <input
            id="inflectionOption"
            type="checkbox"
            checked={!shouldDisable.inflections && inflectedSearch}
            disabled={shouldDisable.inflections}
            onChange={() =>
              globalSettings.mergeData({
                ...(props.isEmbedded
                  ? { embeddedInflectedSearch: !inflectedSearch }
                  : { inflectedSearch: !inflectedSearch }),
              })
            }
          />
          <label htmlFor="inflectionOption">
            <span className="text sm">Latin inflected forms</span>
          </label>
        </div>
      </div>
    </details>
  );
}

function DisplaySettings(props: { isEmbedded?: boolean; isSmall?: boolean }) {
  const globalSettings = useContext(GlobalSettingsContext);
  const mobileLayout = globalSettings.data.dictionaryMobileLayout ?? "Drawer";

  return (
    <details open className="optionSection">
      <summary className="text sm light">Display Settings</summary>
      {!props.isEmbedded && props.isSmall && (
        <>
          <OptionSubsection>Mobile dictionary layout</OptionSubsection>
          <>
            {MOBILE_LAYOUT_TYPES.map((layout) => (
              <div key={layout}>
                <input
                  id={"mobileLayout" + layout}
                  type="radio"
                  name="mobileLayout"
                  value={layout}
                  checked={mobileLayout === layout}
                  onChange={() =>
                    globalSettings.mergeData({ dictionaryMobileLayout: layout })
                  }
                />
                <label
                  htmlFor={"mobileLayout" + layout}
                  style={{ marginLeft: "4px" }}>
                  <span className="text sm">{layout}</span>
                </label>
                <div className="text xs light" style={{ marginLeft: "8px" }}>
                  {MOBILE_LAYOUT_DESCRIPTIONS[layout]}
                </div>
              </div>
            ))}
          </>
        </>
      )}
      <HighlightStrengthSelector
        highlightStrength={
          globalSettings.data.highlightStrength || DEFAULT_HIGHLIGHT_STRENGTH
        }
        setHighlightStrength={(v) => {
          globalSettings.mergeData({ highlightStrength: v });
        }}
      />
    </details>
  );
}

function DictSettingsDialog(props: {
  open: boolean;
  onClose: () => unknown;
  dicts: LatinDictInfo[];
  setDicts: (newDicts: LatinDictInfo[]) => unknown;
  isEmbedded?: boolean;
  isSmall?: boolean;
}) {
  return (
    <ModalDialog
      open={props.open}
      onClose={props.onClose}
      contentProps={{ className: "bgColor" }}
      aria-labelledby="dictOptTitle">
      <div
        id="dictOptTitle"
        className="text md"
        style={{ margin: "12px", display: "flex", justifyContent: "center" }}>
        Dictionary Options
      </div>
      <div
        style={{
          margin: "0px 12px",
          height: props.isSmall ? "60vh" : "40vh",
          overflowY: "auto",
        }}>
        <SearchSettings
          dicts={props.dicts}
          setDicts={props.setDicts}
          isEmbedded={props.isEmbedded}
        />
        <DisplaySettings
          isEmbedded={props.isEmbedded}
          isSmall={props.isSmall}
        />
      </div>
      <div className="dialogActions">
        <button onClick={props.onClose} className="text sm light button simple">
          Close
        </button>
      </div>
    </ModalDialog>
  );
}

function LangChip(props: { lang: DictLang }) {
  return (
    <DictChip
      label={props.lang}
      className={
        props.lang === "La"
          ? "lsChip"
          : props.lang === "De"
          ? "deChip"
          : props.lang === "Es"
          ? "esChip"
          : "shChip"
      }
    />
  );
}

function AutocompleteOption(props: { option: [DictLang, string] }) {
  const from = props.option[0];
  return (
    <>
      <LangChip lang={from} />
      <span style={{ marginLeft: 10 }}>{props.option[1]}</span>
    </>
  );
}

function spacing(level: number): string {
  return `${level * 8}px`;
}

function trimRawQuery(query: string): string {
  // Remove any leading or trailing clusters that contain punctuation or whitespace.
  // Also remove adjacent combining marks so we don't leave dangling diacritics.
  // Uses Unicode property escapes; keep the 'u' flag and global to handle both ends.
  const LEAD_TRIM_RE = /^(?:[\p{P}\p{Z}\s]+[\p{M}]*)/u;
  const TRAIL_TRIM_RE = /(?:[\p{M}]*[\p{P}\p{Z}\s]+)$/u;
  return query.replace(LEAD_TRIM_RE, "").replace(TRAIL_TRIM_RE, "");
}

export function DictionarySearch(props: {
  smallScreen: boolean;
  dicts: LatinDictInfo[];
  setDicts: (newDicts: LatinDictInfo[]) => unknown;
  autoFocused: boolean;
  onSearchQuery: OnSearchQuery;
  embedded?: boolean;
}) {
  const { smallScreen, embedded } = props;
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);

  async function onEnter(searchTerm: string, lang?: DictLang) {
    if (searchTerm.length === 0) {
      return;
    }
    props.onSearchQuery(searchTerm, { lang });
  }

  const optionsForInput = useCallback(
    (input: string) => autocompleteOptions(input, props.dicts, 300),
    [props.dicts]
  );

  return (
    <>
      <SearchBox
        placeholderText="Search for a word"
        ariaLabel="Dictionary search box"
        onOpenSettings={() => setDialogOpen(true)}
        settingsPreview={
          <SettingsPreview
            dicts={props.dicts}
            openDialog={() => setDialogOpen(true)}
            embedded={props.embedded}
          />
        }
        autoFocused={props.autoFocused}
        onRawEnter={(v) => onEnter(trimRawQuery(v))}
        onOptionSelected={(t) => onEnter(t[1], t[0])}
        optionsForInput={optionsForInput}
        // This will cause the component to reset when `optionsForInput` changes, which
        // in turn is when `props.dicts` changes. Note this also means that the state of the
        // input field resets, but in practice that shouldn't be a big problem.
        key={optionsForInput}
        RenderOption={AutocompleteOption}
        toKey={(t) => `${t[1]},${t[0]}`}
        style={{
          padding: spacing(smallScreen ? 0 : 1),
          paddingTop: spacing(embedded ? 1 : 2),
          paddingBottom: spacing(embedded ? 0 : 1),
          marginLeft: spacing(smallScreen ? 0.5 : 2),
          marginRight: spacing(smallScreen ? 0.5 : 2),
          marginTop: spacing(embedded ? 0 : 0.5),
          marginBottom: spacing(0.5),
        }}
      />
      <DictSettingsDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        dicts={props.dicts}
        setDicts={props.setDicts}
        isEmbedded={props.embedded}
        isSmall={smallScreen}
      />
    </>
  );
}

function SettingsPreview(props: {
  dicts: LatinDictInfo[];
  openDialog: () => unknown;
  embedded?: boolean;
}) {
  const globalSettings = useContext(GlobalSettingsContext);
  const { shouldDisable } = useOfflineDictData();
  const rawInflectionSetting = props.embedded
    ? globalSettings.data.embeddedInflectedSearch
    : globalSettings.data.inflectedSearch;
  const inflectionMode =
    !shouldDisable.inflections && rawInflectionSetting === true;
  const langs = new Set(
    props.dicts
      .filter((dict) => !shouldDisable[dict.key])
      .map((d) => d.languages.from)
      .filter((lang) => lang !== "*")
  );

  return (
    <>
      <span
        className="text light xxs compact"
        style={{
          marginLeft: "6px",
          fontFamily: "monospace",
          letterSpacing: "0",
          marginRight: "12px",
        }}>
        In{" "}
        {Array.from(langs).map((lang) => (
          <span
            key={lang}
            style={{ marginRight: "2px", cursor: "pointer" }}
            onClick={props.openDialog}>
            <LangChip lang={lang} />
          </span>
        ))}
      </span>
      <span
        className="text light xxs compact"
        style={{
          fontFamily: "monospace",
          letterSpacing: "0",
        }}>
        Inflection{" "}
        <span
          className="text xs smallChip"
          onClick={props.openDialog}
          style={{
            backgroundColor:
              (inflectionMode ? Solarized.cyan : Solarized.red) + 40,
            cursor: "pointer",
          }}>
          {inflectionMode ? "On" : "Off"}
        </span>
      </span>
    </>
  );
}
