import { ClientPaths } from "@/web/client/pages/library/common";
import { Router } from "@/web/client/router/router_v2";
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
  const { route } = Router.useRouter();

  React.useEffect(() => {
    document.title = MORCUS_TITLE;
    if (route.path === ClientPaths.DICT_PAGE && currentDictWord) {
      document.title = `${currentDictWord} | ${MORCUS_TITLE}`;
    }
  }, [route.path, currentDictWord]);

  return (
    <TitleContext.Provider
      value={{
        setCurrentDictWord: setCurrentDictWord,
      }}>
      {props.children}
    </TitleContext.Provider>
  );
}
