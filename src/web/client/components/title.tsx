import { RouteContext } from "@/web/client/components/router";
import { ClientPaths } from "@/web/client/pages/library/common";
import { ReactNode } from "react";
import * as React from "react";

const MORCUS_TITLE = "Morcus Latin Tools";

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
    document.title = MORCUS_TITLE;
    if (nav.route.path === ClientPaths.DICT_PAGE && currentDictWord) {
      document.title = `${currentDictWord} | ${MORCUS_TITLE}`;
    }
  }, [nav.route.path, currentDictWord]);

  return (
    <TitleContext.Provider
      value={{
        setCurrentDictWord: setCurrentDictWord,
      }}>
      {props.children}
    </TitleContext.Provider>
  );
}
