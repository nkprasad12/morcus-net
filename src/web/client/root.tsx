/* istanbul ignore file */

import { useContext, StrictMode } from "react";
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

document.querySelector("#initial")?.remove();
if (window.location.pathname === "/") {
  window.history.replaceState({}, "", DICT_PAGE.appBarConfig!.targetPath);
}

const root = ReactDOM.createRoot(
  document.querySelector("#placeholder") as HTMLElement
);

// Used for development only. Allows the dev only pages to not be included in
// the final bundle. This should NEVER be checked in with the import uncommented.
const DEV_ONLY_PAGES: SinglePageApp.Page[] = [];
// import { DEV_ONLY_PAGES } from "@/web/client/routing/dev_only_pages";

const props: SinglePageApp.Props = {
  pages: [...ACTIVE_PAGES, ...DEV_ONLY_PAGES],
};

function ConfigurableStyles() {
  const styleConfig = useContext(StyleContext);

  document.body.style.backgroundColor = getBackgroundColor(styleConfig);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", getAppBarColor(styleConfig));

  return <Global {...getGlobalStyles(styleConfig)} />;
}

root.render(
  <StrictMode>
    <SettingsHandler>
      <StyleContextProvider>
        <ConfigurableStyles />
        <Router.Root>
          <TitleHandler>
            <SinglePageApp {...props} />
          </TitleHandler>
        </Router.Root>
      </StyleContextProvider>
    </SettingsHandler>
  </StrictMode>
);
