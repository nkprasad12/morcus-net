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

function DictChip(props: { label: string }) {
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
  onDictChanged: (changed: DictInfo, present: boolean) => any;
}) {
  return (
    <Dialog open={props.open} onClose={props.onClose} sx={{ top: "-40%" }}>
      <DialogTitle>Dictionary Options</DialogTitle>
      <DialogContent>
        <FormGroup>
          {LatinDict.AVAILABLE.map((dict) => (
            <FormControlLabel
              key={dict.key}
              control={
                <Switch
                  checked={props.dicts.includes(dict)}
                  onChange={(e) => props.onDictChanged(dict, e.target.checked)}
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
        <Button autoFocus onClick={props.onClose} color="info">
          Close
        </Button>
      </DialogActions>
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
  onDictChanged: (changed: DictInfo, present: boolean) => any;
}) {
  const input = React.useRef<string>("");
  const [options, setOptions] = React.useState<[DictInfo, string][]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const nav = React.useContext(RouteContext);
  const [dialogOpen, setDialogOpen] = React.useState<boolean>(false);

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
        onDictChanged={props.onDictChanged}
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
        getOptionLabel={(option) => (isString(option) ? option : option[1])}
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
          <li {...props} onClick={() => onEnter(option[1])}>
            <DictChip label={option[0].key} />
            <span style={{ marginLeft: 10 }}>{option[1]}</span>
          </li>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Search for a word"
            InputLabelProps={{
              style: { color: Solarized.base1 },
            }}
            autoFocus
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
