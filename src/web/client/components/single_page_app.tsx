import { useState, useContext } from "react";

import { ResponsiveAppBar } from "@/web/client/components/app_bar";
import { ReportIssueDialog } from "@/web/client/components/report_issue_dialog";
import { GlobalSettingsContext } from "@/web/client/components/global_flags";
import { Router } from "@/web/client/router/router_v2";
import { ContentPage, matchesPage } from "@/web/client/router/paths";
import { checkPresent } from "@/common/assert";

export namespace SinglePageApp {
  export interface Page extends ContentPage {
    experimental?: true;
    appBarConfig?: ResponsiveAppBar.Page;
  }

  export interface Props {
    pages: Page[];
  }
}

function Content(props: { usedPages: SinglePageApp.Page[] }) {
  const { route } = Router.useRouter();

  for (const page of props.usedPages) {
    if (matchesPage(route.path, page)) {
      return <page.Content />;
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
  const appBarPages = usedPages
    .filter((page) => page.appBarConfig !== undefined)
    .map((page) => checkPresent(page.appBarConfig));

  return (
    <>
      <ReportIssueDialog
        show={showIssueDialog}
        onClose={() => setShowIssueDialog(false)}
      />
      <ResponsiveAppBar
        pages={appBarPages}
        openIssueDialog={() => setShowIssueDialog(true)}
      />
      <Content usedPages={usedPages} />
    </>
  );
}
