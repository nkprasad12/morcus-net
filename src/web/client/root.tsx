/* istanbul ignore file */

import React from "react";
import ReactDOM from "react-dom/client";
import {
  createTheme,
  StyledEngineProvider,
  ThemeProvider,
} from "@mui/material/styles";

import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";

import { Macronizer } from "@/web/client/pages/macron";
import { SinglePageApp } from "@/web/client/components/single_page_app";
import { Dictionary } from "@/web/client/pages/dictionary";
import { Solarized } from "@/web/client/colors";
import GlobalStyles from "@mui/material/GlobalStyles";
import { getHash } from "@/web/client/browser_utils";

const theme = createTheme({
  palette: {
    primary: {
      main: Solarized.base2,
      contrastText: Solarized.base0,
    },
    secondary: {
      main: Solarized.magenta,
    },
    text: {
      primary: Solarized.base01,
      secondary: Solarized.base00,
    },
  },
});

document.body.style.backgroundColor = Solarized.base3;

const pages: SinglePageApp.Page[] = [
  {
    name: "Dictionary",
    path: "/dicts",
  },
  {
    name: "Macronizer",
    path: "/macronizer",
  },
];

const wirings: SinglePageApp.Wiring[] = [
  {
    paths: [/^\/$/, /^\/dicts$/],
    content: (_) => <Dictionary input={getHash()} />,
  },
  { paths: [/^\/macronizer$/], content: (_) => <Macronizer /> },
  { paths: [/.*/], content: (_) => <div>Error: Not found</div> },
];

const props: SinglePageApp.Props = {
  initialPage: window.location.pathname,
  pages: pages,
  wirings: wirings,
};

const root = ReactDOM.createRoot(
  document.querySelector("#placeholder") as HTMLElement
);

root.render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <GlobalStyles
        styles={{
          pre: { margin: "0" },
          ".lsAbbrReplaced": { borderBottom: `1px dashed ${Solarized.base03}` },
          ".lsSenseList": { li: { listStyleType: "none" } },
          ".lsAuthor": {
            backgroundColor: Solarized.green + "40",
            borderBottom: `1px dashed ${Solarized.base03}`,
          },
          ".lsWork": {
            backgroundColor: Solarized.violet + "40",
            borderBottom: `1px dashed ${Solarized.base03}`,
          },
          ".lsQuote": { backgroundColor: Solarized.orange + "40" },
          ".lsOrth": { backgroundColor: Solarized.red + "40" },
        }}
      />
      <StyledEngineProvider injectFirst>
        <SinglePageApp {...props} />
      </StyledEngineProvider>
    </ThemeProvider>
  </React.StrictMode>
);
