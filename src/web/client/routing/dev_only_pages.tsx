/* istanbul ignore file */

import { checkPresent } from "@/common/assert";
import { SinglePageApp } from "@/web/client/components/single_page_app";
import { PagePath } from "@/web/client/router/paths";

const MORCEUS_HELPER_PATH = checkPresent(PagePath.of("/morceusHelper"));

function MorceusHelper() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        justifyContent: "left",
      }}>
      <iframe src="https://logeion.uchicago.edu/abarcet" />
      <div>Hi</div>
    </div>
  );
}

export const MORCEUS_HELPER_PAGE: SinglePageApp.Page = {
  Content: MorceusHelper,
  paths: [MORCEUS_HELPER_PATH],
  appBarConfig: {
    name: "MorceusHelper",
    targetPath: MORCEUS_HELPER_PATH.path,
  },
};

export const DEV_ONLY_PAGES = [MORCEUS_HELPER_PAGE];
