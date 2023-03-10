/* istanbul ignore file */

import React from "react";
import ReactDOM from "react-dom/client";
import { StyledEngineProvider } from "@mui/material/styles";

import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";

import { Macronizer } from "@/web/client/macron";
import { SinglePageApp } from "@/web/client/components/single_page_app";

const pages: SinglePageApp.Page[] = [
  {
    name: "Dictionary",
    path: "/dicts",
    content: <div>Dictionary</div>,
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
    <StyledEngineProvider injectFirst>
      <SinglePageApp {...props} />
    </StyledEngineProvider>
  </React.StrictMode>
);
