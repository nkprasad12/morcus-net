import { exhaustiveGuard } from "@/common/misc_utils";
import { Solarized } from "@/web/client/styling/colors";
import { StyleConfig } from "@/web/client/styling/style_context";
import {
  DEFAULT_DARK,
  DEFAULT_LIGHT,
  type SiteColors,
} from "@/web/client/styling/themes";
import type { Interpolation } from "@emotion/serialize";
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

const UNSELECTABLE = {
  WebkitTouchCallout: "none",
  // @ts-ignore
  WebkitTouchSelect: "none",
  KhtmlUserSelect: "none",
  MozUserSelect: "none",
  msUserSelect: "none",
  userSelect: "none",
} as const satisfies CSSProperties;

const DEFAULT_FONTS = `"Arial","Helvetica",sans-serif`;
const SERIF_FONTS = `"Georgia", "Times New Roman", "Times", serif`;
const TEXT_STYLE = {
  fontWeight: 400,
  lineHeight: 1.5,
  letterSpacing: "0.00938em",
} as const satisfies CSSProperties;
const MOBILE_NAV_BUTTON_BASE_STYLE = {
  borderRadius: 4,
  marginTop: 3,
  marginLeft: 3,
  marginRight: 3,
  fontSize: 40,
} as const satisfies CSSProperties;

function themeFor(settings: Partial<StyleConfig>): SiteColors {
  return settings.darkMode === true ? DEFAULT_DARK : DEFAULT_LIGHT;
}

export function getBackgroundColor(settings: Partial<StyleConfig>): string {
  return themeFor(settings).bg;
}

export function getAppBarColor(settings: Partial<StyleConfig>): string {
  return themeFor(settings).appBar;
}

export function getGlobalStyles(settings: StyleConfig): Interpolation<object> {
  const theme = themeFor(settings);
  const modifier = settings.dictHighlightScale;

  function modifiedStrength(baseStrength: number): string {
    const decimalBase = (baseStrength / 160) * 100;
    const decimalModified = modifier * decimalBase * 0.65;
    const hexModified = (160 * decimalModified) / 100;
    return `${Math.round(hexModified)}`;
  }

  const backgroundColor = theme.bg;
  const contentTextLightColor = theme.contentTextLight;
  const contentTextColor = theme.contentText;
  const readerMainScale = settings.readerMainScale / 100;
  const readerSideScale = settings.readerSideScale / 100;
  const fontFamily =
    settings.fontFamily === "serif" ? SERIF_FONTS : DEFAULT_FONTS;
  const textStyle = { ...TEXT_STYLE, fontFamily };

  return {
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
      color: theme.link,
    },
    "a:visited": {
      color: theme.linkVisited,
    },
    pre: { margin: "0" },
    summary: {
      cursor: "pointer",
      color: contentTextLightColor,
    },
    ".unselectable": { ...UNSELECTABLE },
    ".svgIcon": {
      ...UNSELECTABLE,
      fill: "currentcolor",
      width: "1em",
      height: "1em",
      flexShrink: "0",
      verticalAlign: "middle",
    },

    // Text
    ".text": {
      ...textStyle,
      color: contentTextColor,
    },
    ".text.light": { color: contentTextLightColor },
    ".text.latent": { color: contentTextLightColor + "00" },
    ".text.latent:hover": { color: contentTextLightColor },
    ".text.compact": { lineHeight: 1 },
    ".text.md": { fontSize: FontSizes.SMALL_SCREEN },
    ".text.sm": { fontSize: FontSizes.SECONDARY },
    ".text.xs": { fontSize: FontSizes.TERTIARY },
    ".text.xxs": { fontSize: "12" },
    ".text.red": {
      color: Solarized.red + "A0",
    },

    // Buttons
    button: {
      backgroundColor: "transparent",
      border: "none",
      margin: 0,
      padding: 0,
      cursor: "pointer",
      outline: "none",
    },
    "button:is(:hover, :focus-visible):not(:disabled)": {
      backgroundColor: "rgba(0, 0, 0, 0.075)",
    },
    "button.outline": {
      borderRadius: "4px",
      backgroundColor: `${theme.bgAlt}60`,
      padding: "2px 6px",
      border: `1px solid ${theme.bgAlt}`,
    },
    ".button": {
      borderRadius: 4,
      cursor: "pointer",
      border: "none",
      padding: "6px",
      paddingLeft: "12px",
      paddingRight: "12px",
      backgroundColor: theme.appBar,
      color: theme.buttonText,
    },
    ".button.compact": {
      padding: "3px 6px",
      fontSize: FontSizes.TERTIARY,
    },
    ".button.simple": {
      backgroundColor,
    },
    ".button.simple:hover": {
      backgroundColor,
    },
    ".button:hover": {
      backgroundColor: theme.appBar + "A0",
    },
    ".button:focus": {
      backgroundColor: theme.appBar + "A0",
    },
    ".button.warn": {
      backgroundColor: Solarized.red + "40",
    },
    ".button.warn:hover": {
      backgroundColor: Solarized.red + "20",
    },
    ".button.warn:focus": {
      backgroundColor: Solarized.red + "20",
    },
    ".button:disabled": {
      cursor: "not-allowed",
      backgroundColor: Solarized.base1 + "48",
      color: Solarized.base1 + "96",
    },
    ".iconButton": {
      display: "inline-flex",
      WebkitBoxAlign: "center",
      alignItems: "center",
      WebkitBoxPack: "center",
      justifyContent: "center",
      position: "relative",
      boxSizing: "border-box",
      WebkitTapHighlightColor: "transparent",
      outline: "0px",
      border: "1px",
      borderColor: "#00000000",
      margin: "0px",
      cursor: "pointer",
      verticalAlign: "middle",
      appearance: "none",
      textDecoration: "none",
      textAlign: "center",
      fontSize: "1.5rem",
      padding: "8px",
      borderRadius: "50%",
      overflow: "visible",
      backgroundColor: "#00000000",
      ...UNSELECTABLE,
    },
    ".iconButton.small": {
      fontSize: "1.125rem",
      padding: "5px",
    },
    ".iconButton:disabled": {
      color: contentTextColor + "20",
    },

    // Modals
    dialog: {
      border: "none",
      padding: 0,
    },
    "dialog::backdrop": {
      backgroundColor: "#00000080",
    },
    // Dialog modals
    "dialog.dialogModal": {
      borderRadius: "8px",
      width: "400px",
      // This is animated: see `@starting-style`.
      opacity: 1,
      transition: "opacity 0.25s ease-out",
    },
    // Drawer
    "dialog.drawer": {
      margin: 0,
      marginLeft: "auto",
      maxHeight: "100vh",
      height: "100%",
      // This is animated: see `@starting-style`.
      transform: "translateX(0)",
      transition: "transform 0.14s ease-out;",
    },
    // Contents.
    ".dialogActions": {
      display: "flex",
      alignItems: "center",
      padding: 8,
      justifyContent: "flex-end",
      flex: "0 0 auto",
    },

    /** Tooltip styling */
    ".tooltip": {
      backgroundColor: theme.tooltipBg,
      border: `2px solid ${theme.tooltipBorder}`,
      // padding: "4px 8px",
      borderRadius: "4px",
      margin: "6px",
    },
    ".MuiPopper-root": {
      zIndex: 102,
    },
    ".tooltipMenuItem": {
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      borderRadius: "4px",
      padding: "4px",
      margin: "4px 0",
    },
    ".tooltipMenuItem:hover": {
      backgroundColor: theme.bgAlt + "80",
    },

    /** Basic content primitives */
    ".bgColor": { backgroundColor },
    ".bgAlt": { backgroundColor: theme.bgAlt },
    ".contentDivider": {
      borderColor: theme.divider + "60",
      flexShrink: 0,
      borderWidth: "0px 0px thin;",
      borderStyle: "solid",
      margin: "0px 16px;",
    },
    ".readerMain .text.md": {
      fontSize: FontSizes.SMALL_SCREEN * readerMainScale,
    },
    ".readerMain .text.sm": {
      fontSize: FontSizes.SECONDARY * readerMainScale,
    },
    ".readerMain .text.xs": {
      fontSize: FontSizes.TERTIARY * readerMainScale,
    },
    ".readerMain .text.xxs": {
      fontSize: 12 * readerMainScale,
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
    ".readerSide .text.xxs": {
      fontSize: 12 * readerSideScale,
    },
    ".contentText": {
      color: contentTextColor,
    },
    ".contentTextLight": {
      color: contentTextLightColor,
    },
    ".Container": {
      boxSizing: "border-box",
      display: "block",
      padding: "0 16px",
      margin: "0 auto",
    },

    /** Menu and menu items */
    ".menuIcon": {
      color: theme.menuIcon,
    },
    ".menuIconFaded": {
      color: theme.menuIcon + "40",
    },
    ".menu": {
      backgroundColor: theme.appBar,
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

    ".menuItem": {
      color: theme.menuItemBase + theme.menuItemInactiveAlpha,
      fontFamily: DEFAULT_FONTS,
    },
    ".menuItem.active": {
      color: theme.menuItemBase + theme.menuItemActiveAlpha,
    },

    /** Corpus related */
    // This is used in the corpus and in the reader when we link out from the corpus.
    ".corpusResult": {
      color: Solarized.orange + "B0",
    },
    ".corpusDisclaimer": {
      marginTop: "8px",
      backgroundColor: Solarized.red + "0A",
      borderRadius: "4px",
      padding: "8px",
      border: `1px solid ${Solarized.red + "20"}`,
    },
    ".corpusDisclaimer li": {
      marginLeft: "16px",
    },
    ".queryHelp": {
      margin: "8px 16px",
      borderRadius: "4px",
      border: `1px solid ${backgroundColor}`,
    },
    ".queryHelp code": {
      color: theme.contentTextLight,
      backgroundColor: Solarized.blue + "20",
      borderRadius: "4px",
      // Allow code examples to wrap on small screens so tables don't force page width.
      whiteSpace: "pre-wrap",
    },
    ".queryHelp[open]": {
      border: `1px solid ${theme.bgAlt}`,
    },
    ".queryHelp > summary": {
      padding: "4px 8px",
    },
    ".queryHelpContent": {
      borderTop: `1px solid ${theme.bgAlt}`,
      paddingLeft: "12px",
    },
    ".queryHelpContent ul": {
      marginTop: "0",
      paddingLeft: "24px",
    },
    // Make the examples table responsive on narrow viewports:
    ".queryHelp table": {
      width: "100%",
      maxWidth: "100%",
      borderCollapse: "collapse",
      // Treat table as a scrollable block so it can scroll horizontally inside the details
      // instead of forcing the whole page to scroll.
      display: "block",
      overflowX: "auto",
      WebkitOverflowScrolling: "touch",
      padding: "4px",
      marginBottom: "4px",
      marginRight: "12px",
    },
    ".queryHelp th, .queryHelp td": {
      // Allow long tokens (including inline <code>) to wrap/break so cell content doesn't overflow.
      wordBreak: "break-word",
      whiteSpace: "normal",
    },
    ".queryHelp th": {
      border: `1px solid ${theme.bgAlt}`,
      padding: "4px",
      fontWeight: "normal",
      textAlign: "left",
      // Ensure header cells wrap on small screens.
      wordBreak: "break-word",
      whiteSpace: "normal",
    },
    ".queryHelp td": { border: `1px solid ${theme.bgAlt}`, padding: "4px" },

    /** Dictionary specific */
    ".numeralTable": {
      marginTop: "4px",
      borderCollapse: "collapse",
      border: "1px solid",
      borderColor: theme.bgAlt,
    },
    ".numeralTable td": {
      padding: "2px 4px",
      borderCollapse: "collapse",
      border: "1px solid",
      borderColor: theme.bgAlt,
    },
    ".dictRoot .optionSection": {
      border: `1px solid ${theme.bgAlt}`,
      padding: "8px",
      marginBottom: "8px",
      borderRadius: "4px",
    },
    ".dictRoot ol": {
      marginTop: 0,
      marginBottom: 0,
    },
    ".tocSidebar": {
      position: "sticky",
      zIndex: 1,
      top: 0,
      left: 0,
      overflow: "auto",
      maxHeight: "calc(100vh - 158px)",
      minWidth: "min(29%, 300px)",
    },
    ".nonDictText": {
      color: theme.nonDictText,
    },
    ".footer": {
      color: theme.footer,
    },
    ".lsChip": {
      color: theme.dictChip,
      backgroundColor: "#7aab35" + theme.dictChipAlpha,
    },
    ".shChip": {
      color: theme.dictChip,
      backgroundColor: "#9d42cf" + theme.dictChipAlpha,
    },
    ".numChip": {
      color: theme.dictChip,
      backgroundColor: "#1234D8" + theme.dictChipAlpha,
    },
    ".deChip": {
      color: theme.dictChip,
      backgroundColor: "#B24438" + theme.dictChipAlpha,
    },
    ".esChip": {
      color: theme.dictChip,
      backgroundColor: "#4438B2" + theme.dictChipAlpha,
    },
    ".smallChip": {
      borderRadius: 4,
      paddingLeft: 3,
      paddingRight: 3,
      fontFamily: "monospace",
      color: theme.dictChip,
    },
    ".dictHighlighted": {
      borderLeft: "3px solid",
      borderColor: Solarized.red,
      paddingLeft: "4px",
      marginLeft: "-7px",
    },
    ".workHeader": {
      border: "2px solid",
      padding: "0 2px",
      borderColor: theme.bg,
    },
    ".readerHl": {
      borderColor: Solarized.cyan + "08",
      borderTopRightRadius: "4px",
      borderBottomRightRadius: "4px",
      backgroundColor: Solarized.cyan + "30",
    },
    ".dictPlaceholder": {
      color: backgroundColor,
      cursor: "default",
    },
    ".lsHover": {
      borderBottom: `1px dashed ${theme.textUnderline}`,
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
      backgroundColor: Solarized.violet + modifiedStrength(theme.lsBiblAlpha),
      borderRadius: 4,
    },
    ".gafAuth": {
      backgroundColor:
        Solarized.violet + modifiedStrength(25 + theme.lsBiblAlpha),
      borderRadius: 4,
    },
    ".lsQuote": {
      backgroundColor: Solarized.blue + modifiedStrength(theme.lsQuoteAlpha),
      borderRadius: 4,
    },
    ".lsGrammar": {
      backgroundColor:
        Solarized.orange + modifiedStrength(theme.lsGrammarAlpha),
      borderRadius: 4,
    },
    ".lsOrth": {
      backgroundColor: Solarized.red + modifiedStrength(theme.lsOrthAlpha),
      borderRadius: 4,
      padding: 2,
    },
    ".lsPlay": { textDecoration: "underline", fontStyle: "italic" },
    ".lsEmph": {
      fontWeight: "bold",
      fontStyle: "italic",
      color: theme.lsEmph,
    },
    ".lsSenseBullet": {
      cursor: "pointer",
      backgroundColor: theme.bullet + "38",
      borderRadius: 4,
    },
    ".lsSenseBullet:hover": {
      backgroundColor: theme.bullet + "60",
    },
    ".outlineHead": {
      cursor: "pointer",
      backgroundColor: theme.bullet + "30",
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
    ".raRoot ul": {
      marginTop: 0,
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
      ...MOBILE_NAV_BUTTON_BASE_STYLE,
      color: theme.mobileNavButton,
    },
    ".mobileNavButtonCollapsed": {
      ...MOBILE_NAV_BUTTON_BASE_STYLE,
      color: theme.mobileNavButton + "80",
    },
    ".mobileNavButton:hover": {
      color: theme.mobileNavButtonHover,
      cursor: "pointer",
    },

    /** Reader specific */
    ".readerIconBar": {
      position: "sticky",
      top: 0,
      width: "100%",
      boxShadow: `0 2px 3px 1px ${theme.bgAlt}`,
      marginBottom: "3px",
      backgroundColor,
      zIndex: 5,
      display: "flex",
    },
    ".readerMobileBottomBar": {
      width: "100vw",
      backgroundColor: theme.bgAlt,
    },
    ".mobileDragger": {
      width: "100vw",
      borderTopLeftRadius: "12px",
      borderTopRightRadius: "12px",
      backgroundColor: theme.bgAlt,
      height: "15px",
    },
    ".drawerContainer": {
      backgroundClip: "content-box, padding-box;",
      backgroundImage: `linear-gradient(to bottom, ${theme.bg} 0%, ${theme.bg} 100%), linear-gradient(to bottom, ${theme.bgAlt} 0%, ${theme.bgAlt} 100%);`,
    },
    ".drawerCloser": {
      position: "absolute",
      top: "10px",
      right: "2px",
    },
    ".drawerOpener": {
      position: "fixed",
      bottom: "4px",
      right: "4px",
      zIndex: 2,
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
      margin: "8px",
      padding: "8px",
      backgroundColor: Solarized.base1 + "15",
      border: "2px solid",
      borderColor: Solarized.base1 + "48",
      display: "block",
      textTransform: "capitalize",
      overflowWrap: "break-word",
      wordBreak: "break-all",
      maxWidth: "400px",
    },
    ".latWork.fromUrl": {
      textTransform: "none",
    },
    ".latWork:hover": {
      color: Solarized.blue,
      backgroundColor: Solarized.base1 + "48",
      cursor: "pointer",
    },
    ".terminalNavItem": {
      color: contentTextLightColor,
      textTransform: "capitalize",
      backgroundColor: Solarized.base1 + "20",
      border: `1px solid ${Solarized.base1}80`,
      borderRadius: "4px",
      padding: "2px",
    },
    ".terminalNavItem:hover": {
      color: Solarized.blue,
      backgroundColor: Solarized.base1 + "40",
      cursor: "pointer",
    },
    ".extReaderMobile .readerNavIconContainer": {
      borderRadius: "8px",
      margin: "4px",
      paddingBottom: "4px",
    },
    ".readerMobileBottomBar .readerNavIconContainer": {
      marginLeft: "6px",
      marginTop: "4px",
      display: "inline-block",
    },
    ".selectedSidePanelTab": {
      backgroundColor: theme.bgAlt,
    },
    ".readerMobileBottomBar .selectedSidePanelTab": {
      backgroundColor,
    },
    ".selectedSidePanelTab .menuIcon": {
      color: contentTextColor + "d0",
    },

    /** Search box */
    ".textField": {
      backgroundColor: theme.bgAlt + "60",
      borderRadius: "4px",
      border: `2px solid ${theme.inputBorder}`,
      padding: "8px",
      outline: "none",
      paddingTop: "4px",
      boxSizing: "border-box",
      marginTop: "4px",
      marginBottom: "4px",
    },
    ".textField:focus": {
      border: `2px solid ${theme.appBar}`,
    },
    ".customSearchContainer": {
      backgroundColor,
      width: "100%",
      maxWidth: "100%",
      borderRadius: 4,
      border: `2px solid ${theme.inputBorder}`,
    },
    ".customSearchContainer.focused": {
      border: `2px solid ${theme.appBar}`,
    },
    ".searchSettingsBar": {
      borderRadius: 4,
      backgroundColor: theme.bgAlt + 40,
      display: "flex",
      alignItems: "center",
    },
    "input.customSearchBox::placeholder": {
      color: theme.nonDictText + "80",
    },
    ".customSearchBox": {
      backgroundColor,
      width: "100%",
      maxWidth: "100%",
      border: "none",
      padding: "12px",
      outline: "none",
      spellcheck: "false",
      color: theme.nonDictText,
    },
    ".library .customSearchContainer": {
      padding: "0",
    },
    ".readerMain .customSearchContainer .svgIcon": {
      width: `${readerMainScale}em`,
      height: `${readerMainScale}em`,
    },
    ".readerSide .customSearchContainer .svgIcon": {
      width: `${readerSideScale}em`,
      height: `${readerSideScale}em`,
    },
    ".readerMain .blockquote": {
      display: "block",
      margin: "0.25em 0",
      fontStyle: "italic",
      marginLeft: "1em",
    },
    ".readerMain .blockquote .l": {
      display: "block",
    },
    ".readerMain .block .l": {
      display: "block",
    },
    ".customSearchPopup": {
      color: theme.searchPopupText,
      backgroundColor: theme.searchPopupBg,
      ...textStyle,
      fontSize: FontSizes.BIG_SCREEN,
      paddingTop: "8px",
      paddingBottom: "8px",
      borderRadius: "4px",
      zIndex: 1000,
      boxShadow: `0 2px 3px 2px ${theme.inputBorder}`,
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
      width: "6px",
    },
    "::-webkit-scrollbar-track": {
      backgroundColor,
      borderRadius: "3px",
    },
    "::-webkit-scrollbar-thumb": {
      background: "#888",
      borderRadius: "3px",
    },
    "::-webkit-scrollbar-thumb:hover": {
      background: "#555",
    },

    /** Macronizer specific */
    ".macUnknown": {
      border: "1px dotted",
      cursor: "pointer",
      backgroundColor: "#AA220018",
    },
    ".macAmbig": {
      borderRadius: 4,
      borderBottom: "1px dashed",
      cursor: "pointer",
    },
    ".macAmbig.unresolved": {
      backgroundColor: "#0022AA18",
    },
    ".macronLabel": {
      color: Solarized.base1,
    },
    ".macronSide .dictRoot .text.md": {
      fontSize: FontSizes.SMALL_SCREEN * 0.8,
    },
    ".macronSide .dictRoot .text.sm": {
      fontSize: FontSizes.SECONDARY * 0.8,
    },
    ".macronSide .dictRoot .text.xs": {
      fontSize: FontSizes.TERTIARY * 0.8,
    },
    ".macronSide .dictRoot .text.xxs": {
      fontSize: 12 * 0.8,
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
      "::-webkit-scrollbar": {
        width: "9px",
      },
      "::-webkit-scrollbar-track": {
        borderRadius: "4px",
      },
      "::-webkit-scrollbar-thumb": {
        borderRadius: "4px",
      },
      ".queryHelp code": {
        // Keep code examples unbroken on wider screens.
        whiteSpace: "nowrap",
      },
    },
    // For reasons I don't understand, this has to be at the bottom.
    "@starting-style": {
      "dialog[open].dialogModal": {
        opacity: 0,
      },
      "dialog[open].drawer": {
        transform: "translateX(100%)",
      },
    },
  };
}
