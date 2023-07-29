import { DictInfo } from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { Solarized } from "@/web/client/colors";
import { RouteContext, Navigation } from "@/web/client/components/router";
import { autocompleteOptions } from "@/web/client/pages/dictionary/autocomplete/autocomplete_options";
import { isString } from "@/web/utils/rpc/parsing";
import { Autocomplete, TextField } from "@mui/material";
import React from "react";

function DictChip(props: { info: DictInfo }) {
  return (
    <span
      style={{
        marginRight: 10,
        backgroundColor: Solarized.base2 + "40",
        color: Solarized.base1,
        borderRadius: 4,
        paddingLeft: 3,
        paddingRight: 3,
        fontSize: 14,
        fontFamily: "monospace",
      }}
    >
      {props.info.key}
    </span>
  );
}

export function DictionarySearch(props: {
  input: string;
  smallScreen: boolean;
}) {
  // const [inputState, setInputState] = React.useState<string>(props.input);
  const [options, setOptions] = React.useState<[DictInfo, string][]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const nav = React.useContext(RouteContext);

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
      LatinDict.AVAILABLE,
      200
    );
    setOptions(prefixOptions);
    setLoading(false);
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
        paddingTop: 2,
        ml: props.smallScreen ? 1 : 2,
        mr: props.smallScreen ? 1 : 2,
        mt: 2,
        mb: 1,
      }}
      getOptionLabel={(option) => (isString(option) ? option : option[1])}
      onKeyDown={(event) => {
        console.log(`onKeyDown ${event.key} | ${event.type}`);
        console.log(event.currentTarget);
        event.persist;
      }}
      onInputChange={async (event, value) => {
        if (event.type === "click") {
          return;
        }
        console.log(`onInputChange ${value} | ${event.type}`);
        if (
          event.type === "click" ||
          // @ts-ignore
          (event.type === "keydown" && event.key === "Enter")
        ) {
          onEnter(value);
          return;
        }
        loadOptions(value);
      }}
      renderOption={(props, option) => (
        <li
          {...props}
          onClick={() => onEnter(option[1])}
          onKeyDown={(e) => {
            console.log("li onKeyDown");
          }}
        >
          <DictChip info={option[0]} />
          <span>{option[1]}</span>
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
            type: "search",
          }}
        />
      )}
    />
  );
}
