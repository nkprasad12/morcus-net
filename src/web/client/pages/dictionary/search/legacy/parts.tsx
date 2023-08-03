import { Solarized } from "@/web/client/colors";
import { RouteContext, Navigation } from "@/web/client/components/router";
import { AutocompleteCache } from "@/web/client/pages/dictionary/autocomplete_cache";
import { Autocomplete, TextField } from "@mui/material";
import React from "react";

export function SearchBox(props: { input: string; smallScreen: boolean }) {
  const [inputState, setInputState] = React.useState<string>(props.input);
  const [options, setOptions] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const nav = React.useContext(RouteContext);

  async function onEnter(searchTerm: string) {
    if (searchTerm.length === 0) {
      return;
    }
    Navigation.query(nav, searchTerm);
  }

  return (
    <Autocomplete
      freeSolo
      disableClearable
      loading={loading}
      loadingText={"Loading options..."}
      options={options}
      filterOptions={(x) => x}
      sx={{
        padding: 1,
        ml: props.smallScreen ? 1 : 2,
        mr: props.smallScreen ? 1 : 2,
        mt: 2,
        mb: 1,
      }}
      onInputChange={async (event, value) => {
        setInputState(value);
        if (["click", "keydown"].includes(event.type)) {
          onEnter(value);
          return;
        }
        setLoading(true);
        const prefixOptions = await AutocompleteCache.get().getOptions(value);
        setOptions(prefixOptions.slice(0, 200));
        setLoading(false);
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Search for a word"
          InputLabelProps={{
            style: { color: Solarized.base1 },
          }}
          onKeyPress={(e) => {
            if (e.key === "Enter") {
              onEnter(inputState);
            }
          }}
          InputProps={{
            ...params.InputProps,
            type: "search",
          }}
        />
      )}
    />
  );
}
