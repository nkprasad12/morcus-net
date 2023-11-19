import * as React from "react";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Toolbar from "@mui/material/Toolbar";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import MenuIcon from "@mui/icons-material/Menu";
import FlagIcon from "@mui/icons-material/Flag";
import SettingsIcon from "@mui/icons-material/Settings";
import Container from "@mui/material/Container";
import Button from "@mui/material/Button";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { Navigation, RouteContext } from "@/web/client/components/router";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Drawer from "@mui/material/Drawer";
import { Divider } from "@mui/material";

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
      src="./public/favicon.ico"
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
  function DrawerItems() {
    return (
      <Box role="navigation" onClick={props.onClose} id="menu-appbar">
        <List>
          {props.pages.map((page) => (
            <div key={page.name}>
              <ListItem disablePadding>
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
                  }}
                >
                  <b>{page.name}</b>
                </Button>
              </ListItem>
              <Divider key={page.name + "_divider"} light variant="middle" />
            </div>
          ))}
        </List>
      </Box>
    );
  }

  return (
    <Drawer
      anchor="left"
      open={props.open}
      onClose={props.onClose}
      PaperProps={{
        className: "menu",
      }}
    >
      <DrawerItems />
    </Drawer>
  );
}

export function ResponsiveAppBar(props: ResponsiveAppBar.Props) {
  const noSsr = { noSsr: true };
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down("md"), noSsr);

  const nav = React.useContext(RouteContext);
  const [drawerVisible, setDrawerVisible] = React.useState<boolean>(false);

  const handlePageClick = (path: string) => {
    return () => {
      setDrawerVisible(false);
      Navigation.to(nav, path);
    };
  };

  const isCurrentPage = (path: string) => nav.route.path === path;
  const mainPages = props.pages.filter(
    (page) => page.notInMainSection !== true
  );

  return (
    <AppBar position="static" className="menu">
      <Container maxWidth="xl">
        <Toolbar disableGutters>
          <Typography
            variant="h6"
            noWrap
            component="a"
            sx={{
              mr: 2,
              display: isSmall ? "none" : "flex",
              fontFamily: "monospace",
              fontWeight: 700,
              letterSpacing: ".3rem",
              color: "inherit",
              textDecoration: "none",
            }}
          >
            <LogoImage />
          </Typography>

          <Box sx={{ flexGrow: 1, display: isSmall ? "flex" : "none" }}>
            <IconButton
              size="medium"
              aria-label="site pages"
              aria-controls="menu-appbar"
              aria-haspopup="true"
              onClick={() => setDrawerVisible(true)}
              className="menuIcon"
            >
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
            }}
          >
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
                  my: 2,
                  mx: 1,
                  display: "block",
                }}
              >
                <b>{page.name}</b>
              </Button>
            ))}
          </Box>
          <Box>
            <IconButton
              size="large"
              aria-label="site settings"
              // TODO: Find a better way to configure this.
              onClick={handlePageClick("/settings")}
              className="menuIcon"
            >
              <SettingsIcon />
            </IconButton>
            <IconButton
              size="large"
              aria-label="report an issue"
              aria-haspopup="true"
              onClick={props.openIssueDialog}
              className="menuIcon"
            >
              <FlagIcon />
            </IconButton>
          </Box>
        </Toolbar>
      </Container>
    </AppBar>
  );
}
