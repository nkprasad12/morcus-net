import { checkPresent } from "@/common/assert";
import { PagePath } from "@/web/client/router/paths";

export const ClientPaths = {
  WORK_PAGE: checkPresent(PagePath.of("/work/:workId")),
  WORK_BY_NAME: checkPresent(PagePath.of("/work/:author/:name")),
  EXTERNAL_CONTENT_READER: checkPresent(PagePath.of("/externalReader")),
  DICT_PAGE: checkPresent(PagePath.of("/dicts")),
  DICT_BY_ID: checkPresent(PagePath.of("/dicts/id/:id")),
  ABOUT_PATH: checkPresent(PagePath.of("/about")),
  MACRONIZER_PATH: checkPresent(PagePath.of("/macronizer")),
  LIBRARY_PATH: checkPresent(PagePath.of("/library")),
  SETTINGS_PATH: checkPresent(PagePath.of("/settings")),
} satisfies Record<string, PagePath>;
