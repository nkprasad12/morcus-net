import { diffWordsWithSpace } from "diff";
import type { ReportApiRequest } from "@/web/api_routes";

const GITHUB_ISSUES_API =
  "https://api.github.com/repos/nkprasad12/morcus-net/issues";

export namespace GitHub {
  export function createIssueBody(request: ReportApiRequest): string {
    const { commit, reportText, url, editedText } = request;
    const commitLink = `https://github.com/nkprasad12/morcus-net/commit/${commit}`;

    const sections = [];
    if (reportText) {
      sections.push(reportText);
    }
    if (editedText) {
      const diff = diffWordsWithSpace(editedText.original, editedText.edited);
      const diffText = diff
        .map((part) => {
          if (part.added) {
            return `**${part.value}**`;
          }
          if (part.removed) {
            return `~~${part.value}~~`;
          }
          return part.value;
        })
        .join("");

      sections.push(`**Original Text**: ${editedText.original}`);
      sections.push(`**Edited Text**: ${editedText.edited}`);
      sections.push(`**Diff**: ${diffText}`);
      sections.push(`**Section ID**: ${editedText.sectionId}`);
    }

    return [
      ...sections,
      `Built at: ${commitLink}`,
      url ?? "URL Missing",
      request.userAgent ?? "UserAgent Missing",
    ].join("\n");
  }

  export async function reportIssue(
    request: ReportApiRequest,
    token: string
  ): Promise<void> {
    let titlePrefix = "User Report";
    let firstLine = "";

    if (request.reportText) {
      firstLine = request.reportText.split("\n")[0].slice(0, 50);
    } else if (request.editedText) {
      titlePrefix = "User Edit";
      firstLine = `${
        request.editedText.sectionId
      }: ${request.editedText.edited.slice(0, 40)}`;
    }

    const body = {
      title: `${titlePrefix}: ${firstLine}`,
      body: createIssueBody(request),
      labels: ["userReport", ...(request.tags ?? [])],
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
