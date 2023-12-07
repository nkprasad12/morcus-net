import { useState, useContext } from "react";

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

function Content(props: { usedPages: SinglePageApp.Page[] }) {
  const nav = useContext(RouteContext);

  for (const page of props.usedPages) {
    const subpages = page.hasSubpages === true;
    if (
      (subpages && nav.route.path.startsWith(page.path)) ||
      page.path === nav.route.path
    ) {
      return <page.content />;
    }
  }
  return <></>;
}

export function SinglePageApp(props: SinglePageApp.Props) {
  const [showIssueDialog, setShowIssueDialog] = useState<boolean>(false);

  const globalSettings = useContext(GlobalSettingsContext);
  const showExperimental = globalSettings.data.experimentalMode === true;
  const usedPages = props.pages.filter(
    (page) => showExperimental || page.experimental !== true
  );

  return (
    <>
      <ResponsiveAppBar
        pages={usedPages}
        openIssueDialog={() => setShowIssueDialog(true)}
      />
      <Content usedPages={usedPages} />
      <ReportIssueDialog
        show={showIssueDialog}
        onClose={() => setShowIssueDialog(false)}
      />
    </>
  );
}
