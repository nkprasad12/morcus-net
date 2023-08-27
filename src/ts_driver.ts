/* istanbul ignore file */

import { parseTeiXml } from "@/common/xml/xml_files";
import * as dotenv from "dotenv";

dotenv.config();

const DOC_PATH =
  "/home/nitin/Downloads/raw.githubusercontent.com_PerseusDL_canonical-latinLit_master_data_phi0690_phi001_phi0690.phi001.perseus-lat2.xml";

const startTime = performance.now();

const root = parseTeiXml(DOC_PATH);
console.log(root);

const runtime = Math.round(performance.now() - startTime);
console.log(`Runtime: ${runtime} ms.`);
