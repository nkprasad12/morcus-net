import { Solarized } from "@/web/client/colors";
import {
  DEFAULT_HIGHLIGHT_STRENGTH,
  GlobalSettings,
} from "@/web/client/components/global_flags";
import { GlobalStylesProps } from "@mui/material";

export namespace FontSizes {
  export const BIG_SCREEN = 20;
  export const SMALL_SCREEN = 19;
  export const SECONDARY = 16;
  export const TERTIARY = 14;
}

export function getBackgroundColor(settings: GlobalSettings): string {
  return settings.darkMode === true ? "#212022" : Solarized.base3;
}

export function getGlobalStyles(settings: GlobalSettings): GlobalStylesProps {
  const modifier =
    (settings.highlightStrength || DEFAULT_HIGHLIGHT_STRENGTH) /
    DEFAULT_HIGHLIGHT_STRENGTH;

  function modifiedStrength(baseStrength: number): string {
    const decimalBase = (baseStrength / 160) * 100;
    const decimalModified = modifier * decimalBase * 0.65;
    const hexModified = (160 * decimalModified) / 100;
    return `${Math.round(hexModified)}`;
  }

  const isDarkMode = settings.darkMode === true;
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

  return {
    styles: {
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
      ".contentDivider": {
        borderColor: (isDarkMode ? Solarized.base00 : "#839191") + "60",
      },
      ".contentText": {
        color: isDarkMode ? Solarized.base1 : Solarized.base015,
      },
      ".contentTextLight": {
        color: isDarkMode ? Solarized.base00 : Solarized.base01,
      },
      ".menuIcon": {
        color: isDarkMode ? Solarized.base00 : Solarized.base1,
      },
      ".menuIconFaded": {
        color: (isDarkMode ? Solarized.base00 : Solarized.base1) + 40,
      },
      ".menu": {
        backgroundColor: isDarkMode
          ? Solarized.darkarkModeMint
          : Solarized.base2,
      },
      ".menuItemActive": {
        color: menuItemBaseColor + (isDarkMode ? "D8" : ""),
      },
      ".menuItemInactive": {
        color: menuItemBaseColor + (isDarkMode ? "88" : "90"),
      },
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
      pre: { margin: "0" },
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
      ".autoCompOpt": {
        color: isDarkMode ? Solarized.base1 : Solarized.base01,
        backgroundColor: isDarkMode ? Solarized.base02 : undefined,
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
      ".workLatWord:hover": {
        borderBottom: `1px solid`,
        cursor: "pointer",
      },
      ".latWork:hover": {
        color: Solarized.blue,
        cursor: "pointer",
      },
      ".macronBox": {
        borderColor: isDarkMode ? Solarized.base01 : Solarized.base2,
      },
      ".macronLabel": {
        color: Solarized.base1,
      },
      ".autoCompItem": {
        backgroundColor: isDarkMode ? Solarized.red : Solarized.base3,
        paddingTop: "5px",
        paddingBottom: "5px",
      },
    },
  };
}
