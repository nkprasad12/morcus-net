/* istanbul ignore file */

import * as dotenv from "dotenv";
dotenv.config();

import { printUniqueElementsMatching } from "@/common/lewis_and_short/ls_scripts";

printUniqueElementsMatching((node) => node.name === "usg");
