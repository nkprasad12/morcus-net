import { DictInfo } from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { Solarized } from "@/web/client/colors";
import { RouteContext, Navigation } from "@/web/client/components/router";
import { autocompleteOptions } from "@/web/client/pages/dictionary/search/autocomplete_options";
import { isString } from "@/web/utils/rpc/parsing";
import {
  Autocomplete,
  Button,
  DialogActions,
  FormControlLabel,
  FormGroup,
  IconButton,
  InputAdornment,
  Switch,
  TextField,
} from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import SearchIcon from "@mui/icons-material/Search";
import React from "react";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";

function toQuery(info: [DictInfo, string]): string {
  return `${info[1]},${info[0].key.replace("&", "n")}`;
}

export function DictChip(props: { label: string }) {
  return (
    <span
      style={{
        backgroundColor: Solarized.base2 + "40",
        color: Solarized.base1,
        borderRadius: 4,
        paddingLeft: 3,
        paddingRight: 3,
        fontSize: 14,
        fontFamily: "monospace",
      }}
    >
      {props.label}
    </span>
  );
}

function SearchSettingsDialog(props: {
  open: boolean;
  onClose: () => any;
  dicts: DictInfo[];
  setDicts: (newDicts: DictInfo[]) => any;
}) {
  const [saving, setSaving] = React.useState<boolean>(false);
  const [pending, setPending] = React.useState<Set<DictInfo>>(
    new Set(props.dicts)
  );

  function onClose() {
    const prev = props.dicts;
    const next = pending;
    if (!(prev.length === next.size && prev.every((d) => next.has(d)))) {
      setSaving(true);
      setTimeout(() => {
        props.setDicts([...pending]);
      }, 1);
    } else {
      props.onClose();
    }
  }

  function FormAndActions() {
    return (
      <>
        <DialogContent>
          <FormGroup>
            {LatinDict.AVAILABLE.map((dict) => (
              <FormControlLabel
                key={dict.key}
                control={
                  <Switch
                    checked={pending.has(dict)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        pending.add(dict);
                      } else {
                        pending.delete(dict);
                      }
                      setPending(new Set(pending));
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
        </DialogContent>
        <DialogActions>
          <Button autoFocus onClick={onClose} color="info">
            Close
          </Button>
        </DialogActions>
      </>
    );
  }

  return (
    <Dialog
      open={props.open}
      onClose={onClose}
      sx={{ top: "-40%" }}
      disableScrollLock={true}
    >
      <DialogTitle>
        {saving ? "Saving Settings" : "Dictionary Options"}
      </DialogTitle>
      {!saving && <FormAndActions />}
    </Dialog>
  );
}

function SearchSettings(props: { onOpenSettings: () => any }): JSX.Element {
  return (
    <IconButton
      aria-label="search settings"
      aria-haspopup="true"
      sx={{ marginRight: 0.5 }}
      onClick={props.onOpenSettings}
      id="DictSearchSettingsButton"
    >
      <SettingsIcon fontSize="medium" sx={{ color: Solarized.base1 }} />
    </IconButton>
  );
}

export function DictionarySearch(props: {
  smallScreen: boolean;
  dicts: DictInfo[];
  setDicts: (newDicts: DictInfo[]) => any;
}) {
  const input = React.useRef<string>("");
  const [options, setOptions] = React.useState<[DictInfo, string][]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const nav = React.useContext(RouteContext);
  const [dialogOpen, setDialogOpen] = React.useState<boolean>(false);

  const numDicts = props.dicts.length;

  async function onEnter(searchTerm: string) {
    if (searchTerm.length === 0) {
      return;
    }
    Navigation.query(nav, searchTerm);
  }

  async function loadOptions(searchTerm: string) {
    setLoading(true);
    const prefixOptions = await autocompleteOptions(
      searchTerm,
      props.dicts,
      200
    );
    setOptions(prefixOptions);
    setLoading(false);
  }

  return (
    <>
      <SearchSettingsDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        dicts={props.dicts}
        setDicts={props.setDicts}
      />
      <Autocomplete
        freeSolo
        disableClearable
        loading={loading}
        loadingText={"Loading options..."}
        options={options}
        filterOptions={(x) => x}
        sx={{
          padding: 1,
          paddingTop: 2,
          ml: props.smallScreen ? 1 : 2,
          mr: props.smallScreen ? 1 : 2,
          mt: 2,
          mb: 1,
        }}
        getOptionLabel={(option) =>
          isString(option) ? option : toQuery(option)
        }
        onKeyUp={(event) =>
          event.key === "Enter" ? onEnter(input.current) : ""
        }
        onInputChange={async (event, value) => {
          if (event.type === "click") {
            return;
          }
          input.current = value;
          loadOptions(value);
        }}
        renderOption={(props, option) => (
          <li {...props} onClick={() => onEnter(toQuery(option))}>
            <DictChip label={option[0].key} />
            <span style={{ marginLeft: 10 }}>{option[1]}</span>
          </li>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            label={
              numDicts === 0
                ? "Enable a dictionary in settings"
                : `Search for a word (${props.dicts
                    .map((d) => d.key)
                    .join(",")})`
            }
            error={numDicts === 0}
            InputLabelProps={{
              style: { color: Solarized.base1 },
            }}
            autoFocus={nav.route.query === undefined}
            InputProps={{
              ...params.InputProps,
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon
                    fontSize="medium"
                    sx={{ marginLeft: 1.4, color: Solarized.base1 + "40" }}
                  />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <SearchSettings onOpenSettings={() => setDialogOpen(true)} />
                </InputAdornment>
              ),
            }}
          />
        )}
      />
    </>
  );
}
