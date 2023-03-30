/* istanbul ignore file */

import { LewisAndShort } from "@/common/lewis_and_short/ls";
import * as dotenv from "dotenv";
dotenv.config();

LewisAndShort.save(LewisAndShort.createProcessed());
