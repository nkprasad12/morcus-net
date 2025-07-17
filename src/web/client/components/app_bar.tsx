import * as React from "react";

import { GlobalSettingsContext } from "@/web/client/components/global_flags";
import { Router } from "@/web/client/router/router_v2";
import { Container, Divider } from "@/web/client/components/generic/basics";
import { IconButton, SvgIcon } from "@/web/client/components/generic/icons";
import { useMediaQuery } from "@/web/client/utils/media_query";
import { Drawer } from "@/web/client/components/generic/overlays";
import { useOfflineSettings } from "@/web/client/offline/use_offline_settings";

export namespace ResponsiveAppBar {
  export interface Page {
    name: string;
    targetPath: string;
    notInMainSection?: true;
  }

  export interface Props {
    pages: Page[];
    openIssueDialog: () => unknown;
  }
}

function LogoImage() {
  return (
    <img
      src="/public/favicon.ico"
      className="App-logo"
      width={48}
      height={48}
      alt="logo"
    />
  );
}

function DrawerMenu(props: {
  pages: ResponsiveAppBar.Page[];
  onPageClick: (path: string) => () => unknown;
  onClose: () => unknown;
  open: boolean;
  isCurrentPage: (page: string) => boolean;
}) {
  const pages = props.pages.concat([
    { name: "Settings", targetPath: "/settings" },
  ]);
  return (
    <Drawer
      open={props.open}
      onClose={props.onClose}
      contentProps={{
        className: "menu",
      }}>
      <div role="navigation" id="menu-appbar" className="drawerContents">
        {pages.map((page) => (
          <div key={page.name}>
            <button
              key={page.name}
              onClick={props.onPageClick(page.targetPath)}
              className={
                "text md menuItem" +
                (props.isCurrentPage(page.targetPath) ? " active" : "")
              }
              style={{
                padding: "16px 24px",
                display: "block",
                width: "100%",
              }}>
              {page.name}
            </button>
            <Divider key={page.name + "_divider"} />
          </div>
        ))}
      </div>
    </Drawer>
  );
}

export function ResponsiveAppBar(props: ResponsiveAppBar.Props) {
  const isSmall = useMediaQuery("(max-width: 900px)");
  const offlineSettings = useOfflineSettings();
  const globalSettings = React.useContext(GlobalSettingsContext);
  const darkModeOn = globalSettings.data.darkMode === true;
  const iconSize = isSmall ? "small" : "medium";

  const { route, nav } = Router.useRouter();
  const [drawerVisible, setDrawerVisible] = React.useState<boolean>(false);

  const handlePageClick = (path: string) => {
    return () => {
      setDrawerVisible(false);
      nav.to({ path });
    };
  };

  const isCurrentPage = (path: string) => route.path === path;
  const mainPages = props.pages.filter(
    (page) => page.notInMainSection !== true
  );

  return (
    <div className="menu AppBar">
      <Container maxWidth="xl">
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            MozBoxAlign: "center",
            minHeight: isSmall ? "56px" : "64px",
          }}>
          <div
            style={{
              marginRight: "16px",
              display: isSmall ? "none" : "flex",
            }}>
            <LogoImage />
          </div>
          <div style={{ flexGrow: 1, display: isSmall ? "none" : "flex" }}>
            {mainPages.map((page) => (
              <button
                key={page.name}
                onAuxClick={() => window.open(page.targetPath)}
                onClick={handlePageClick(page.targetPath)}
                className={
                  "text md menuItem" +
                  (isCurrentPage(page.targetPath) ? " active" : "")
                }
                style={{
                  marginLeft: "8px",
                  marginRight: "8px",
                  display: "block",
                }}>
                {page.name}
              </button>
            ))}
          </div>
          <div style={{ flexGrow: isSmall ? 1 : undefined }}>
            {offlineSettings?.offlineModeEnabled && (
              <IconButton
                size={iconSize}
                aria-label={"offline mode enabled"}
                onClick={handlePageClick("/settings")}
                className="menuIcon">
                <SvgIcon pathD={SvgIcon.OfflineEnabled} />
              </IconButton>
            )}
            <IconButton
              size={iconSize}
              aria-label={darkModeOn ? "light mode" : "dark mode"}
              onClick={() =>
                globalSettings.mergeData({ darkMode: !darkModeOn })
              }
              className="menuIcon">
              <SvgIcon
                pathD={darkModeOn ? SvgIcon.LightMode : SvgIcon.DarkMode}
              />
            </IconButton>
            <IconButton
              size={iconSize}
              aria-label="report an issue"
              aria-haspopup="true"
              onClick={props.openIssueDialog}
              className="menuIcon">
              <SvgIcon pathD={SvgIcon.Flag} />
            </IconButton>
            {!isSmall && (
              <IconButton
                size={iconSize}
                aria-label="site settings"
                // TODO: Find a better way to configure this.
                onClick={handlePageClick("/settings")}
                className="menuIcon">
                <SvgIcon pathD={SvgIcon.Build} />
              </IconButton>
            )}
          </div>
          <div
            style={{
              marginRight: "24px",
              display: isSmall ? "flex" : "none",
              flexGrow: 1,
            }}>
            <LogoImage />
          </div>
          <div
            style={{ display: isSmall ? "flex" : "none" }}
            className="text md">
            <IconButton
              size={iconSize}
              aria-label="site pages"
              aria-controls="menu-appbar"
              aria-haspopup="true"
              onClick={() => setDrawerVisible(true)}
              className="menuIcon">
              <SvgIcon pathD={SvgIcon.Menu} />
            </IconButton>
            <DrawerMenu
              pages={mainPages}
              onPageClick={handlePageClick}
              onClose={() => setDrawerVisible(false)}
              open={drawerVisible}
              isCurrentPage={isCurrentPage}
            />
          </div>
        </div>
      </Container>
    </div>
  );
}
