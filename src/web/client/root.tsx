/* istanbul ignore file */

import { useContext, StrictMode, useEffect } from "react";
import ReactDOM from "react-dom/client";

import { Global } from "@emotion/react";
import { SinglePageApp } from "@/web/client/components/single_page_app";
import { SettingsHandler } from "@/web/client/components/global_flags";
import { TitleHandler } from "./components/title";
import { ACTIVE_PAGES, DICT_PAGE } from "@/web/client/routing/active_pages";
import {
  getBackgroundColor,
  getGlobalStyles,
  getAppBarColor,
} from "@/web/client/styling/styles";
import { Router } from "@/web/client/router/router_v2";
import {
  StyleContext,
  StyleContextProvider,
} from "@/web/client/styling/style_context";
import { StyledEngineProvider } from "@mui/styled-engine";

if (window.location.pathname === "/") {
  window.history.replaceState({}, "", DICT_PAGE.appBarConfig!.targetPath);
}

const root = ReactDOM.createRoot(
  document.querySelector("#placeholder") as HTMLElement
);

const props: SinglePageApp.Props = {
  pages: [...ACTIVE_PAGES],
};

function ConfigurableStyles() {
  const styleConfig = useContext(StyleContext);

  const backgroundColor = getBackgroundColor(styleConfig);
  const appBarColor = getAppBarColor(styleConfig);

  useEffect(() => {
    document.body.style.backgroundColor = backgroundColor;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", appBarColor);
  }, [backgroundColor, appBarColor]);

  return <Global {...getGlobalStyles(styleConfig)} />;
}

root.render(
  <StrictMode>
    <SettingsHandler>
      <StyleContextProvider>
        <ConfigurableStyles />
        <StyledEngineProvider injectFirst>
          <Router.Root>
            <TitleHandler>
              <SinglePageApp {...props} />
            </TitleHandler>
          </Router.Root>
        </StyledEngineProvider>
      </StyleContextProvider>
    </SettingsHandler>
  </StrictMode>
);
