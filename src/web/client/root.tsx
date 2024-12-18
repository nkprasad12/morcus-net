/* istanbul ignore file */

import { useContext, StrictMode, useEffect, useRef, useMemo } from "react";
import ReactDOM from "react-dom/client";

import { serializeStyles } from "@emotion/serialize";
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
import { checkPresent } from "@/common/assert";

document.querySelector("#initial")?.remove();
if (window.location.pathname === "/") {
  window.history.replaceState({}, "", DICT_PAGE.appBarConfig!.targetPath);
}

const root = ReactDOM.createRoot(
  checkPresent(document.querySelector("#placeholder"))
);

const props: SinglePageApp.Props = { pages: ACTIVE_PAGES };

function ConfigurableStyles() {
  const styleConfig = useContext(StyleContext);
  const styleSheet = useRef(new CSSStyleSheet());

  document.body.style.backgroundColor = getBackgroundColor(styleConfig);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", getAppBarColor(styleConfig));

  // UseEffect would wait until render, which is too long.
  useMemo(() => document.adoptedStyleSheets.push(styleSheet.current), []);
  useMemo(() => {
    const styleObj = getGlobalStyles(styleConfig);
    styleSheet.current.replace(serializeStyles([styleObj]).styles);
  }, [styleConfig]);

  useEffect(() => {
    return () => {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
        // eslint-disable-next-line react-hooks/exhaustive-deps
        (sheet) => sheet !== styleSheet.current
      );
    };
  }, []);

  return null;
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
