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
import { getBackgroundColor, getGlobalStyles } from "@/web/client/styles";

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
        main: isDarkMode ? Solarized.darkarkModeMint : "#afcebf",
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
  document.body.style.backgroundColor = getBackgroundColor(settings.data);
  return <GlobalStyles styles={getGlobalStyles(settings.data)} />;
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
