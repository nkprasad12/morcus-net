import { ReportApi, type ReportApiRequest } from "@/web/api_routes";
import { getCommitHash } from "@/web/client/define_vars";
import { callApi } from "@/web/utils/rpc/client_rpc";

type ReportIssueParams =
  | ReportApiRequest["reportText"]
  | ReportApiRequest["editedText"];

export function reportIssue(
  params: Exclude<ReportIssueParams, undefined>,
  tags?: string[]
) {
  const request: ReportApiRequest = {
    reportText: typeof params === "string" ? params : undefined,
    editedText: typeof params !== "string" ? params : undefined,
    commit: getCommitHash() ?? "undefined",
    url: window.location.href,
    userAgent: navigator ? navigator?.userAgent : undefined,
    tags,
  };
  callApi(ReportApi, request).catch(() => {});
}
