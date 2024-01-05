import { exhaustiveGuard } from "@/common/misc_utils";
import { Solarized } from "@/web/client/styling/colors";
import { StyleConfig } from "@/web/client/styling/style_context";
import type { GlobalStylesProps } from "@mui/material";
import type { CSSProperties } from "react";

export type AllowedFontSizes =
  | typeof FontSizes.BIG_SCREEN
  | typeof FontSizes.SMALL_SCREEN
  | typeof FontSizes.SECONDARY
  | typeof FontSizes.TERTIARY;

export namespace FontSizes {
  export const BIG_SCREEN = 20;
  export const SMALL_SCREEN = 19;
  export const SECONDARY = 16;
  export const TERTIARY = 14;
}

export type BoxWidth = "xxs" | "xs" | "sm" | "md" | "lg" | "xl" | "xxl";
export function getWidth(width: BoxWidth): number {
  switch (width) {
    case "xxs":
      return 275;
    case "xs":
      return 400;
    case "sm":
      return 600;
    case "md":
      return 900;
    case "lg":
      return 1200;
    case "xl":
      return 1500;
    case "xxl":
      return 2000;
    default:
      exhaustiveGuard(width);
  }
}

const ALLOWED_FONTS = `"Roboto","Arial","Helvetica",sans-serif`;
export const TEXT_STYLE: CSSProperties = {
  fontFamily: ALLOWED_FONTS,
  fontWeight: 400,
  lineHeight: 1.5,
  letterSpacing: "0.00938em",
};

export function getBackgroundColor(settings: Partial<StyleConfig>): string {
  return settings.darkMode === true ? "#212022" : Solarized.base3;
}

export function getAppBarColor(settings: Partial<StyleConfig>): string {
  return settings.darkMode === true
    ? Solarized.darkarkModeMint
    : Solarized.base2;
}

export function getGlobalStyles(settings: StyleConfig): GlobalStylesProps {
  const modifier = settings.dictHighlightScale;

  function modifiedStrength(baseStrength: number): string {
    const decimalBase = (baseStrength / 160) * 100;
    const decimalModified = modifier * decimalBase * 0.65;
    const hexModified = (160 * decimalModified) / 100;
    return `${Math.round(hexModified)}`;
  }

  const isDarkMode = settings.darkMode;
  const backgroundColor = getBackgroundColor(settings);
  const bulletColor = isDarkMode ? Solarized.base2 : Solarized.base01;
  const dictChipTextColor = isDarkMode
    ? Solarized.base1
    : Solarized.base03 + "A1";
  const menuItemBaseColor = isDarkMode ? Solarized.base02 : Solarized.base01;
  const mobileNavButtonBase = {
    backgroundColor: isDarkMode + "D0",
    borderRadius: 4,
    marginTop: 3,
    marginLeft: 3,
    marginRight: 3,
    fontSize: 40,
  };
  const contentTextLightColor = isDarkMode
    ? Solarized.base00
    : Solarized.base01;
  const contentTextColor = isDarkMode ? Solarized.base1 : Solarized.base015;
  const readerMainScale = settings.readerMainScale / 100;
  const readerSideScale = settings.readerSideScale / 100;
  const bgColorAlt = isDarkMode ? Solarized.base015 : Solarized.base15;

  return {
    styles: {
      /** For elements */
      ol: {
        listStyle: "none",
        marginLeft: 0,
        paddingLeft: "1.2em",
      },
      li: {
        paddingTop: "2px",
        paddingBottom: "2px",
      },
      a: {
        color: isDarkMode ? Solarized.blue : undefined,
      },
      "a:visited": {
        color: isDarkMode ? Solarized.violet : undefined,
      },
      ".jsLink": {
        color: Solarized.navy,
        borderBottom: `1px solid ${Solarized.navy}`,
        cursor: "pointer",
      },
      pre: { margin: "0" },
      summary: {
        cursor: "pointer",
        color: contentTextLightColor + "80",
      },
      ".unselectable": {
        WebkitTouchCallout: "none",
        WebkitTouchSelect: "none",
        KhtmlUserSelect: "none",
        MozUserSelect: "none",
        msUserSelect: "none",
        userSelect: "none",
      },

      /** Tooltip styling */
      ".MuiTooltip-arrow": {
        color: isDarkMode ? Solarized.darkarkModeMint : Solarized.base01,
      },
      ".MuiTooltip-tooltipArrow": {
        backgroundColor: isDarkMode
          ? Solarized.darkarkModeMint
          : Solarized.mint,
        color: Solarized.base01,
        border: `2px solid ${isDarkMode ? Solarized.base02 : Solarized.base01}`,
      },

      /** Basic content primitives */
      ".bgColor": { backgroundColor },
      ".contentDivider": {
        borderColor: (isDarkMode ? Solarized.base00 : "#839191") + "60",
        flexShrink: 0,
        borderWidth: "0px 0px thin;",
        borderStyle: "solid",
        margin: "0px 16px;",
      },
      ".text": {
        ...TEXT_STYLE,
        color: contentTextColor,
      },
      ".text.light": { color: contentTextLightColor },
      ".text.compact": { lineHeight: 1 },
      ".text.md": { fontSize: FontSizes.SMALL_SCREEN },
      ".text.sm": { fontSize: FontSizes.SECONDARY },
      ".text.xs": { fontSize: FontSizes.TERTIARY },
      ".readerMain .text.md": {
        fontSize: FontSizes.SMALL_SCREEN * readerMainScale,
      },
      ".readerMain .text.sm": {
        fontSize: FontSizes.SECONDARY * readerMainScale,
      },
      ".readerMain .text.xs": {
        fontSize: FontSizes.TERTIARY * readerMainScale,
      },
      ".readerSide .text.md": {
        fontSize: FontSizes.SMALL_SCREEN * readerSideScale,
      },
      ".readerSide .text.sm": {
        fontSize: FontSizes.SECONDARY * readerSideScale,
      },
      ".readerSide .text.xs": {
        fontSize: FontSizes.TERTIARY * readerSideScale,
      },
      ".contentText": {
        color: contentTextColor,
      },
      ".contentTextLight": {
        color: contentTextLightColor,
      },
      ".Container": {
        boxSizing: "border-box",
        marginLeft: "auto",
        marginRight: "auto",
        display: "block",
        paddingLeft: "16px",
        paddingRight: "16px",
      },

      /** Menu and menu items */
      ".menuIcon": {
        color: isDarkMode ? Solarized.base00 : Solarized.base1,
      },
      ".menuIconFaded": {
        color: (isDarkMode ? Solarized.base00 : Solarized.base1) + 40,
      },
      ".menu": {
        backgroundColor: getAppBarColor(settings),
      },
      ".AppBar": {
        width: "100%",
        maxHeight: "74px",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        flexShrink: 0,
        position: "static",
        transition: "box-shadow 300ms cubic-bezier(0.4, 0, 0.2, 1) 0ms;",
        boxShadow:
          "rgba(0, 0, 0, 0.2) 0px 2px 4px -1px, rgba(0, 0, 0, 0.14) 0px 4px 5px 0px, rgba(0, 0, 0, 0.12) 0px 1px 10px 0px;",
      },
      ".menuItemActive": {
        color: menuItemBaseColor + (isDarkMode ? "D8" : ""),
      },
      ".menuItemInactive": {
        color: menuItemBaseColor + (isDarkMode ? "88" : "90"),
      },

      /** Dictionary specific */
      ".nonDictText": {
        color: isDarkMode ? Solarized.base1 : Solarized.base00,
      },
      ".footer": {
        color: isDarkMode ? Solarized.base1 : Solarized.base02,
      },
      ".lsChip": {
        color: dictChipTextColor,
        backgroundColor: "#7aab35" + (isDarkMode ? "60" : "30"),
      },
      ".shChip": {
        color: dictChipTextColor,
        backgroundColor: "#9d42cf" + (isDarkMode ? "60" : "30"),
      },
      ".lsTopSense": {
        paddingLeft: "0em",
      },
      ".highlighted": {
        border: "2px solid",
        borderRadius: 4,
        borderColor: Solarized.red,
      },
      ".dictPlaceholder": {
        color: backgroundColor,
        cursor: "default",
      },
      ".lsHover": {
        borderBottom: `1px dashed ${
          isDarkMode ? Solarized.base0 : Solarized.base03
        }`,
        fontWeight: "normal",
        cursor: "help",
      },
      ".lsHover:hover": {
        backgroundColor: Solarized.base1 + "20",
        borderRadius: 4,
      },
      ".lsAuthor": {
        backgroundColor: Solarized.violet + modifiedStrength(25),
        borderRadius: 4,
      },
      ".lsBibl": {
        backgroundColor:
          Solarized.violet + modifiedStrength(isDarkMode ? 50 : 30),
        borderRadius: 4,
      },
      ".lsQuote": {
        backgroundColor:
          Solarized.blue + modifiedStrength(isDarkMode ? 45 : 28),
        borderRadius: 4,
      },
      ".lsGrammar": {
        backgroundColor:
          Solarized.orange + modifiedStrength(isDarkMode ? 50 : 32),
        borderRadius: 4,
      },
      ".lsOrth": {
        backgroundColor: Solarized.red + modifiedStrength(isDarkMode ? 80 : 54),
        borderRadius: 4,
        padding: 2,
      },
      ".lsPlay": { textDecoration: "underline", fontStyle: "italic" },
      ".lsEmph": {
        fontWeight: "bold",
        fontStyle: "italic",
        color: isDarkMode ? "#9fa29f" : undefined,
      },
      ".lsSenseBullet": {
        fontWeight: "bold",
        cursor: "pointer",
        backgroundColor: bulletColor + "48",
        borderRadius: 4,
      },
      ".lsSenseBullet:hover": {
        backgroundColor: bulletColor + "80",
      },
      ".outlineHead": {
        fontWeight: "bold",
        cursor: "pointer",
        backgroundColor: bulletColor + "30",
        borderRadius: 4,
      },
      ".lsHelpText": {
        marginBottom: 6,
      },
      ".lsTrans": { fontStyle: "italic" },
      ".clickableOutlineSection": {
        borderRadius: 4,
      },
      ".clickableOutlineSection:hover": {
        backgroundColor: Solarized.base1 + "20",
      },
      ".dLink": {
        color: Solarized.navy,
        borderBottom: `1px solid ${Solarized.navy}`,
      },
      ".dLink:hover": {
        color: Solarized.blue,
        borderBottom: `1px solid ${Solarized.blue}`,
        cursor: "pointer",
      },
      ".latWord:hover": {
        color: Solarized.blue,
        borderBottom: `1px solid ${Solarized.blue}`,
        cursor: "pointer",
      },

      /** Dictionary mobile quick nav */
      ".mobileNavMenu": {
        overflow: "hidden",
        position: "fixed",
        bottom: "5%",
        right: "0%",
        borderRadius: 4,
      },
      ".mobileNavOpen": {
        backgroundColor: Solarized.base1 + "40",
      },
      ".mobileNavButton": {
        ...mobileNavButtonBase,
        color: isDarkMode ? Solarized.base2 : Solarized.base1,
      },
      ".mobileNavButtonCollapsed": {
        ...mobileNavButtonBase,
        color: (isDarkMode ? Solarized.base2 : Solarized.base1) + "80",
      },
      ".mobileNavButton:hover": {
        color: isDarkMode ? Solarized.base3 : Solarized.base02,
        cursor: "pointer",
      },
      ".QNAEmbedded": {
        scrollMarginTop: "40px",
      },

      /** Reader specific */
      ".readerIconBar": {
        position: "sticky",
        top: 0,
        width: "100%",
        boxShadow: `0 2px 3px 1px ${bgColorAlt}`,
        marginBottom: "3px",
        backgroundColor: backgroundColor,
      },
      ".readerMobileBottomBar": {
        width: document.body.clientWidth,
        backgroundColor: bgColorAlt,
      },
      ".readerMobileDragger": {
        width: document.body.clientWidth,
        borderTopLeftRadius: "12px",
        borderTopRightRadius: "12px",
        backgroundColor: bgColorAlt,
        height: "15px",
      },
      ".draggerPuller": {
        width: 30,
        height: 6,
        borderRadius: 3,
        position: "absolute",
        top: 6,
        left: "calc(50% - 15px)",
        backgroundColor,
      },
      ".workLatWord:hover": {
        borderBottom: `1px solid`,
        cursor: "pointer",
      },
      ".latWork": {
        borderRadius: "4px",
        marginLeft: "8px",
        padding: "8px",
        backgroundColor: Solarized.base1 + "28",
        marginTop: "8px",
        display: "inline-block",
        textTransform: "capitalize",
      },
      ".latWork:hover": {
        color: Solarized.blue,
        backgroundColor: Solarized.base1 + "40",
        cursor: "pointer",
      },
      ".terminalNavItem": {
        color: contentTextLightColor,
        textTransform: "capitalize",
        backgroundColor: Solarized.base1 + "10",
        borderRadius: "4px",
        padding: "2px",
      },
      ".terminalNavItem:hover": {
        color: Solarized.blue,
        backgroundColor: Solarized.base1 + "40",
        cursor: "pointer",
      },
      ".readerNavIconContainer": {
        marginTop: "2px",
        paddingBottom: "4px",
        paddingTop: "2px",
        borderRadius: "4px",
      },
      ".readerMobileBottomBar .readerNavIconContainer": {
        borderRadius: "8px",
        paddingBottom: "6px",
      },
      ".selectedSidePanelTab": {
        backgroundColor: bgColorAlt,
      },
      ".readerMobileBottomBar .selectedSidePanelTab": {
        backgroundColor,
      },
      ".selectedSidePanelTab .menuIcon": {
        color: contentTextColor + "d0",
      },

      /** Search box */
      ".customSearchContainer": {
        backgroundColor: backgroundColor,
        width: "100%",
        maxWidth: "100%",
        borderRadius: 4,
        border: `2px solid ${
          isDarkMode ? Solarized.base01 + "80" : Solarized.base15
        }`,
      },
      ".customSearchContainerFocused": {
        border: `2px solid ${
          isDarkMode ? Solarized.darkarkModeMint : Solarized.base2
        }`,
      },
      ".customSearchBox": {
        backgroundColor: backgroundColor,
        width: "100%",
        maxWidth: "100%",
        border: "none",
        padding: "12px",
        outline: "none",
        spellcheck: "false",
        ...TEXT_STYLE,
        fontSize: FontSizes.BIG_SCREEN,
        color: isDarkMode ? Solarized.base1 : Solarized.base00,
      },
      ".customSearchPopup": {
        color: isDarkMode ? Solarized.base1 : Solarized.base01,
        backgroundColor: isDarkMode ? Solarized.base02 : "#fafafa",
        ...TEXT_STYLE,
        fontSize: FontSizes.BIG_SCREEN,
        paddingTop: "8px",
        paddingBottom: "8px",
        borderRadius: "4px",
        zIndex: 1000,
        boxShadow: `0 2px 3px 2px ${
          isDarkMode ? Solarized.base01 + "80" : Solarized.base15
        }`,
        overflow: "auto",
      },
      ".customSearchPopupOption": {
        paddingLeft: "16px",
        paddingTop: "8px",
        paddingBottom: "8px",
        display: "flex",
        alignItems: "center",
        cursor: "pointer",
        userSelect: "none",
      },
      ".customSearchPopupOptionSelected": {
        backgroundColor: Solarized.base1 + "20",
      },

      /** Custom scrollbar styles */
      "::-webkit-scrollbar": {
        width: "9px",
      },
      "::-webkit-scrollbar-track": {
        backgroundColor: bgColorAlt,
        borderRadius: "4px",
      },
      "::-webkit-scrollbar-thumb": {
        background: "#888",
        borderRadius: "4px",
      },
      "::-webkit-scrollbar-thumb:hover": {
        background: "#555",
      },

      /** Macronizer specific */
      ".macronBox": {
        borderColor: isDarkMode ? Solarized.base01 : Solarized.base2,
      },
      ".macronLabel": {
        color: Solarized.base1,
      },

      /** Size specific */
      "@media (min-width: 600px)": {
        ".Container": {
          paddingLeft: "24px",
          paddingRight: "24px",
        },
        ".text.md": {
          fontSize: FontSizes.BIG_SCREEN,
        },
        ".readerMain .text.md": {
          fontSize: FontSizes.BIG_SCREEN * readerMainScale,
        },
        ".readerSide .text.md": {
          fontSize: FontSizes.BIG_SCREEN * readerSideScale,
        },
      },
    },
  };
}
