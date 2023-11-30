import React, { useContext } from "react";

import { ResponsiveAppBar } from "@/web/client/components/app_bar";
import { ReportIssueDialog } from "@/web/client/components/report_issue_dialog";
import { RouteContext } from "@/web/client/components/router";
import { GlobalSettingsContext } from "@/web/client/components/global_flags";

export namespace SinglePageApp {
  export interface Page extends ResponsiveAppBar.Page {
    content: () => JSX.Element;
    experimental?: true;
    hasSubpages?: true;
  }

  export interface Props {
    pages: Page[];
  }
}

export function SinglePageApp(props: SinglePageApp.Props) {
  const nav = useContext(RouteContext);
  const globalSettings = useContext(GlobalSettingsContext);

  const [showIssueDialog, setShowIssueDialog] = React.useState<boolean>(false);

  const showExperimental = globalSettings.data.experimentalMode === true;
  const usedPages = props.pages.filter(
    (page) => showExperimental || page.experimental !== true
  );

  function Content(): JSX.Element {
    for (const page of usedPages) {
      const subpages = page.hasSubpages === true;
      if (
        (subpages && nav.route.path.startsWith(page.path)) ||
        page.path === nav.route.path
      ) {
        return page.content();
      }
    }
    return <></>;
  }

  return (
    <>
      <ResponsiveAppBar
        pages={usedPages}
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
