import { useState, useContext, useEffect } from "react";

import { ResponsiveAppBar } from "@/web/client/components/app_bar";
import { ReportIssueDialog } from "@/web/client/components/report_issue_dialog";
import { GlobalSettingsContext } from "@/web/client/components/global_flags";
import { Router } from "@/web/client/router/router_v2";
import { ContentPage, matchesPage } from "@/web/client/router/paths";
import { checkPresent } from "@/common/assert";
import { SingleItemStore } from "@/web/client/offline/single_item_store";
import { isBoolean } from "@/web/utils/rpc/parsing";
import {
  ModalDialog,
  SimpleModal,
} from "@/web/client/components/generic/overlays";
import { SpanButton } from "@/web/client/components/generic/basics";
import { SvgIcon } from "@/web/client/components/generic/icons";

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

function NotificationModal() {
  const [message, setMessage] = useState<JSX.Element | undefined>(undefined);

  useEffect(() => {
    const store = SingleItemStore.forKey("forcedOfflineMode", isBoolean);
    store.get().then(
      (forcedOfflineMode) => {
        if (!forcedOfflineMode) {
          return;
        }
        setMessage(
          <div>
            Because no network connection was detected, Offline Mode was
            automatically enabled. You can open settings and turn it back off
            using the{" "}
            <SvgIcon pathD={SvgIcon.OfflineEnabled} fontSize="small" /> button
            in the top bar.
          </div>
        );
        store.set(false);
      },
      () => {}
    );
  }, []);

  return (
    <SimpleModal message={message} onClose={() => setMessage(undefined)} />
  );
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
      <NotificationModal />
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
