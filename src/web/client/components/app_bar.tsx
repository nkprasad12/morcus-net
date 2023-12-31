import * as React from "react";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Toolbar from "@mui/material/Toolbar";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import MenuIcon from "@mui/icons-material/Menu";
import FlagIcon from "@mui/icons-material/Flag";
import BuildIcon from "@mui/icons-material/Build";
import DarkMode from "@mui/icons-material/DarkMode";
import LightMode from "@mui/icons-material/LightMode";
import Container from "@mui/material/Container";
import Button from "@mui/material/Button";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import Drawer from "@mui/material/Drawer";
import Divider from "@mui/material/Divider";
import { GlobalSettingsContext } from "@/web/client/components/global_flags";
import { Router } from "@/web/client/router/router_v2";

export namespace ResponsiveAppBar {
  export interface Page {
    name: string;
    path: string;
    notInMainSection?: true;
  }

  export interface Props {
    pages: Page[];
    openIssueDialog: () => any;
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
  onPageClick: (path: string) => any;
  onClose: () => any;
  open: boolean;
  isCurrentPage: (page: string) => boolean;
}) {
  const pages = props.pages.concat([{ name: "Settings", path: "/settings" }]);
  return (
    <Drawer
      anchor="left"
      open={props.open}
      onClose={props.onClose}
      transitionDuration={150}
      PaperProps={{
        className: "menu",
      }}>
      <Box role="navigation" onClick={props.onClose} id="menu-appbar">
        {pages.map((page) => (
          <div key={page.name}>
            <Button
              key={page.name}
              onClick={props.onPageClick(page.path)}
              className={
                props.isCurrentPage(page.path)
                  ? "menuItemActive"
                  : "menuItemInactive"
              }
              sx={{
                my: 1,
                mx: 2,
                display: "block",
                justifyContent: "center",
              }}>
              <b>{page.name}</b>
            </Button>
            <Divider
              key={page.name + "_divider"}
              className="contentDivider"
              variant="middle"
            />
          </div>
        ))}
      </Box>
    </Drawer>
  );
}

export function ResponsiveAppBar(props: ResponsiveAppBar.Props) {
  const noSsr = { noSsr: true };
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down("md"), noSsr);
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
    <AppBar position="static" className="menu" style={{ maxHeight: 74 }}>
      <Container maxWidth="xl">
        <Toolbar disableGutters>
          <Typography
            variant="h6"
            noWrap
            component="a"
            sx={{
              mr: 2,
              display: isSmall ? "none" : "flex",
              color: "inherit",
              textDecoration: "none",
            }}>
            <LogoImage />
          </Typography>

          <Box sx={{ flexGrow: 1, display: isSmall ? "flex" : "none" }}>
            <IconButton
              size={iconSize}
              aria-label="site pages"
              aria-controls="menu-appbar"
              aria-haspopup="true"
              onClick={() => setDrawerVisible(true)}
              className="menuIcon">
              <MenuIcon />
            </IconButton>
            <DrawerMenu
              pages={mainPages}
              onPageClick={handlePageClick}
              onClose={() => setDrawerVisible(false)}
              open={drawerVisible}
              isCurrentPage={isCurrentPage}
            />
          </Box>
          <Typography
            variant="h5"
            noWrap
            component="a"
            onClick={handlePageClick(mainPages.slice(-1)[0].path)}
            sx={{
              ml: 3,
              display: isSmall ? "flex" : "none",
              flexGrow: 1,
              fontFamily: "monospace",
              fontWeight: 700,
              letterSpacing: ".3rem",
              color: "inherit",
              textDecoration: "none",
            }}>
            <LogoImage />
          </Typography>
          <Box sx={{ flexGrow: 1, display: isSmall ? "none" : "flex" }}>
            {mainPages.map((page) => (
              <Button
                key={page.name}
                onClick={handlePageClick(page.path)}
                className={
                  isCurrentPage(page.path)
                    ? "menuItemActive"
                    : "menuItemInactive"
                }
                sx={{
                  mx: 1,
                  display: "block",
                }}>
                <b>{page.name}</b>
              </Button>
            ))}
          </Box>
          <Box>
            <IconButton
              size={iconSize}
              aria-label={darkModeOn ? "light mode" : "dark mode"}
              onClick={() =>
                globalSettings.setData({
                  ...globalSettings.data,
                  darkMode: !darkModeOn,
                })
              }
              className="menuIcon">
              {darkModeOn ? <LightMode /> : <DarkMode />}
            </IconButton>
            <IconButton
              size={iconSize}
              aria-label="report an issue"
              aria-haspopup="true"
              onClick={props.openIssueDialog}
              className="menuIcon">
              <FlagIcon />
            </IconButton>
            {!isSmall && (
              <IconButton
                size={iconSize}
                aria-label="site settings"
                // TODO: Find a better way to configure this.
                onClick={handlePageClick("/settings")}
                className="menuIcon">
                <BuildIcon />
              </IconButton>
            )}
          </Box>
        </Toolbar>
      </Container>
    </AppBar>
  );
}
