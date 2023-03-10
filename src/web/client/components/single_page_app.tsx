import React from "react";

import { ResponsiveAppBar } from "@/web/client/components/app_bar";

export namespace SinglePageApp {
  export interface Page {
    name: string;
    path: string;
    content: JSX.Element;
  }

  export interface Props {
    initialPage: string;
    pages: Page[];
    errorPage: JSX.Element;
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
    const content = props.pages.filter((page) => page.path === currentPage);
    if (content.length === 0) {
      if (currentPage === "/") {
        return props.pages[0].content;
      }
      return props.errorPage;
    }
    return content[0].content;
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
