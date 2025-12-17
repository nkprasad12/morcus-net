import { Colors } from "@/web/client/styling/colors";

// TODO: Type this better later if possible.
type ColorString = string;

const BG_DARK: ColorString = "#141414ff";
const DIVIDER_LIGHT: ColorString = "#839191";
const EMPH_DARK: ColorString = "#9fa29f";

export interface SiteColors {
  bg: ColorString;
  bgAlt: ColorString;
  appBar: ColorString;
  bullet: ColorString;
  dictChip: ColorString;
  menuItemBase: ColorString;
  contentTextLight: ColorString;
  contentText: ColorString;
  link: ColorString | undefined;
  linkVisited: ColorString | undefined;
  buttonText: ColorString;
  tooltipBg: ColorString;
  tooltipBorder: ColorString;
  divider: ColorString;
  menuIcon: ColorString;
  menuItemActiveAlpha: string;
  menuItemInactiveAlpha: string;
  nonDictText: ColorString;
  footer: ColorString;
  dictChipAlpha: string;
  textUnderline: ColorString;
  lsBiblAlpha: number;
  lsQuoteAlpha: number;
  lsGrammarAlpha: number;
  lsOrthAlpha: number;
  lsEmph: ColorString | undefined;
  mobileNavButton: ColorString;
  mobileNavButtonHover: ColorString;
  inputBorder: ColorString;
  searchPopupText: ColorString;
  searchPopupBg: ColorString;
}

export const DEFAULT_DARK: SiteColors = {
  bg: BG_DARK,
  bgAlt: Colors.base015,
  appBar: Colors.darkarkModeMint,
  bullet: Colors.base2,
  dictChip: Colors.base125,
  menuItemBase: Colors.base02,
  contentTextLight: Colors.base0,
  contentText: Colors.base1,
  link: Colors.blue2,
  linkVisited: Colors.violet,
  buttonText: Colors.base01,
  tooltipBg: BG_DARK,
  tooltipBorder: Colors.base1,
  divider: Colors.base00,
  menuIcon: Colors.base00,
  menuItemActiveAlpha: "F8",
  menuItemInactiveAlpha: "98",
  nonDictText: Colors.base1,
  footer: Colors.base1,
  dictChipAlpha: "60",
  textUnderline: Colors.base0,
  lsBiblAlpha: 50,
  lsQuoteAlpha: 45,
  lsGrammarAlpha: 50,
  lsOrthAlpha: 80,
  lsEmph: EMPH_DARK,
  mobileNavButton: Colors.base2,
  mobileNavButtonHover: Colors.base3,
  inputBorder: Colors.base01 + "80",
  searchPopupText: Colors.base1,
  searchPopupBg: Colors.base02,
};

export const DEFAULT_LIGHT: SiteColors = {
  bg: Colors.base3,
  bgAlt: Colors.base15,
  appBar: Colors.base2,
  bullet: Colors.base01,
  dictChip: Colors.base03 + "B8",
  menuItemBase: Colors.base01,
  contentTextLight: Colors.base01,
  contentText: Colors.base015,
  link: undefined,
  linkVisited: undefined,
  buttonText: Colors.base015,
  tooltipBg: Colors.mint,
  tooltipBorder: Colors.base01,
  divider: DIVIDER_LIGHT,
  menuIcon: Colors.base1,
  menuItemActiveAlpha: "",
  menuItemInactiveAlpha: "A0",
  nonDictText: Colors.base00,
  footer: Colors.base02,
  dictChipAlpha: "30",
  textUnderline: Colors.base03,
  lsBiblAlpha: 30,
  lsQuoteAlpha: 28,
  lsGrammarAlpha: 32,
  lsOrthAlpha: 54,
  lsEmph: undefined,
  mobileNavButton: Colors.base1,
  mobileNavButtonHover: Colors.base02,
  inputBorder: Colors.base15,
  searchPopupText: Colors.base01,
  searchPopupBg: "#fafafa",
};
