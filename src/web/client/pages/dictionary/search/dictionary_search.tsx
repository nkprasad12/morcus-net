import { type DictLang } from "@/common/dictionaries/dictionaries";
import {
  LatinDict,
  type LatinDictInfo,
} from "@/common/dictionaries/latin_dicts";
import { autocompleteOptions } from "@/web/client/pages/dictionary/search/autocomplete_options";
import { useState, useContext } from "react";
import { DictChip } from "@/web/client/pages/dictionary/dict_chips";
import {
  DEFAULT_HIGHLIGHT_STRENGTH,
  GlobalSettingsContext,
} from "@/web/client/components/global_flags";
import { SearchBox } from "@/web/client/components/generic/search";
import { NumberSelector } from "@/web/client/components/generic/selectors";
import { Solarized } from "@/web/client/styling/colors";
import { SpanButton } from "@/web/client/components/generic/basics";
import { ModalDialog } from "@/web/client/components/generic/overlays";
import { useOfflineSettings } from "@/web/client/offline/use_offline_settings";
import type { OnSearchQuery } from "@/web/client/pages/dictionary/dict_context";

function HighlightStrengthSelector(props: {
  highlightStrength: number;
  setHighlightStrength: (newValue: number) => unknown;
}) {
  return (
    <NumberSelector
      label="Highlight Strength"
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
      GAF: enabled && settings?.gafDownloaded !== true,
      NUM: enabled,
    },
  };
}

function SearchSettingsDialog(props: {
  open: boolean;
  onClose: () => unknown;
  dicts: LatinDictInfo[];
  setDicts: (newDicts: LatinDictInfo[]) => unknown;
  isEmbedded?: boolean;
}) {
  const globalSettings = useContext(GlobalSettingsContext);
  const inflectedSetting = props.isEmbedded
    ? globalSettings.data.embeddedInflectedSearch
    : globalSettings.data.inflectedSearch;
  const inflectedSearch = inflectedSetting === true;
  const { offlineModeOn, shouldDisable } = useOfflineDictData();
  const mobileLayout = globalSettings.data.dictionaryMobileLayout ?? "Drawer";

  return (
    <ModalDialog
      open={props.open}
      onClose={props.onClose}
      contentProps={{ className: "bgColor" }}
      aria-labelledby="dictOptTitle">
      <div
        id="dictOptTitle"
        className="text md"
        style={{ margin: 0, padding: "16px 24px" }}>
        Dictionary Options
      </div>
      <div style={{ padding: "0px 24px 20px" }}>
        {offlineModeOn && (
          <div className="text xs">
            Note: Offline Mode is enabled, so features that are not downloaded
            will be disabled.
          </div>
        )}
        <div className="text md light">Search Settings</div>
        <div className="text sm light" style={{ marginTop: "8px" }}>
          Dictionaries
        </div>
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
        <div className="text sm light" style={{ marginTop: "8px" }}>
          Inflection
        </div>
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
          <div className="text md light">Display Settings</div>
          {!props.isEmbedded && (
            <div>
              <div className="text sm" style={{ marginTop: "8px" }}>
                Mobile dictionary layout:
              </div>
              <div style={{ marginLeft: "20px" }}>
                <div>
                  <input
                    id="mobileLayoutDrawer"
                    type="radio"
                    name="mobileLayout"
                    value="Drawer"
                    checked={mobileLayout === "Drawer"}
                    onChange={() =>
                      globalSettings.mergeData({
                        dictionaryMobileLayout: "Drawer",
                      })
                    }
                  />
                  <label htmlFor="mobileLayoutDrawer">
                    <span className="text sm">Drawer</span>
                  </label>
                  <div className="text xs light" style={{ marginLeft: "20px" }}>
                    Table of contents in a bottom drawer
                  </div>
                </div>
                <div>
                  <input
                    id="mobileLayoutClassic"
                    type="radio"
                    name="mobileLayout"
                    value="Classic"
                    checked={mobileLayout === "Classic"}
                    onChange={() =>
                      globalSettings.mergeData({
                        dictionaryMobileLayout: "Classic",
                      })
                    }
                  />
                  <label htmlFor="mobileLayoutClassic">
                    <span className="text sm">Classic</span>
                  </label>
                  <div className="text xs light" style={{ marginLeft: "20px" }}>
                    Table of contents above content in single column
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        <HighlightStrengthSelector
          highlightStrength={
            globalSettings.data.highlightStrength || DEFAULT_HIGHLIGHT_STRENGTH
          }
          setHighlightStrength={(v) => {
            globalSettings.mergeData({ highlightStrength: v });
          }}
        />
      </div>
      <div className="dialogActions">
        <SpanButton
          onClick={props.onClose}
          className="text md light button simple">
          Close
        </SpanButton>
      </div>
    </ModalDialog>
  );
}

function LangChip(props: { lang: DictLang }) {
  return (
    <DictChip
      label={props.lang}
      className={props.lang === "La" ? "lsChip" : "shChip"}
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
        onRawEnter={(v) => onEnter(v)}
        onOptionSelected={(t) => onEnter(t[1], t[0])}
        optionsForInput={(input) =>
          autocompleteOptions(input, props.dicts, 300)
        }
        RenderOption={AutocompleteOption}
        toKey={(t) => `${t[1]},${t[0]}`}
        toInputDisplay={(t) => t[1]}
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
      <SearchSettingsDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        dicts={props.dicts}
        setDicts={props.setDicts}
        isEmbedded={props.embedded}
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
