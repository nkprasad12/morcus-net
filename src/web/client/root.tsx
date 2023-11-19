/* istanbul ignore file */

import React, { PropsWithChildren } from "react";
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
  SETTINGS_PAGE,
} from "@/web/client/active_pages";

declare module "@mui/material/styles" {
  interface BreakpointOverrides {
    xxxs: true;
    xxs: true;
    xxl: true;
  }
}

function appTheme(isDarkMode: boolean) {
  const theme = createTheme({
    palette: {
      primary: {
        main: Solarized.darkarkModeMint,
      },
      text: {
        primary: isDarkMode ? Solarized.base1 : Solarized.base00,
        secondary: isDarkMode ? Solarized.base0 : Solarized.base01,
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
  return theme;
}

function CustomThemeProvider(props: PropsWithChildren<Record<string, any>>) {
  const settings = React.useContext(GlobalSettingsContext);
  return (
    <ThemeProvider theme={appTheme(settings.data.darkMode === true)}>
      {props.children}
    </ThemeProvider>
  );
}

const props: SinglePageApp.Props = {
  pages: [DICT_PAGE, LIBRARY_PAGE, MACRONIZER_PAGE, SETTINGS_PAGE, ABOUT_PAGE],
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

  const isDarkMode = settings.data.darkMode === true;
  const backgroundColor = isDarkMode ? "#212022" : Solarized.base3;
  document.body.style.backgroundColor = backgroundColor;
  const bulletCollor = isDarkMode ? Solarized.base2 : Solarized.base01;
  const dictChipTextColor = isDarkMode
    ? Solarized.base1
    : Solarized.base03 + "A1";
  const menuItemBaseColor = isDarkMode ? Solarized.base02 : Solarized.base01;
  const mobileNavButtonBase = {
    backgroundColor: isDarkMode + "D0",
    borderRadius: 4,
    marginTop: 3,
    marginLeft: 3,
    marginRight: 3,
    fontSize: 40,
  };

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
        a: {
          color: isDarkMode ? Solarized.blue : undefined,
        },
        ".MuiTooltip-arrow": {
          color: isDarkMode ? Solarized.darkarkModeMint : Solarized.base01,
        },
        ".MuiTooltip-tooltipArrow": {
          backgroundColor: isDarkMode
            ? Solarized.darkarkModeMint
            : Solarized.mint,
          color: Solarized.base01,
          border: `2px solid ${
            isDarkMode ? Solarized.base02 : Solarized.base01
          }`,
        },
        ".contentDivider": {
          borderColor: isDarkMode ? Solarized.base00 : "#839191",
        },
        ".contentText": {
          color: isDarkMode ? Solarized.base1 : Solarized.base02,
        },
        ".contentTextLight": {
          color: isDarkMode ? Solarized.base00 : Solarized.base01,
        },
        ".menuIcon": {
          color: isDarkMode ? Solarized.base00 : Solarized.base1,
        },
        ".menuIconFaded": {
          color: (isDarkMode ? Solarized.base00 : Solarized.base1) + 40,
        },
        ".menu": {
          backgroundColor: isDarkMode
            ? Solarized.darkarkModeMint
            : Solarized.base2,
        },
        ".menuItemActive": {
          color: menuItemBaseColor + (isDarkMode ? "D8" : ""),
        },
        ".menuItemInactive": {
          color: menuItemBaseColor + (isDarkMode ? "88" : "90"),
        },
        ".nonDictText": {
          color: isDarkMode ? Solarized.base1 : Solarized.base00,
        },
        ".footer": {
          color: isDarkMode ? Solarized.base1 : Solarized.base02,
        },
        ".lsChip": {
          color: dictChipTextColor,
          backgroundColor: "#7aab35" + (isDarkMode ? "60" : "30"),
        },
        ".shChip": {
          color: dictChipTextColor,
          backgroundColor: "#9d42cf" + (isDarkMode ? "60" : "30"),
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
        ".dictPlaceholder": {
          color: backgroundColor,
          cursor: "default",
        },
        ".lsHover": {
          borderBottom: `1px dashed ${
            isDarkMode ? Solarized.base0 : Solarized.base03
          }`,
          fontWeight: "normal",
          cursor: "help",
        },
        ".lsHover:hover": {
          backgroundColor: Solarized.base1 + "20",
          borderRadius: 4,
        },
        ".lsAuthor": {
          backgroundColor: Solarized.violet + modifiedStrength(25),
          borderRadius: 4,
        },
        ".lsBibl": {
          backgroundColor:
            Solarized.violet + modifiedStrength(isDarkMode ? 50 : 30),
          borderRadius: 4,
        },
        ".lsQuote": {
          backgroundColor:
            Solarized.blue + modifiedStrength(isDarkMode ? 45 : 28),
          borderRadius: 4,
        },
        ".lsGrammar": {
          backgroundColor:
            Solarized.orange + modifiedStrength(isDarkMode ? 50 : 32),
          borderRadius: 4,
        },
        ".lsOrth": {
          backgroundColor:
            Solarized.red + modifiedStrength(isDarkMode ? 80 : 54),
          borderRadius: 4,
          padding: 2,
        },
        ".lsPlay": { textDecoration: "underline", fontStyle: "italic" },
        ".lsEmph": {
          fontWeight: "bold",
          fontStyle: "italic",
          color: isDarkMode ? "#9fa29f" : undefined,
        },
        ".lsSenseBullet": {
          fontWeight: "bold",
          cursor: "pointer",
          backgroundColor: bulletCollor + "48",
          borderRadius: 4,
        },
        ".lsSenseBullet:hover": {
          backgroundColor: bulletCollor + "80",
        },
        ".autoCompOpt": {
          color: isDarkMode ? Solarized.base1 : Solarized.base01,
          backgroundColor: isDarkMode ? Solarized.base02 : undefined,
        },
        ".outlineHead": {
          fontWeight: "bold",
          cursor: "pointer",
          backgroundColor: bulletCollor + "30",
          borderRadius: 4,
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
        ".mobileNavOpen": {
          backgroundColor: Solarized.base1 + "40",
        },
        ".mobileNavButton": {
          ...mobileNavButtonBase,
          color: isDarkMode ? Solarized.base2 : Solarized.base1,
        },
        ".mobileNavButtonCollapsed": {
          ...mobileNavButtonBase,
          color: (isDarkMode ? Solarized.base2 : Solarized.base1) + "80",
        },
        ".mobileNavButton:hover": {
          color: isDarkMode ? Solarized.base3 : Solarized.base02,
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
        ".macronBox": {
          borderColor: isDarkMode ? Solarized.base01 : Solarized.base2,
        },
        ".macronLabel": {
          color: Solarized.base1,
        },
        ".autoCompItem": {
          backgroundColor: isDarkMode ? Solarized.red : Solarized.base3,
          paddingTop: "5px",
          paddingBottom: "5px",
        },
      }}
    />
  );
}

root.render(
  <React.StrictMode>
    <SettingsHandler>
      <CustomThemeProvider>
        <ConfigurableStyles />
        <StyledEngineProvider injectFirst>
          <Router.Handler>
            <TitleHandler>
              <SinglePageApp {...props} />
            </TitleHandler>
          </Router.Handler>
        </StyledEngineProvider>
      </CustomThemeProvider>
    </SettingsHandler>
  </React.StrictMode>
);
