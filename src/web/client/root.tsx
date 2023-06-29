/* istanbul ignore file */

import React from "react";
import ReactDOM from "react-dom/client";

import GlobalStyles from "@mui/material/GlobalStyles";
import StyledEngineProvider from "@mui/material/StyledEngineProvider";
import createTheme from "@mui/material/styles/createTheme";
import ThemeProvider from "@mui/material/styles/ThemeProvider";

import { Macronizer } from "@/web/client/pages/macron";
import { SinglePageApp } from "@/web/client/components/single_page_app";
import { About } from "@/web/client/pages/about";
import { Dictionary } from "@/web/client/pages/dictionary";
import { Solarized } from "@/web/client/colors";
import { Router } from "./components/router";

declare module "@mui/material/styles" {
  interface BreakpointOverrides {
    xxxs: true;
    xxs: true;
  }
}

const theme = createTheme({
  palette: {
    primary: {
      main: Solarized.base2,
      contrastText: Solarized.base0,
    },
    secondary: {
      main: Solarized.magenta,
    },
    info: {
      main: Solarized.base01 + "90",
    },
    text: {
      primary: Solarized.base01,
      secondary: Solarized.base00,
    },
  },
  breakpoints: {
    values: {
      xxxs: 0,
      xxs: 275,
      xs: 400,
      sm: 600,
      md: 900,
      lg: 1200,
      xl: 1600,
    },
  },
});

const allowedFonts = `"Roboto","Helvetica","Arial",sans-serif`;
const typographyStyle = {
  fontSize: 20,
  fontFamily: allowedFonts,
  fontWeight: 400,
  lineHeight: 1.5,
  letterSpacing: "0.00938em",
  [theme.breakpoints.down("sm")]: {
    fontSize: 19,
    fontFamily: allowedFonts,
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

const ABOUT_PAGE: SinglePageApp.Page = {
  name: "About",
  path: "/about",
  content: About,
};
const DICT_PAGE: SinglePageApp.Page = {
  name: "Dictionary",
  path: "/dicts",
  content: Dictionary,
};
const MACRONIZER_PAGE: SinglePageApp.Page = {
  name: "Macronizer",
  path: "/macronizer",
  content: Macronizer,
};

const pages: SinglePageApp.Page[] = [DICT_PAGE];
if (process.env.NODE_ENV !== "production") {
  pages.push(MACRONIZER_PAGE);
}
pages.push(ABOUT_PAGE);

const props: SinglePageApp.Props = {
  pages: pages,
};
if (window.location.pathname === "/") {
  window.history.replaceState({}, "", props.pages[0].path);
}

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
          },
          li: {
            padding: "2px",
          },
          pre: { margin: "0" },
          ".highlighted": {
            border: "2px solid",
            borderRadius: 4,
            borderColor: Solarized.red,
          },
          ".lsHover": {
            borderBottom: `1px dashed ${Solarized.base03}`,
            fontWeight: "normal",
            cursor: "help",
          },
          ".lsAuthor": {
            backgroundColor: Solarized.violet + "22",
            borderRadius: 4,
          },
          ".lsBibl": {
            backgroundColor: Solarized.violet + "30",
            borderRadius: 4,
          },
          ".lsQuote": {
            backgroundColor: Solarized.blue + "22",
            borderRadius: 4,
          },
          ".lsOrth": {
            backgroundColor: Solarized.red + "68",
            borderRadius: 4,
            padding: 2,
          },
          ".lsEmph": { fontWeight: "bold", fontStyle: "italic" },
          ".lsSenseBullet": {
            fontWeight: "bold",
            cursor: "pointer",
            backgroundColor: Solarized.base01 + "48",
            borderRadius: 4,
          },
          ".lsTrans": { fontStyle: "italic" },
        }}
      />
      <StyledEngineProvider injectFirst>
        <Router.Handler>
          <SinglePageApp {...props} />
        </Router.Handler>
      </StyledEngineProvider>
    </ThemeProvider>
  </React.StrictMode>
);
