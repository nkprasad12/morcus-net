import React from "react";

import { ResponsiveAppBar } from "@/web/client/components/app_bar";

export namespace SinglePageApp {
  export type Page = ResponsiveAppBar.Page;

  export interface Wiring {
    paths: RegExp[];
    content: (groups: string[]) => JSX.Element;
  }

  export interface Props {
    initialPage: string;
    pages: Page[];
    wirings: Wiring[];
  }
}

export function SinglePageApp(props: SinglePageApp.Props) {
  const [currentPage, setCurrentPage] = React.useState<string>(
    props.initialPage
  );

  React.useEffect(() => {
    window.addEventListener("popstate", () => {
      setCurrentPage(window.location.pathname);
    });
  }, []);

  function chooseContent(): JSX.Element {
    for (const wiring of props.wirings) {
      for (const path of wiring.paths) {
        const matches = currentPage.match(path);
        if (matches !== null) {
          return wiring.content(matches.slice(1));
        }
      }
    }
    return <></>;
  }

  return (
    <div>
      <ResponsiveAppBar
        pages={props.pages}
        setPage={(page) => {
          history.pushState(page, "", page);
          setCurrentPage(page);
        }}
      />
      {chooseContent()}
    </div>
  );
}
