/* istanbul ignore file */

import { SinglePageApp } from "@/web/client/components/single_page_app";
import { About } from "@/web/client/pages/about";
import { DictionaryViewV2 } from "@/web/client/pages/dictionary/dictionary_v2";
import { ClientPaths } from "@/web/client/routing/client_paths";
import { ExternalContentReader } from "@/web/client/pages/library/external_content_reader";
import { Library } from "@/web/client/pages/library/library";
import { ReadingPage } from "@/web/client/pages/library/reader";
import { Macronizer } from "@/web/client/pages/macron";
import { SiteSettings } from "@/web/client/pages/site_settings";

export const ABOUT_PAGE: SinglePageApp.Page = {
  Content: About,
  paths: [ClientPaths.ABOUT_PATH],
  appBarConfig: {
    name: "About",
    targetPath: ClientPaths.ABOUT_PATH.path,
  },
};

export const DICT_PAGE: SinglePageApp.Page = {
  Content: DictionaryViewV2,
  paths: [ClientPaths.DICT_PAGE, ClientPaths.DICT_BY_ID],
  appBarConfig: {
    name: "Dictionary",
    targetPath: ClientPaths.DICT_PAGE.path,
  },
};

export const MACRONIZER_PAGE: SinglePageApp.Page = {
  Content: Macronizer,
  paths: [ClientPaths.MACRONIZER_PATH],
  appBarConfig: {
    name: "Macronizer",
    targetPath: ClientPaths.MACRONIZER_PATH.path,
  },
  experimental: true,
};

export const LIBRARY_PAGE: SinglePageApp.Page = {
  Content: Library,
  paths: [ClientPaths.LIBRARY_PATH],
  appBarConfig: {
    name: "Library",
    targetPath: ClientPaths.LIBRARY_PATH.path,
  },
};

export const SETTINGS_PAGE: SinglePageApp.Page = {
  Content: SiteSettings,
  paths: [ClientPaths.SETTINGS_PATH],
};

export const READING_PAGE: SinglePageApp.Page = {
  Content: ReadingPage,
  paths: [ClientPaths.WORK_PAGE, ClientPaths.WORK_BY_NAME],
};

export const EXTERNAL_CONTENT_READER_PAGE: SinglePageApp.Page = {
  Content: ExternalContentReader,
  paths: [ClientPaths.EXTERNAL_CONTENT_READER],
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
  EXTERNAL_CONTENT_READER_PAGE,
];
