import React, { useContext } from "react";

import { ResponsiveAppBar } from "@/web/client/components/app_bar";
import { ReportIssueDialog } from "./report_issue_dialog";
import { RouteContext } from "./router";

export namespace SinglePageApp {
  export interface Page extends ResponsiveAppBar.Page {
    content: () => JSX.Element;
  }

  export interface Props {
    pages: Page[];
  }
}

export function SinglePageApp(props: SinglePageApp.Props) {
  const nav = useContext(RouteContext);
  const [showIssueDialog, setShowIssueDialog] = React.useState<boolean>(false);

  function Content(): JSX.Element {
    for (const page of props.pages) {
      if (page.path === nav.route.path) {
        return page.content();
      }
    }
    return <></>;
  }

  return (
    <>
      <ResponsiveAppBar
        pages={props.pages}
        openIssueDialog={() => setShowIssueDialog(true)}
      />
      <Content />
      <ReportIssueDialog
        show={showIssueDialog}
        onClose={() => setShowIssueDialog(false)}
      />
    </>
  );
}
