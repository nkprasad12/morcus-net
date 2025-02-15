import { ReportApi, type ReportApiRequest } from "@/web/api_routes";
import { getCommitHash } from "@/web/client/define_vars";
import { callApi } from "@/web/utils/rpc/client_rpc";

export function reportIssue(reportText: string, tags?: string[]) {
  const request: ReportApiRequest = {
    reportText,
    commit: getCommitHash() ?? "undefined",
    url: window.location.href,
    userAgent: navigator ? navigator?.userAgent : undefined,
    tags,
  };
  callApi(ReportApi, request).catch(() => {});
}
