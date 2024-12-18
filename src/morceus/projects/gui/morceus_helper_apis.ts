/* istanbul ignore file */

import { isAny, isArray, isString } from "@/web/utils/rpc/parsing";
import type { ApiRoute } from "@/web/utils/rpc/rpc";

export const IsLsButNotMorceus: ApiRoute<any, string[]> = {
  path: "/api/lsButNotMorceus",
  method: "GET",
  inputValidator: isAny,
  outputValidator: isArray(isString),
};
