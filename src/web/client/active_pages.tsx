import { SinglePageApp } from "@/web/client/components/single_page_app";
import { About } from "@/web/client/pages/about";
import { DictionaryViewV2 } from "@/web/client/pages/dictionary/dictionary_v2";
import { Macronizer } from "@/web/client/pages/macron";

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
