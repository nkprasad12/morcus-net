/* istanbul ignore file */

import * as dotenv from "dotenv";
// import { unmatched } from "@/common/smith_and_hall/sh_abbreviations";
import { generateShArtifacts } from "@/common/smith_and_hall/sh_generate";

dotenv.config();

const startTime = performance.now();
generateShArtifacts().then(() => {
  const runTime = Math.round(performance.now() - startTime);
  console.log(`Smith and Hall runtime: ${runTime} ms.`);
  // for (const [author, cits] of unmatched) {
  //   console.log(author);
  //   console.log("=\n=\n=\n");
  //   for (const cit of cits) {
  //     console.log(cit);
  //   }
  //   console.log("=\n=\n=\n=\n=\n=\n");
  // }
});
