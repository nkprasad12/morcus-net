import { LewisAndShort2 } from "@/common/lewis_and_short/ls";
import * as dotenv from "dotenv";
dotenv.config();

LewisAndShort2.save(LewisAndShort2.createProcessed());
