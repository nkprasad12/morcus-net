import { DictInfo } from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { autocompleteOptions } from "@/web/client/pages/dictionary/search/autocomplete_options";
import Button from "@mui/material/Button";
import DialogActions from "@mui/material/DialogActions";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import Switch from "@mui/material/Switch";
import { useState, useContext } from "react";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import { DictChip } from "@/web/client/pages/dictionary/dict_chips";
import {
  DEFAULT_HIGHLIGHT_STRENGTH,
  GlobalSettingsContext,
} from "@/web/client/components/global_flags";
import { SearchBox } from "@/web/client/components/generic/search";
import { useDictRouter } from "@/web/client/pages/dictionary/dictionary_routing";
import { ClientPaths } from "@/web/client/routing/client_paths";
import { NumberSelector } from "@/web/client/components/generic/selectors";

function HighlightStrengthSelector(props: {
  highlightStrength: number;
  setHighlightStrength: (newValue: number) => any;
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

function SearchSettingsDialog(props: {
  open: boolean;
  onClose: () => any;
  dicts: DictInfo[];
  setDicts: (newDicts: DictInfo[]) => any;
}) {
  const globalSettings = useContext(GlobalSettingsContext);

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      sx={{ top: "-40%" }}
      PaperProps={{ className: "bgColor" }}
      disableScrollLock>
      <DialogTitle sx={{ fontWeight: "bold" }}>Dictionary Options</DialogTitle>
      <DialogContent>
        <div className="text md light" style={{ marginTop: "16px" }}>
          Enabled Dictionaries
        </div>
        <FormGroup>
          {LatinDict.AVAILABLE.map((dict) => (
            <FormControlLabel
              key={dict.key}
              control={
                <Switch
                  checked={props.dicts.includes(dict)}
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
              }
              label={
                <span>
                  <DictChip label={dict.key} /> {dict.displayName}
                </span>
              }
            />
          ))}
        </FormGroup>
        <HighlightStrengthSelector
          highlightStrength={
            globalSettings.data.highlightStrength || DEFAULT_HIGHLIGHT_STRENGTH
          }
          setHighlightStrength={(v) => {
            globalSettings.setData({
              ...globalSettings.data,
              highlightStrength: v,
            });
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button autoFocus onClick={props.onClose} color="info">
          Close
        </Button>
      </DialogActions>
    </Dialog>
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
  dicts: DictInfo[];
  setDicts: (newDicts: DictInfo[]) => any;
}) {
  const { route, nav } = useDictRouter();
  const settings = useContext(GlobalSettingsContext);

  const [dialogOpen, setDialogOpen] = useState<boolean>(false);

  async function onEnter(searchTerm: string, dict?: DictInfo) {
    if (searchTerm.length === 0) {
      return;
    }
    nav.to({
      path: ClientPaths.DICT_PAGE.path,
      query: searchTerm,
      dicts: dict,
      experimentalSearch: settings.data.experimentalMode === true,
    });
  }

  return (
    <>
      <SearchBox
        placeholderText="Search for a word"
        ariaLabel="Dictionary search box"
        onOpenSettings={() => setDialogOpen(true)}
        smallScreen={props.smallScreen}
        autoFocused={route.query === undefined}
        onRawEnter={(v) => onEnter(v)}
        onOptionSelected={(t) => onEnter(t[1], t[0])}
        optionsForInput={(input) =>
          autocompleteOptions(input, props.dicts, 200)
        }
        RenderOption={AutocompleteOption}
        toKey={(t) => `${t[1]},${t[0].key}`}
        toInputDisplay={(t) => t[1]}
      />
      <SearchSettingsDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        dicts={props.dicts}
        setDicts={props.setDicts}
      />
    </>
  );
}
