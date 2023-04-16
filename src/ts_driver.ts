/* istanbul ignore file */

import * as dotenv from "dotenv";
import { printUnhandledOrths } from "./common/lewis_and_short/ls_scripts";
dotenv.config();

printUnhandledOrths();
