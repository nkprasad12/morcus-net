/* istanbul ignore file */

import React from "react";
import ReactDOM from "react-dom/client";

import GlobalStyles from "@mui/material/GlobalStyles";
import StyledEngineProvider from "@mui/material/StyledEngineProvider";
import createTheme from "@mui/material/styles/createTheme";
import ThemeProvider from "@mui/material/styles/ThemeProvider";

import { SinglePageApp } from "@/web/client/components/single_page_app";
import { Solarized } from "@/web/client/colors";
import { Router } from "@/web/client/components/router";
import {
  DEFAULT_HIGHLIGHT_STRENGTH,
  GlobalSettingsContext,
  SettingsHandler,
} from "@/web/client/components/global_flags";
import { TitleHandler } from "./components/title";
import {
  ABOUT_PAGE,
  DICT_PAGE,
  LIBRARY_PAGE,
  MACRONIZER_PAGE,
} from "@/web/client/active_pages";

declare module "@mui/material/styles" {
  interface BreakpointOverrides {
    xxxs: true;
    xxs: true;
    xxl: true;
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
      xl: 1500,
      xxl: 2000,
    },
  },
});

const allowedFonts = `"Roboto","Arial","Helvetica",sans-serif`;
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

const props: SinglePageApp.Props = {
  pages: [DICT_PAGE, LIBRARY_PAGE, MACRONIZER_PAGE, ABOUT_PAGE],
};
if (window.location.pathname === "/") {
  window.history.replaceState({}, "", props.pages[0].path);
}

const root = ReactDOM.createRoot(
  document.querySelector("#placeholder") as HTMLElement
);

function ConfigurableStyles() {
  const settings = React.useContext(GlobalSettingsContext);
  const modifier =
    (settings.data.highlightStrength || DEFAULT_HIGHLIGHT_STRENGTH) /
    DEFAULT_HIGHLIGHT_STRENGTH;

  function modifiedStrength(baseStrength: number): string {
    const decimalBase = (baseStrength / 160) * 100;
    const decimalModified = modifier * decimalBase * 0.65;
    const hexModified = (160 * decimalModified) / 100;
    return `${Math.round(hexModified)}`;
  }

  return (
    <GlobalStyles
      styles={{
        ol: {
          listStyle: "none",
          marginLeft: 0,
          paddingLeft: "1.2em",
        },
        li: {
          paddingTop: "2px",
          paddingBottom: "2px",
        },
        ".lsTopSense": {
          paddingLeft: "0em",
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
        ".lsHover:hover": {
          backgroundColor: Solarized.base1 + "20",
          borderRadius: 4,
        },
        ".lsAuthor": {
          backgroundColor: Solarized.violet + modifiedStrength(22),
          borderRadius: 4,
        },
        ".lsBibl": {
          backgroundColor: Solarized.violet + modifiedStrength(30),
          borderRadius: 4,
        },
        ".lsQuote": {
          backgroundColor: Solarized.blue + modifiedStrength(28),
          borderRadius: 4,
        },
        ".lsGrammar": {
          backgroundColor: Solarized.orange + modifiedStrength(32),
          borderRadius: 4,
        },
        ".lsOrth": {
          backgroundColor: Solarized.red + modifiedStrength(54),
          borderRadius: 4,
          padding: 2,
        },
        ".lsPlay": { textDecoration: "underline", fontStyle: "italic" },
        ".lsEmph": { fontWeight: "bold", fontStyle: "italic" },
        ".lsSenseBullet": {
          fontWeight: "bold",
          cursor: "pointer",
          backgroundColor: Solarized.base01 + "48",
          borderRadius: 4,
        },
        ".lsSenseBullet:hover": {
          backgroundColor: Solarized.base01 + "80",
        },
        ".lsHelpText": {
          marginBottom: 6,
        },
        ".lsTrans": { fontStyle: "italic" },
        ".clickableOutlineSection": {
          borderRadius: 4,
        },
        ".clickableOutlineSection:hover": {
          backgroundColor: Solarized.base1 + "20",
        },
        ".mobileNavMenu": {
          overflow: "hidden",
          position: "fixed",
          bottom: "5%",
          right: "0%",
          borderRadius: 4,
        },
        ".mobileNavButton": {
          color: Solarized.base1,
          backgroundColor: Solarized.base3 + "D0",
          borderRadius: 4,
          marginTop: 3,
          marginLeft: 3,
          marginRight: 3,
          fontSize: 40,
        },
        ".mobileNavButton:hover": {
          color: Solarized.base01,
          cursor: "pointer",
        },
        ".dLink": {
          color: Solarized.navy,
          borderBottom: `1px solid ${Solarized.navy}`,
        },
        ".dLink:hover": {
          color: Solarized.blue,
          borderBottom: `1px solid ${Solarized.blue}`,
          cursor: "pointer",
        },
        ".latWord:hover": {
          color: Solarized.blue,
          borderBottom: `1px solid ${Solarized.blue}`,
          cursor: "pointer",
        },
        ".latWork:hover": {
          color: Solarized.blue,
          cursor: "pointer",
        },
      }}
    />
  );
}

root.render(
  <React.StrictMode>
    <SettingsHandler>
      <ThemeProvider theme={theme}>
        <ConfigurableStyles />
        <StyledEngineProvider injectFirst>
          <Router.Handler>
            <TitleHandler>
              <SinglePageApp {...props} />
            </TitleHandler>
          </Router.Handler>
        </StyledEngineProvider>
      </ThemeProvider>
    </SettingsHandler>
  </React.StrictMode>
);
