/* istanbul ignore file */

import * as dotenv from "dotenv";
import { printElementsMatching } from "./common/lewis_and_short/ls_scripts";
dotenv.config();

// import { displayEntryFree } from "@/common/lewis_and_short/ls_display";
// import { parseEntries } from "@/common/lewis_and_short/ls_parser";

// import { printUniqueElementsMatching } from "@/common/lewis_and_short/ls_scripts";
// printUniqueElementsMatching((node) => node.name === "usg");

// const SAMPLE_ENTRY = `<entryFree key="canaba" type="main" id="n6427"><orth lang="la" extent="full">cānăba</orth> (or <orth lang="la" extent="full">cannăba</orth>), <itype>ae</itype>, <gen>f.</gen> <etym>kindr. with <foreign lang="greek">κάναβος</foreign> and <foreign lang="greek">κάννα</foreign>; acc. to others, with <foreign lang="greek">καλύβη</foreign></etym>, <sense level="1" n="I" id="n6427.0"><hi rend="ital">a hovel</hi>, <hi rend="ital">hut</hi>, <bibl n="August. Serm. 61"><author>Aug.</author> Serm. 61</bibl>, de Temp.; <bibl><author>Inscr. Orell.</author> 39</bibl>; <bibl>4077</bibl>.</sense></entryFree>`;
// console.log(displayEntryFree(parseEntries([SAMPLE_ENTRY])[0]));

printElementsMatching((node) => {
  // if (node.name !== "entryFree") {
  //   return false;
  // }
  // let lastSense = false;
  // for (const child of node.children) {
  //   if (typeof child === "string") {
  //     lastSense = false;
  //     continue;
  //   }
  //   if (child.name === "sense") {
  //     lastSense = true;
  //     // continue;
  //     return true;
  //   }
  //   if (lastSense) {
  //     return true;
  //   }
  //   lastSense = false;
  // }
  // return false;
  if (node.name !== "sense") {
    return false;
  }
  const attrs = new Map(node.attrs);
  if (!attrs.has("level")) {
    return true;
  }
  if (!attrs.has("n")) {
    return true;
  }
  return false;
}, 10);
