import { DictInfo } from "@/common/dictionaries/dictionaries";
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

  return (
    <ModalDialog
      open={props.open}
      onClose={props.onClose}
      contentProps={{ className: "bgColor" }}
      aria-labelledby="dictOptTitle">
      <div
        id="dictOptTitle"
        className="text md"
        style={{ fontWeight: "bold", margin: 0, padding: "16px 24px" }}>
        Dictionary Options
      </div>
      <div style={{ padding: "0px 24px 20px" }}>
        {offlineModeOn && (
          <div className="text xs">
            Note: Offline Mode is enabled, so features that are not downloaded
            will be disabled.
          </div>
        )}
        <div className="text md light" style={{ marginTop: "8px" }}>
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
                  if (e.target.checked) {
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
        <div className="text md light" style={{ marginTop: "8px" }}>
          Settings
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
              <span className="text sm">Inflected forms (Beta)</span>
            </label>
          </div>
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

function AutocompleteOption(props: { option: [DictInfo, string] }) {
  return (
    <>
      <DictChip label={props.option[0].key} />
      <span style={{ marginLeft: 10 }}>{props.option[1]}</span>
    </>
  );
}

export function DictionarySearch(props: {
  smallScreen: boolean;
  dicts: LatinDictInfo[];
  setDicts: (newDicts: LatinDictInfo[]) => unknown;
  autoFocused: boolean;
  onSearchQuery: (term: string, dict?: DictInfo) => unknown;
  embedded?: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);

  async function onEnter(searchTerm: string, dict?: DictInfo) {
    if (searchTerm.length === 0) {
      return;
    }
    props.onSearchQuery(searchTerm, dict);
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
        smallScreen={props.smallScreen}
        autoFocused={props.autoFocused}
        onRawEnter={(v) => onEnter(v)}
        onOptionSelected={(t) => onEnter(t[1], t[0])}
        optionsForInput={(input) =>
          autocompleteOptions(input, props.dicts, 200)
        }
        RenderOption={AutocompleteOption}
        toKey={(t) => `${t[1]},${t[0].key}`}
        toInputDisplay={(t) => t[1]}
        embedded={props.embedded}
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
        {props.dicts
          .filter((dict) => !shouldDisable[dict.key] && dict.key !== "NUM")
          .map((dict) => (
            <span
              key={dict.key}
              style={{ marginRight: "2px", cursor: "pointer" }}
              onClick={props.openDialog}>
              <DictChip label={dict.key} />
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
