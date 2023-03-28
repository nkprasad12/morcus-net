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

const typographyStyle = {
  fontSize: 20,
  fontFamily: `"Roboto","Helvetica","Arial",sans-serif`,
  fontWeight: 400,
  lineHeight: 1.5,
  letterSpacing: "0.00938em",
  [theme.breakpoints.down("sm")]: {
    fontSize: 16,
    fontFamily: `"Roboto","Helvetica","Arial",sans-serif`,
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: "0.00938em",
  },
};

theme.typography.h1 = typographyStyle;
theme.typography.h2 = typographyStyle;
theme.typography.h3 = typographyStyle;
theme.typography.h4 = typographyStyle;
theme.typography.h5 = typographyStyle;
theme.typography.h6 = typographyStyle;
theme.typography.subtitle1 = typographyStyle;
theme.typography.subtitle2 = typographyStyle;
theme.typography.body1 = typographyStyle;
theme.typography.body2 = typographyStyle;
theme.typography.button = typographyStyle;
theme.typography.caption = typographyStyle;
theme.typography.overline = typographyStyle;

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
          ol: {
            listStyle: "none",
            marginLeft: 0,
            paddingLeft: "1em",
            textIndent: "-1em",
          },
          pre: { margin: "0" },
          ".lsHoverText": { borderBottom: `1px dashed ${Solarized.base03}` },
          ".lsAuthor": {
            backgroundColor: Solarized.violet + "48",
            borderBottom: `1px dashed ${Solarized.base03}`,
          },
          ".lsWork": {
            backgroundColor: Solarized.violet + "35",
            borderBottom: `1px dashed ${Solarized.base03}`,
          },
          ".lsQuote": { backgroundColor: Solarized.blue + "35" },
          ".lsOrth": {
            backgroundColor: Solarized.red + "70",
            fontWeight: "bold",
          },
          ".lsEmph": { fontWeight: "bold", fontStyle: "italic" },
        }}
      />
      <StyledEngineProvider injectFirst>
        <SinglePageApp {...props} />
      </StyledEngineProvider>
    </ThemeProvider>
  </React.StrictMode>
);
