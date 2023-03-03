/* istanbul ignore file */

import React from "react";
import ReactDOM from "react-dom/client";
import { Macronizer } from "./macron";

const root = ReactDOM.createRoot(
  document.querySelector("#placeholder") as HTMLElement
);
root.render(<Macronizer />);
