import { DICT_PAGE } from "../root";
import React, { ReactNode } from "react";
import { RouteContext } from "./router";

export interface TitleContext {
  setCurrentDictWord: (word: string) => void;
}

export const TitleContext: React.Context<TitleContext> = React.createContext({
  setCurrentDictWord: (_) => {},
});

type TitleHandlerProps = {
  children: ReactNode;
};

export function TitleHandler(props: TitleHandlerProps) {
  const [currentDictWord, setCurrentDictWord] = React.useState("");
  const nav = React.useContext(RouteContext);

  React.useEffect(() => {
    document.title = "Morcus Latin Tools";
    if (nav.route.path === DICT_PAGE.path && currentDictWord) {
      document.title += ` | ${currentDictWord}`;
    }
  }, [nav.route.path, currentDictWord]);

  return (
    <TitleContext.Provider
      value={{
        setCurrentDictWord: setCurrentDictWord,
      }}
    >
      {props.children}
    </TitleContext.Provider>
  );
}
