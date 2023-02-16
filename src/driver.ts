import { readFile } from "@/common/perseus_parser";
import { startServer } from "@/server/main";

const DBG_ROOT =
  "texts/latin/perseus/data/phi0448/phi001/phi0448.phi001.perseus-lat2.xml";

const content = readFile(DBG_ROOT).toString();
startServer(content);
