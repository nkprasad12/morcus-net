import { ClientPaths } from "@/web/client/routing/client_paths";
import { Router } from "@/web/client/router/router_v2";
import {
  type Context,
  type PropsWithChildren,
  createContext,
  useState,
  useEffect,
  useMemo,
} from "react";

const MORCUS_TITLE = "Morcus Latin Tools";

export interface TitleContext {
  setCurrentDictWord: (word: string) => void;
}

export const TitleContext: Context<TitleContext> = createContext({
  setCurrentDictWord: (_) => {},
});

export function TitleHandler(props: PropsWithChildren) {
  const [currentDictWord, setCurrentDictWord] = useState("");
  const { route } = Router.useRouter();

  useEffect(() => {
    document.title = MORCUS_TITLE;
    if (route.path === ClientPaths.DICT_PAGE.path && currentDictWord) {
      document.title = `${currentDictWord} | ${MORCUS_TITLE}`;
    }
  }, [route.path, currentDictWord]);

  return (
    <TitleContext.Provider value={useMemo(() => ({ setCurrentDictWord }), [])}>
      {props.children}
    </TitleContext.Provider>
  );
}
