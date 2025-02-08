import { Solarized } from "@/web/client/styling/colors";

// TODO: Type this better later if possible.
type ColorString = string;

const BG_DARK: ColorString = "#212022";
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
  macronBox: ColorString;
}

export const DEFAULT_DARK: SiteColors = {
  bg: BG_DARK,
  bgAlt: Solarized.base015,
  appBar: Solarized.darkarkModeMint,
  bullet: Solarized.base2,
  dictChip: Solarized.base1,
  menuItemBase: Solarized.base02,
  contentTextLight: Solarized.base00,
  contentText: Solarized.base1,
  link: Solarized.blue,
  linkVisited: Solarized.violet,
  buttonText: Solarized.base01,
  tooltipBg: BG_DARK,
  tooltipBorder: Solarized.base1,
  divider: Solarized.base00,
  menuIcon: Solarized.base00,
  menuItemActiveAlpha: "F8",
  menuItemInactiveAlpha: "98",
  nonDictText: Solarized.base1,
  footer: Solarized.base1,
  dictChipAlpha: "60",
  textUnderline: Solarized.base0,
  lsBiblAlpha: 50,
  lsQuoteAlpha: 45,
  lsGrammarAlpha: 50,
  lsOrthAlpha: 80,
  lsEmph: EMPH_DARK,
  mobileNavButton: Solarized.base2,
  mobileNavButtonHover: Solarized.base3,
  inputBorder: Solarized.base01 + "80",
  searchPopupText: Solarized.base1,
  searchPopupBg: Solarized.base02,
  macronBox: Solarized.base01,
};

export const DEFAULT_LIGHT: SiteColors = {
  bg: Solarized.base3,
  bgAlt: Solarized.base15,
  appBar: Solarized.base2,
  bullet: Solarized.base01,
  dictChip: Solarized.base03 + "A1",
  menuItemBase: Solarized.base01,
  contentTextLight: Solarized.base01,
  contentText: Solarized.base015,
  link: undefined,
  linkVisited: undefined,
  buttonText: Solarized.base015,
  tooltipBg: Solarized.mint,
  tooltipBorder: Solarized.base01,
  divider: DIVIDER_LIGHT,
  menuIcon: Solarized.base1,
  menuItemActiveAlpha: "",
  menuItemInactiveAlpha: "A0",
  nonDictText: Solarized.base00,
  footer: Solarized.base02,
  dictChipAlpha: "30",
  textUnderline: Solarized.base03,
  lsBiblAlpha: 30,
  lsQuoteAlpha: 28,
  lsGrammarAlpha: 32,
  lsOrthAlpha: 54,
  lsEmph: undefined,
  mobileNavButton: Solarized.base1,
  mobileNavButtonHover: Solarized.base02,
  inputBorder: Solarized.base15,
  searchPopupText: Solarized.base01,
  searchPopupBg: "#fafafa",
  macronBox: Solarized.base2,
};
