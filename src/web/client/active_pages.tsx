/* istanbul ignore file */

import { SinglePageApp } from "@/web/client/components/single_page_app";
import { About } from "@/web/client/pages/about";
import { DictionaryViewV2 } from "@/web/client/pages/dictionary/dictionary_v2";
import { WORK_PAGE } from "@/web/client/pages/library/common";
import { Library } from "@/web/client/pages/library/library";
import { ReadingPage } from "@/web/client/pages/library/reader";
import { Macronizer } from "@/web/client/pages/macron";
import { SiteSettings } from "@/web/client/pages/site_settings";

export const ABOUT_PAGE: SinglePageApp.Page = {
  name: "About",
  path: "/about",
  content: About,
};

export const DICT_PAGE: SinglePageApp.Page = {
  name: "Dictionary",
  path: "/dicts",
  content: DictionaryViewV2,
};

export const MACRONIZER_PAGE: SinglePageApp.Page = {
  name: "Macronizer",
  path: "/macronizer",
  content: Macronizer,
  experimental: true,
};

export const LIBRARY_PAGE: SinglePageApp.Page = {
  name: "Library",
  path: "/library",
  content: Library,
};

export const SETTINGS_PAGE: SinglePageApp.Page = {
  name: "Settings",
  path: "/settings",
  content: SiteSettings,
  notInMainSection: true,
};

export const READING_PAGE: SinglePageApp.Page = {
  name: "Reading",
  path: WORK_PAGE,
  content: ReadingPage,
  notInMainSection: true,
  hasSubpages: true,
};

export const ACTIVE_PAGES = [
  // Visible in top navigation
  DICT_PAGE,
  LIBRARY_PAGE,
  MACRONIZER_PAGE,
  ABOUT_PAGE,
  // Other pages
  SETTINGS_PAGE,
  READING_PAGE,
];
