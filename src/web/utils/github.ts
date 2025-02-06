import type { ReportApiRequest } from "@/web/api_routes";

const GITHUB_ISSUES_API =
  "https://api.github.com/repos/nkprasad12/morcus-net/issues";

export namespace GitHub {
  export function createIssueBody(request: ReportApiRequest): string {
    const { commit, reportText, url } = request;
    const commitLink = `https://github.com/nkprasad12/morcus-net/commit/${commit}`;
    return [
      reportText,
      `Built at: ${commitLink}`,
      url ?? "URL Missing",
      request.userAgent ?? "UserAgent Missing",
    ].join("\n");
  }

  export async function reportIssue(
    request: ReportApiRequest,
    token: string
  ): Promise<void> {
    const firstLine = request.reportText.split("\n")[0].slice(0, 50);
    const body = {
      title: `User Report: ${firstLine}`,
      body: createIssueBody(request),
      labels: ["userReport"],
    };

    const response = await fetch(GITHUB_ISSUES_API, {
      method: "post",
      body: JSON.stringify(body),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      throw new Error("Failed to create GitHub issue!");
    }
  }
}
