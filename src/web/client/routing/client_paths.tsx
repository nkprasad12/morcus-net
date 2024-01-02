import { checkPresent } from "@/common/assert";
import { PagePath } from "@/web/client/router/paths";

export namespace ClientPaths {
  export const WORK_PAGE = checkPresent(PagePath.of("/work/:workId"));
  export const WORK_BY_NAME = checkPresent(PagePath.of("/work/:author/:name"));
  export const EXTERNAL_CONTENT_READER = checkPresent(
    PagePath.of("/externalReader")
  );
  export const DICT_PAGE = checkPresent(PagePath.of("/dicts"));
  export const DICT_BY_ID = checkPresent(PagePath.of("/dicts/id/:id"));
  export const ABOUT_PATH = checkPresent(PagePath.of("/about"));
  export const MACRONIZER_PATH = checkPresent(PagePath.of("/macronizer"));
  export const LIBRARY_PATH = checkPresent(PagePath.of("/library"));
  export const SETTINGS_PATH = checkPresent(PagePath.of("/settings"));
}
