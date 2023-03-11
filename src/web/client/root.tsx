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
import { Dictionary } from "./pages/dictionary";
import { Solarized } from "./colors";

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
    content: <Dictionary />,
  },
  {
    name: "Macronizer",
    path: "/macronizer",
    content: <Macronizer />,
  },
];
const errorPage = <div>Error: Not found</div>;
const props: SinglePageApp.Props = {
  pages: pages,
  errorPage: errorPage,
  initialPage: window.location.pathname,
};

const root = ReactDOM.createRoot(
  document.querySelector("#placeholder") as HTMLElement
);

root.render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <StyledEngineProvider injectFirst>
        <SinglePageApp {...props} />
      </StyledEngineProvider>
    </ThemeProvider>
  </React.StrictMode>
);
