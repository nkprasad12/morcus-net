/* istanbul ignore file */

import { useContext, StrictMode, PropsWithChildren } from "react";
import ReactDOM from "react-dom/client";

import GlobalStyles from "@mui/material/GlobalStyles";
import StyledEngineProvider from "@mui/material/StyledEngineProvider";
import createTheme from "@mui/material/styles/createTheme";
import ThemeProvider from "@mui/material/styles/ThemeProvider";

import { SinglePageApp } from "@/web/client/components/single_page_app";
import { Solarized } from "@/web/client/styling/colors";
import {
  GlobalSettingsContext,
  SettingsHandler,
} from "@/web/client/components/global_flags";
import { TitleHandler } from "./components/title";
import { ACTIVE_PAGES, DICT_PAGE } from "@/web/client/routing/active_pages";
import {
  getBackgroundColor,
  getGlobalStyles,
  FontSizes,
  TEXT_STYLE,
  getAppBarColor,
  getWidth,
} from "@/web/client/styling/styles";
import { Router } from "@/web/client/router/router_v2";

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
        xxs: getWidth("xxs"),
        xs: getWidth("xs"),
        sm: getWidth("sm"),
        md: getWidth("md"),
        lg: getWidth("lg"),
        xl: getWidth("xl"),
        xxl: getWidth("xxl"),
      },
    },
  });

  const typographyStyle = {
    ...TEXT_STYLE,
    fontSize: FontSizes.BIG_SCREEN,
    [theme.breakpoints.down("sm")]: {
      ...TEXT_STYLE,
      fontSize: FontSizes.SMALL_SCREEN,
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
  const settings = useContext(GlobalSettingsContext);
  return (
    <ThemeProvider theme={appTheme(settings.data.darkMode === true)}>
      {props.children}
    </ThemeProvider>
  );
}

const props: SinglePageApp.Props = {
  pages: [...ACTIVE_PAGES],
};
if (window.location.pathname === "/") {
  window.history.replaceState({}, "", DICT_PAGE.appBarConfig!.targetPath);
}

const root = ReactDOM.createRoot(
  document.querySelector("#placeholder") as HTMLElement
);

function ConfigurableStyles() {
  const settings = useContext(GlobalSettingsContext);
  document.body.style.backgroundColor = getBackgroundColor(settings.data);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", getAppBarColor(settings.data));
  return <GlobalStyles {...getGlobalStyles(settings.data)} />;
}

root.render(
  <StrictMode>
    <SettingsHandler>
      <CustomThemeProvider>
        <ConfigurableStyles />
        <StyledEngineProvider injectFirst>
          <Router.Root>
            <TitleHandler>
              <SinglePageApp {...props} />
            </TitleHandler>
          </Router.Root>
        </StyledEngineProvider>
      </CustomThemeProvider>
    </SettingsHandler>
  </StrictMode>
);
