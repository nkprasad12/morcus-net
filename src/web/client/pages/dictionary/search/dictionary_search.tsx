import { DictInfo } from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { autocompleteOptions } from "@/web/client/pages/dictionary/search/autocomplete_options";
import Button from "@mui/material/Button";
import DialogActions from "@mui/material/DialogActions";
import DialogContentText from "@mui/material/DialogContentText";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import Switch from "@mui/material/Switch";
import { useState, useContext } from "react";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Slider from "@mui/material/Slider";
import { DictChip } from "@/web/client/pages/dictionary/dict_chips";
import {
  DEFAULT_HIGHLIGHT_STRENGTH,
  GlobalSettingsContext,
} from "@/web/client/components/global_flags";
import { SearchBox } from "@/web/client/components/generic/search";
import { RouterV2 } from "@/web/client/router/router_v2";

function toQuery(info: [DictInfo, string]): string {
  return `${info[1]},${info[0].key.replace("&", "n")}`;
}

function HighlightSlider(props: {
  highlightStrength: number;
  setHighlightStrength: (newValue: number) => any;
}) {
  const [value, setValue] = useState<number>(props.highlightStrength);

  return (
    <div>
      <DialogContentText sx={{ marginTop: 2 }}>
        Highlight Strength
      </DialogContentText>
      <Slider
        aria-label="Highlight Strength"
        getAriaValueText={(v) => `${v} %`}
        value={value}
        onChange={(_, newValue) => {
          if (typeof newValue !== "number") {
            return;
          }
          props.setHighlightStrength(newValue);
          setValue(newValue);
        }}
        valueLabelDisplay="off"
        step={10}
        marks
        min={10}
        max={90}
      />
    </div>
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
      disableScrollLock>
      <DialogTitle sx={{ fontWeight: "bold" }}>Dictionary Options</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ marginTop: 2 }}>
          Enabled Dictionaries
        </DialogContentText>
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
        <HighlightSlider
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
  const { route, nav } = RouterV2.useRouter();
  const settings = useContext(GlobalSettingsContext);

  const [dialogOpen, setDialogOpen] = useState<boolean>(false);

  async function onEnter(searchTerm: string) {
    if (searchTerm.length === 0) {
      return;
    }
    const query: Record<string, string> = {
      q: searchTerm,
    };
    if (settings.data.experimentalMode === true) {
      query.o = "1";
    }
    nav.to({ path: route.path, query });
  }

  return (
    <>
      <SearchBox
        placeholderText="Search for a word"
        ariaLabel="Dictionary search box"
        onOpenSettings={() => setDialogOpen(true)}
        smallScreen={props.smallScreen}
        autoFocused={route.query && route.query.q !== undefined}
        onRawEnter={(v) => onEnter(v)}
        onOptionSelected={(t) => onEnter(toQuery(t))}
        optionsForInput={(input) =>
          autocompleteOptions(input, props.dicts, 200)
        }
        RenderOption={AutocompleteOption}
        toKey={toQuery}
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
